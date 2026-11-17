// NEON HARBOR — cars. A boxy car-mesh factory, arcade driving physics
// for the player's car, traffic that follows the road grid, police
// cruisers that chase by wanted level, cops on foot — and the Manhattan
// grid autopilot the screenshot staging uses (never steer straight at a
// target; that drives through buildings).

import {
  CITY, ROADS, CAR, TRAFFIC_COUNT, PARKED_COUNT,
  mulberry32, clamp, lerp, angleDiff, dist2, randomRoadPoint,
} from './config.js';
import { makePersonMesh } from './peds.js';

const PAINTS = [0x3a6fd8, 0xd8a03a, 0x4ad87a, 0xd84a5a, 0x9a4ad8, 0xe0e0e0, 0x2a2f45, 0x4ad8c8];

function wheelSet() {
  const geo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  const mat = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.9 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const steer = new THREE.Group();
    steer.position.set(x, 0.36, z);
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(geo, mat);
    tyre.rotation.z = Math.PI / 2;
    tyre.castShadow = true;
    spin.add(tyre);
    steer.add(spin);
    wheels.push({ steer, spin, front: z > 0 });
  }
  return wheels;
}

export function makeCarMesh(color, police = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.15, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.65, 4.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1), glassMat);
  cabin.position.set(0, 1.12, -0.25);
  cabin.castShadow = true;
  g.add(body);
  g.add(cabin);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 1.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xaa1010, emissive: 0xd81a1a, emissiveIntensity: 1.0 });
  for (const x of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.06), headMat);
    h.position.set(x, 0.62, 2.21);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.06), tailMat);
    t.position.set(x, 0.62, -2.21);
    g.add(t);
  }
  let lightBar = null;
  if (police) {
    const redMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0xff0000, emissiveIntensity: 2 });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x0000cc, emissive: 0x2244ff, emissiveIntensity: 2 });
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    barBase.position.set(0, 1.45, -0.25);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.4), redMat);
    red.position.set(-0.38, 1.55, -0.25);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.4), blueMat);
    blue.position.set(0.38, 1.55, -0.25);
    g.add(barBase);
    g.add(red);
    g.add(blue);
    lightBar = { red, blue, redMat, blueMat };
  }
  const wheels = wheelSet();
  for (const w of wheels) g.add(w.steer);
  g.userData = { bodyMat, wheels, lightBar };
  return g;
}

function syncCarMesh(car) {
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  for (const w of car.mesh.userData.wheels) {
    w.spin.rotation.x += (car.speed * 0.016) / 0.36;
  }
}

// Arcade driving for the player's car.
// input: { fwd (0..1), back (0..1), steer (-1..1), handbrake (bool) }
// Returns { hit } — hit is true when the car smacked a building/park.
export function drivePlayerCar(car, input, dt, city) {
  const speedFactor = 1 - Math.min(Math.abs(car.speed) / CAR.maxSpeed, 1) * 0.6;
  let steerAngle = input.steer * CAR.maxSteer * speedFactor;
  if (input.handbrake) steerAngle *= CAR.handbrakeTurn;
  if (input.fwd > 0) car.speed += CAR.accel * input.fwd * dt;
  if (input.back > 0) {
    if (car.speed > 0.5) car.speed -= CAR.brake * input.back * dt;
    else car.speed -= CAR.reverse * input.back * dt;
  }
  if (input.handbrake) car.speed -= car.speed * Math.min(1, dt * 2.2);
  // Rolling drag + a little grip so the car stops on its own.
  car.speed -= car.speed * Math.min(1, dt * 0.35);
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
  const turnRate = (car.speed / 2.8) * Math.tan(steerAngle);
  car.heading += turnRate * dt;
  const ox = car.x;
  const oz = car.z;
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  car.x = clamp(car.x, -298, 298);
  car.z = clamp(car.z, -298, 298);
  const hit = city.resolveCircleCars(car, 1.9);
  if (hit) {
    const moved = Math.hypot(car.x - ox, car.z - oz);
    const expected = Math.abs(car.speed) * dt;
    if (expected - moved > 0.02 && Math.abs(car.speed) > 4) {
      car.speed *= -0.25;
      syncCarMesh(car);
      return { hit: true };
    }
  }
  for (const w of car.mesh.userData.wheels) {
    if (w.front) w.steer.rotation.y = steerAngle * 0.55;
  }
  syncCarMesh(car);
  return { hit: false };
}

// ---------------------------------------------------------------- traffic

