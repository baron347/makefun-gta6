// NEON HARBOR — cars. A boxy car-mesh factory, arcade driving physics
// for the player's car, traffic that follows the road grid, police
// cruisers that chase by wanted level, cops on foot — and the Manhattan
// grid autopilot the screenshot staging uses (never steer straight at a
// target; that drives through buildings).

import {
  CITY, ROADS, CAR, TRAFFIC_COUNT, PARKED_COUNT, nearestRoad,
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

export function makeCarMesh(color, police = false, variant = 'sedan') {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.15, metalness: 0.7 });
  // Variant dimensions: van is tall/long, sport is low/wide with a spoiler,
  // taxi is a sedan with a roof sign. Sedan is the default box.
  const dims = variant === 'van'
    ? { w: 2.1, bodyH: 1.15, bodyY: 0.82, len: 5.4, cabinW: 1.9, cabinH: 0.7, cabinY: 1.7, cabinZ: -0.1, cabinL: 2.6 }
    : variant === 'sport'
      ? { w: 2.15, bodyH: 0.5, bodyY: 0.45, len: 4.4, cabinW: 1.6, cabinH: 0.42, cabinY: 0.9, cabinZ: -0.3, cabinL: 1.7 }
      : { w: 2, bodyH: 0.65, bodyY: 0.55, len: 4.4, cabinW: 1.7, cabinH: 0.55, cabinY: 1.12, cabinZ: -0.25, cabinL: 2.1 };
  const body = new THREE.Mesh(new THREE.BoxGeometry(dims.w, dims.bodyH, dims.len), bodyMat);
  body.position.y = dims.bodyY;
  body.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(dims.cabinW, dims.cabinH, dims.cabinL), glassMat);
  cabin.position.set(0, dims.cabinY, dims.cabinZ);
  cabin.castShadow = true;
  g.add(body);
  g.add(cabin);
  if (variant === 'sport') {
    const spoiler = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.08, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.4, metalness: 0.6 }),
    );
    spoiler.position.set(0, dims.bodyY + 0.55, -dims.len / 2 + 0.15);
    g.add(spoiler);
  }
  if (variant === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.22, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 1.4 }),
    );
    sign.position.set(0, dims.cabinY + 0.4, dims.cabinZ);
    g.add(sign);
  }
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 1.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xaa1010, emissive: 0xd81a1a, emissiveIntensity: 1.0 });
  for (const x of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.06), headMat);
    h.position.set(x, dims.bodyY + 0.07, dims.len / 2 + 0.01);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.06), tailMat);
    t.position.set(x, dims.bodyY + 0.07, -dims.len / 2 - 0.01);
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
  g.userData = { bodyMat, wheels, lightBar, variant };
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

  // Vehicle mix: taxi (yellow + roof sign), van/truck (tall, slow),
  // sport (low, spoiler, fast), sedan (default). Each variant drives
  // at its own cruise speed.
  function pickVariant() {
    const r = rng();
    if (r < 0.14) return 'taxi';
    if (r < 0.28) return 'van';
    if (r < 0.42) return 'sport';
    return 'sedan';
  }

  function cruiseFor(variant) {
    if (variant === 'sport') return 12 + rng() * 5;
    if (variant === 'van') return 7 + rng() * 2.5;
    return 9 + rng() * 4;
  }

  function spawnTraffic() {
    const p = randomRoadPoint(rng);
    // randomRoadPoint returns a point exactly on a road: if x is a road
    // value the car is on a vertical road (it travels along z).
    const onVertical = ROADS.some((r) => Math.abs(p.x - r) < 0.01);
    const axis = onVertical ? 'z' : 'x';
    const road = axis === 'z' ? p.x : p.z;
    const dir = rng() < 0.5 ? 1 : -1;
    const offset = (rng() < 0.5 ? -1 : 1) * CITY.lane;
    const variant = pickVariant();
    const color = variant === 'taxi' ? 0xf2c200 : PAINTS[Math.floor(rng() * PAINTS.length)];
    const mesh = makeCarMesh(color, false, variant);
    scene.add(mesh);
    const car = {
      mesh, kind: 'traffic', variant,
      x: axis === 'z' ? road + offset : p.x,
      z: axis === 'x' ? road + offset : p.z,
      heading: headingOf(axis, dir),
      speed: 0,
      cruise: cruiseFor(variant),
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
    const variant = rng() < 0.2 ? 'van' : 'sedan';
    const mesh = makeCarMesh(PAINTS[Math.floor(rng() * PAINTS.length)], false, variant);
    scene.add(mesh);
    const car = {
      mesh, kind: 'parked', variant,
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
  const roadblockCars = [];
  let rbPairs = [];
  let rbT = 0;
  let flashT = 0;
  let copFireT = 0;
  let heliObj = null;
  let heliAngle = 0;

  // ---- roadblocks: pairs of cruisers parked sideways across the road
  // ahead of the player while wanted >= 3 (1 pair, 2 pairs at 5 stars).
  function placeRoadblock(px, pz, heading, ahead) {
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const n = nearestRoad(px + fx * ahead, pz + fz * ahead);
    const cars = [];
    const mk = (x, z, h) => {
      const mesh = makeCarMesh(0xe9e9e9, true);
      scene.add(mesh);
      const c = { mesh, kind: 'roadblock', x, z, heading: h, speed: 0 };
      syncCarMesh(c);
      cars.push(c);
      roadblockCars.push(c);
      return c;
    };
    if (n.along === 'z') {
      mk(n.x - 3.4, n.z, Math.PI / 2);
      mk(n.x + 3.4, n.z, Math.PI / 2);
    } else {
      mk(n.x, n.z - 3.4, 0);
      mk(n.x, n.z + 3.4, 0);
    }
    return { cars, cx: (cars[0].x + cars[1].x) / 2, cz: (cars[0].z + cars[1].z) / 2 };
  }

  function clearRoadblocks() {
    for (const c of roadblockCars) scene.remove(c.mesh);
    roadblockCars.length = 0;
    rbPairs = [];
  }

  function updateRoadblocks(dt, G) {
    rbT += dt;
    const wantPairs = G.wanted >= 5 ? 2 : G.wanted >= 3 ? 1 : 0;
    if (wantPairs === 0) {
      if (rbPairs.length) clearRoadblocks();
      return;
    }
    const px = G.playerCar ? G.playerCar.x : G.player.x;
    const pz = G.playerCar ? G.playerCar.z : G.player.z;
    const heading = G.playerCar ? G.playerCar.heading : G.player.heading;
    let stale = rbPairs.length !== wantPairs || rbT > 4;
    if (!stale) {
      for (const p of rbPairs) {
        if (dist2(px, pz, p.cx, p.cz) > 75) { stale = true; break; }
      }
    }
    if (stale) {
      clearRoadblocks();
      for (let i = 0; i < wantPairs; i++) {
        rbPairs.push(placeRoadblock(px, pz, heading, 42 + i * 55));
      }
      rbT = 0;
    }
    // Flash the roadblock light bars with the cruisers.
    const phase = Math.floor(flashT / 0.25) % 2 === 0;
    for (const c of roadblockCars) {
      const lb = c.mesh.userData.lightBar;
      if (lb) {
        lb.redMat.emissiveIntensity = phase ? 2.4 : 0.25;
        lb.blueMat.emissiveIntensity = phase ? 0.25 : 2.4;
      }
    }
  }

  // ---- police helicopter: AI only, never flyable. Appears at wanted
  // >= 4, orbits the player with a spinning rotor and a spotlight.
  function buildHeli() {
    const group = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xe9e9e9, roughness: 0.4, metalness: 0.3 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x1a2a55, roughness: 0.4, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 4.2), white);
    body.castShadow = true;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.4, 4.24), blue);
    stripe.position.y = -0.2;
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.7, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.15, metalness: 0.7 }),
    );
    glass.position.set(0, 0.3, 1.6);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.5), white);
    tail.position.set(0, 0.3, -4);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.4, 1), blue);
    fin.position.set(0, 0.9, -6);
    const rotor = new THREE.Group();
    const bladeGeo = new THREE.BoxGeometry(9, 0.08, 0.5);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.6 });
    const b1 = new THREE.Mesh(bladeGeo, bladeMat);
    const b2 = new THREE.Mesh(bladeGeo, bladeMat);
    b2.rotation.y = Math.PI / 2;
    rotor.add(b1);
    rotor.add(b2);
    rotor.position.y = 1.1;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8), bladeMat);
    mast.position.y = 0.7;
    // Translucent spotlight cone under the heli (apex at the heli).
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(6, 30, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
    );
    cone.position.y = -16;
    const spot = new THREE.SpotLight(0xfff2c0, 60, 60, 0.35, 0.5);
    spot.position.set(0, 0, 0);
    scene.add(spot.target);
    group.add(body, stripe, glass, tail, fin, mast, rotor, cone, spot);
    group.visible = false;
    scene.add(group);
    return { group, rotor, spot };
  }

  function updateHeli(dt, G) {
    if (!heliObj) heliObj = buildHeli();
    if (G.wanted < 4) {
      heliObj.group.visible = false;
      return;
    }
    const px = G.playerCar ? G.playerCar.x : G.player.x;
    const pz = G.playerCar ? G.playerCar.z : G.player.z;
    heliObj.group.visible = true;
    heliAngle += dt * 0.22;
    heliObj.group.position.set(px + Math.cos(heliAngle) * 26, 34, pz + Math.sin(heliAngle) * 26);
    heliObj.group.lookAt(px, 0, pz);
    heliObj.rotor.rotation.y += dt * 22;
    heliObj.spot.target.position.set(px, 0, pz);
  }

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

    updateRoadblocks(dt, G);
    updateHeli(dt, G);
    // Roadblock cruisers are solid to the player's car.
    if (G.playerCar) {
      for (const c of roadblockCars) {
        const pdx = G.playerCar.x - c.x;
        const pdz = G.playerCar.z - c.z;
        const pd = Math.hypot(pdx, pdz);
        if (pd > 0.01 && pd < 3.6) {
          const push = (3.6 - pd) / 2;
          const nx = pdx / pd;
          const nz = pdz / pd;
          G.playerCar.x += nx * push;
          G.playerCar.z += nz * push;
          G.playerCar.speed *= 0.5;
          syncCarMesh(G.playerCar);
        }
      }
    }

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

    // Cops on foot fire at the player on foot (visual tracer, no damage
    // — the bust timer is still what catches you).
    copFireT -= dt;
    if (copFireT <= 0 && G.wanted >= 3 && !G.playerCar && G.policeShot) {
      const near = cops.find((c) => dist2(c.x, c.z, G.player.x, G.player.z) < 28);
      if (near) {
        G.policeShot(
          { x: near.x, z: near.z },
          { x: G.player.x + (rng() - 0.5) * 3, z: G.player.z + (rng() - 0.5) * 3 },
        );
        copFireT = 2 + rng() * 1.5;
      } else {
        copFireT = 0.5;
      }
    }
  }

  function clearAll() {
    for (const c of [...cruisers]) removeCruiser(c);
    for (const c of [...cops]) removeCop(c);
    clearRoadblocks();
    if (heliObj) heliObj.group.visible = false;
  }

  return { cruisers, cops, roadblocks: roadblockCars, update, clearAll, spawnCruiser, spawnCop };
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

// ---- crash smoke: a small pool of grey puffs that grow and fade.
// Puffs are sprites, so they read from any angle at screenshot scale.
export function createSmoke(scene) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g2 = c.getContext('2d');
  const grad = g2.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(200,200,200,0.85)');
  grad.addColorStop(0.6, 'rgba(160,160,160,0.45)');
  grad.addColorStop(1, 'rgba(140,140,140,0)');
  g2.fillStyle = grad;
  g2.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const puffs = [];
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
    s.visible = false;
    scene.add(s);
    puffs.push({ s, life: 0 });
  }
  let next = 0;
  function puff(x, z) {
    const p = puffs[next];
    next = (next + 1) % puffs.length;
    p.s.position.set(x, 1.2, z);
    p.s.scale.set(1.5, 1.5, 1);
    p.s.material.opacity = 0.8;
    p.s.visible = true;
    p.life = 1.2;
  }
  function update(dt) {
    for (const p of puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        continue;
      }
      const k = 1 - p.life / 1.2;
      const sc = 1.5 + k * 4;
      p.s.scale.set(sc, sc, 1);
      p.s.material.opacity = 0.8 * (1 - k);
      p.s.position.y = 1.2 + k * 2;
    }
  }
  return { puff, update };
}

export { lerp };