function headingOf(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

export function createTraffic(city, scene, seed = 7) {
  const rng = mulberry32(seed + 7);
  const cars = [];
  const parked = [];

  function spawnTraffic() {
    const p = randomRoadPoint(rng);
    // randomRoadPoint returns a point exactly on a road: if x is a road
    // value the car is on a vertical road (it travels along z).
    const onVertical = ROADS.some((r) => Math.abs(p.x - r) < 0.01);
    const axis = onVertical ? 'z' : 'x';
    const road = axis === 'z' ? p.x : p.z;
    const dir = rng() < 0.5 ? 1 : -1;
    const offset = (rng() < 0.5 ? -1 : 1) * CITY.lane;
    const mesh = makeCarMesh(PAINTS[Math.floor(rng() * PAINTS.length)]);
    scene.add(mesh);
    const car = {
      mesh, kind: 'traffic',
      x: axis === 'z' ? road + offset : p.x,
      z: axis === 'x' ? road + offset : p.z,
      heading: headingOf(axis, dir),
      speed: 0,
      cruise: 9 + rng() * 4,
      axis, road, dir, offset,
      turnCd: 2 + rng() * 3,
    };
    cars.push(car);
    return car;
  }

  for (let i = 0; i < TRAFFIC_COUNT; i++) spawnTraffic();

  for (let i = 0; i < PARKED_COUNT; i++) {
    const p = randomRoadPoint(rng);
    const alongRoad = rng() < 0.5;
    const road = alongRoad ? p.x : p.z;
    const off = (rng() < 0.5 ? -1 : 1) * (CITY.roadWidth / 2 - 1.2);
    const mesh = makeCarMesh(PAINTS[Math.floor(rng() * PAINTS.length)]);
    scene.add(mesh);
    const car = {
      mesh, kind: 'parked',
      x: alongRoad ? road + off : p.x,
      z: alongRoad ? p.z : road + off,
      heading: alongRoad ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
      speed: 0,
    };
    parked.push(car);
    syncCarMesh(car);
  }

  function carAhead(car, others, maxD) {
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    for (const o of others) {
      if (o === car) continue;
      const dx = o.x - car.x;
      const dz = o.z - car.z;
      const along = dx * fx + dz * fz;
      if (along <= 0 || along > maxD) continue;
      const lat = Math.abs(dx * fz - dz * fx);
      if (lat < 3.2) return o;
    }
    return null;
  }

  function update(dt, playerCar) {
    const all = playerCar ? [...cars, playerCar] : cars;
    for (const car of cars) {
      car.turnCd -= dt;
      let target = car.cruise;
      if (carAhead(car, all, 13)) target = 3;
      if (playerCar && carAhead(car, [playerCar], 10)) target = 2;
      car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
      // Move along the current road, holding the lane offset.
      if (car.axis === 'x') {
        car.x += car.dir * car.speed * dt;
        car.z = car.road + car.offset;
      } else {
        car.z += car.dir * car.speed * dt;
        car.x = car.road + car.offset;
      }
      // Intersection: maybe turn.
      const moving = car.axis === 'x' ? car.x : car.z;
      let nearRoad = null;
      let nearD = 1.2;
      for (const r of ROADS) {
        const d = Math.abs(moving - r);
        if (d < nearD) {
          nearD = d;
          nearRoad = r;
        }
      }
      if (nearRoad !== null && car.turnCd <= 0 && rng() < 0.25) {
        const roll = rng();
        if (roll < 0.12) {
          car.dir *= -1; // U-turn
        } else {
          // Turn onto the crossing road.
          const newAxis = car.axis === 'x' ? 'z' : 'x';
          const newDir = rng() < 0.5 ? 1 : -1;
          if (newAxis === 'x') {
            car.road = nearRoad;
            car.z = nearRoad + (newDir > 0 ? CITY.lane : -CITY.lane);
            car.offset = newDir > 0 ? CITY.lane : -CITY.lane;
          } else {
            car.road = nearRoad;
            car.x = nearRoad + (newDir > 0 ? -CITY.lane : CITY.lane);
            car.offset = newDir > 0 ? -CITY.lane : CITY.lane;
          }
          car.axis = newAxis;
          car.dir = newDir;
        }
        car.heading = headingOf(car.axis, car.dir);
        car.turnCd = 3;
      }
      // Out of bounds: turn around.
      if (Math.abs(car.x) > 295 || Math.abs(car.z) > 295) {
        car.dir *= -1;
        car.heading = headingOf(car.axis, car.dir);
        car.turnCd = 2;
        car.x = clamp(car.x, -295, 295);
        car.z = clamp(car.z, -295, 295);
      }
      city.resolveCircleCars(car, 1.9);
      syncCarMesh(car);
    }
    // Car-vs-car: push apart, swap 40% of speed.
    if (playerCar) {
      for (const car of cars) {
        const dx = playerCar.x - car.x;
        const dz = playerCar.z - car.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.01 && d < 3.6) {
          const push = (3.6 - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          playerCar.x += nx * push;
          playerCar.z += nz * push;
          car.x -= nx * push;
          car.z -= nz * push;
          const ps = playerCar.speed;
          playerCar.speed = ps * 0.6 + car.speed * 0.4;
          car.speed = car.speed * 0.6 + ps * 0.4;
          syncCarMesh(playerCar);
          syncCarMesh(car);
        }
      }
    }
  }

  return { cars, parked, update };
}

// ---------------------------------------------------------------- police

export function createPolice(city, scene, seed = 7) {
  const rng = mulberry32(seed + 31);
  const cruisers = [];
  const cops = [];
  let flashT = 0;

  function spawnCruiser(px, pz) {
    for (let tries = 0; tries < 10; tries++) {
      const p = randomRoadPoint(rng);
      const d = dist2(p.x, p.z, px, pz);
      if (d < 45 || d > 90) continue;
      const mesh = makeCarMesh(0xe9e9e9, true);
      scene.add(mesh);
      const cruiser = {
        mesh, kind: 'police',
        x: p.x, z: p.z,
        heading: rng() * Math.PI * 2,
        speed: 0,
        bustT: 0,
      };
      cruisers.push(cruiser);
      syncCarMesh(cruiser);
      return cruiser;
    }
    return null;
  }

  function spawnCop(x, z) {
    const mesh = makePersonMesh(0x1a2a55, 0xc98a5a);
    scene.add(mesh);
    const cop = {
      mesh, x, z, heading: 0, speed: 5.2, bustT: 0, walkPhase: rng() * 6,
    };
    cops.push(cop);
    return cop;
  }

  function removeCruiser(c) {
    scene.remove(c.mesh);
    const i = cruisers.indexOf(c);
    if (i >= 0) cruisers.splice(i, 1);
  }

  function removeCop(c) {
    scene.remove(c.mesh);
    const i = cops.indexOf(c);
    if (i >= 0) cops.splice(i, 1);
  }

  // G: { player, playerCar, wanted, onBusted, onRamDamage }
  function update(dt, G) {
    flashT += dt;
    const target = G.wanted > 0 ? Math.min(1 + G.wanted, 6) : 0;
    while (cruisers.length < target) {
      if (!spawnCruiser(G.player.x, G.player.z)) break;
    }
    while (cruisers.length > target) removeCruiser(cruisers[cruisers.length - 1]);

    const px = G.playerCar ? G.playerCar.x : G.player.x;
    const pz = G.playerCar ? G.playerCar.z : G.player.z;
    const playerSpeed = G.playerCar ? Math.abs(G.playerCar.speed) : Math.abs(G.player.speed);

    for (const c of cruisers) {
      const dx = px - c.x;
      const dz = pz - c.z;
      const d = Math.hypot(dx, dz) || 0.001;
      const wantH = Math.atan2(dx, dz);
      const turn = clamp(angleDiff(wantH, c.heading), -1.9 * dt, 1.9 * dt);
      c.heading += turn;
      const top = 15 + 2.4 * G.wanted;
      let goal = top;
      if (d < 10) goal = Math.min(top, playerSpeed + 3);
      c.speed += (goal - c.speed) * Math.min(1, dt * 1.2);
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      c.x = clamp(c.x, -298, 298);
      c.z = clamp(c.z, -298, 298);
      if (city.resolveCircleCars(c, 1.9) && Math.abs(c.speed) > 6) c.speed *= -0.25;
      // Ram damage while touching the player.
      if (d < 3.2) G.onRamDamage(dt);
      // Cop gets out when the player is on foot and the cruiser is close.
      if (!G.playerCar && d < 12 && cops.length < 2 + G.wanted) {
        spawnCop(c.x, c.z);
      }
      // Flash the light bar, red/blue alternating every 0.25 s.
      const lb = c.mesh.userData.lightBar;
      if (lb) {
        const phase = Math.floor(flashT / 0.25) % 2 === 0;
        lb.redMat.emissiveIntensity = phase ? 2.4 : 0.25;
        lb.blueMat.emissiveIntensity = phase ? 0.25 : 2.4;
      }
      // Don't plough through the player's car.
      if (G.playerCar) {
        const pdx = G.playerCar.x - c.x;
        const pdz = G.playerCar.z - c.z;
        const pd = Math.hypot(pdx, pdz);
        if (pd > 0.01 && pd < 3.6) {
          const push = (3.6 - pd) / 2;
          const nx = pdx / pd;
          const nz = pdz / pd;
          G.playerCar.x += nx * push;
          G.playerCar.z += nz * push;
          c.x -= nx * push;
          c.z -= nz * push;
          const ps = G.playerCar.speed;
          G.playerCar.speed = ps * 0.6 + c.speed * 0.4;
          c.speed = c.speed * 0.6 + ps * 0.4;
          syncCarMesh(G.playerCar);
        }
      }
      syncCarMesh(c);
    }

    // Cops on foot chase the player.
    for (const cop of [...cops]) {
      const dx = G.player.x - cop.x;
      const dz = G.player.z - cop.z;
      const d = Math.hypot(dx, dz) || 0.001;
      if (G.playerCar || d > 80) {
        removeCop(cop);
        continue;
      }
      const wantH = Math.atan2(dx, dz);
      cop.heading += clamp(angleDiff(wantH, cop.heading), -3 * dt, 3 * dt);
      cop.x += Math.sin(cop.heading) * cop.speed * dt;
      cop.z += Math.cos(cop.heading) * cop.speed * dt;
      city.resolveCircle(cop, 0.5);
      cop.walkPhase += dt * 10;
      const swing = Math.sin(cop.walkPhase) * 0.6;
      cop.mesh.userData.legL.rotation.x = swing;
      cop.mesh.userData.legR.rotation.x = -swing;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
      if (d < 1.6) {
        cop.bustT += dt;
        if (cop.bustT > 1.5) {
          G.onBusted();
          return;
        }
      } else {
        cop.bustT = 0;
      }
    }
  }

  function clearAll() {
    for (const c of [...cruisers]) removeCruiser(c);
    for (const c of [...cops]) removeCop(c);
  }

  return { cruisers, cops, update, clearAll, spawnCruiser, spawnCop };
}

// ---------------------------------------------------------------- autopilot

// Manhattan grid driving for the screenshot staging: drive along the
// current road toward the target's road, turn only at intersections,
// handbrake when the turn is sharp, reverse briefly if stuck.
export function autopilotDrive(car, target, dt, city, st) {
  const dx = target.x - car.x;
  const dz = target.z - car.z;
  if (Math.hypot(dx, dz) < 4) {
    drivePlayerCar(car, { fwd: 0, back: 1, steer: 0, handbrake: false }, dt, city);
    return;
  }
  // Which roads is the car on? (within 3 m of a centre line)
  let onV = null;
  let onH = null;
  for (const r of ROADS) {
    if (Math.abs(car.x - r) < 3) onV = r;
    if (Math.abs(car.z - r) < 3) onH = r;
  }
  // Nearest road to the target on each axis.
  let nearVx = ROADS[0];
  let nearHz = ROADS[0];
  for (const r of ROADS) {
    if (Math.abs(r - target.x) < Math.abs(nearVx - target.x)) nearVx = r;
    if (Math.abs(r - target.z) < Math.abs(nearHz - target.z)) nearHz = r;
  }
  let desired;
  if (onH !== null && Math.abs(dx) > 8) {
    desired = dx > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else if (onV !== null && Math.abs(dz) > 8) {
    desired = dz > 0 ? 0 : Math.PI;
  } else if (Math.abs(dx) > 8) {
    // On a vertical road, need to move in x: drive toward the target's road.
    desired = nearHz > car.z ? 0 : Math.PI;
    if (Math.abs(car.z - nearHz) < 5) desired = dx > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    desired = nearVx > car.x ? Math.PI / 2 : -Math.PI / 2;
    if (Math.abs(car.x - nearVx) < 5) desired = dz > 0 ? 0 : Math.PI;
  }
  const diff = angleDiff(desired, car.heading);
  const steer = clamp(diff * 1.6, -1, 1);
  const sharp = Math.abs(diff) > 0.6;
  // Stuck detection: barely moving while trying to drive.
  if (Math.abs(car.speed) < 1.5) st.stuckT += dt;
  else st.stuckT = 0;
  if (st.reverseT > 0) {
    st.reverseT -= dt;
    drivePlayerCar(car, { fwd: 0, back: 1, steer: -steer, handbrake: false }, dt, city);
    return;
  }
  if (st.stuckT > 1.5) {
    st.stuckT = 0;
    st.reverseT = 0.9;
    return;
  }
  drivePlayerCar(
    car,
    { fwd: sharp ? 0 : 1, back: 0, steer, handbrake: sharp },
    dt,
    city,
  );
}

export { lerp };
