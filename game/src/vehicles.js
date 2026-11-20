// NEON HARBOR — cars. A boxy car-mesh factory with four traffic
// variants (sedan, taxi, van/truck, sport) plus the police cruiser, each
// with its own shape, top speed, handling and colors; arcade driving
// physics for the player's car; grid autopilot traffic; police cruisers
// that chase by wanted level; roadblocks across the road at 3+ stars;
// and the police helicopter that orbits at 4+ stars (never flyable).

import { CITY, ROADS, CAR, WANTED, TRAFFIC_COUNT, PARKED_COUNT, mulberry32, clamp, angleDiff, dist2, nearestRoad, randomRoadPoint } from './config.js';

const T = window.THREE;

// Variant table: shape, speed, handling. Taxi is a sedan with a roof
// sign; van is long and slow; sport is low, fast and twitchy.
export const VARIANTS = {
  sedan: { len: 4.4, wid: 1.9, h: 1.25, top: 13, accel: 9, turn: 1.6, colors: [0x8a2f2f, 0x2f4a8a, 0x3a6a4a, 0x777777, 0x9a7a3a, 0x4a3a6a] },
  taxi: { len: 4.4, wid: 1.9, h: 1.25, top: 14, accel: 10, turn: 1.7, colors: [0xe8b800] },
  van: { len: 5.6, wid: 2.2, h: 2.1, top: 10, accel: 6, turn: 1.1, colors: [0xd8d8d8, 0x5a5a6a, 0x7a4a2a, 0x3a5a6a] },
  sport: { len: 4.1, wid: 2.0, h: 1.0, top: 19, accel: 14, turn: 2.2, colors: [0xd81e3a, 0xff7a00, 0x1ec8d8, 0x8a1ed8] },
  cruiser: { len: 4.6, wid: 2.0, h: 1.3, top: 17, accel: 13, turn: 2.0, colors: [0x1a1a22] },
};

export function makeCarMesh(variant, colorHex) {
  const v = VARIANTS[variant] || VARIANTS.sedan;
  const g = new T.Group();
  const bodyMat = new T.MeshStandardMaterial({ color: colorHex, roughness: 0.35, metalness: 0.55 });
  const glassMat = new T.MeshStandardMaterial({ color: 0x101828, roughness: 0.15, metalness: 0.7 });
  const body = new T.Mesh(new T.BoxGeometry(v.wid, v.h * 0.55, v.len), bodyMat);
  body.position.y = v.h * 0.42;
  body.castShadow = true;
  g.add(body);
  const cabinH = variant === 'van' ? v.h * 0.55 : v.h * 0.42;
  const cabinL = variant === 'van' ? v.len * 0.72 : v.len * 0.5;
  const cabin = new T.Mesh(new T.BoxGeometry(v.wid * 0.86, cabinH, cabinL), glassMat);
  cabin.position.set(0, v.h * 0.7 + cabinH / 2 - 0.1, variant === 'van' ? -0.2 : -0.2);
  cabin.castShadow = true;
  g.add(cabin);
  if (variant === 'sport') {
    const spoiler = new T.Mesh(new T.BoxGeometry(v.wid * 0.9, 0.08, 0.5), bodyMat);
    spoiler.position.set(0, v.h * 0.95, v.len / 2 - 0.2);
    g.add(spoiler);
  }
  if (variant === 'taxi') {
    const sign = new T.Mesh(new T.BoxGeometry(0.7, 0.28, 0.35), new T.MeshBasicMaterial({ color: 0xffe14a }));
    sign.position.set(0, v.h * 1.15, 0);
    g.add(sign);
    const checker = new T.Mesh(new T.BoxGeometry(v.wid * 1.01, 0.22, v.len * 0.9),
      new T.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
    checker.position.y = v.h * 0.55;
    g.add(checker);
  }
  if (variant === 'cruiser') {
    const stripe = new T.Mesh(new T.BoxGeometry(v.wid * 1.01, 0.3, v.len * 0.92),
      new T.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 }));
    stripe.position.y = v.h * 0.5;
    g.add(stripe);
    const bar = new T.Mesh(new T.BoxGeometry(v.wid * 0.5, 0.22, 0.5),
      new T.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 }));
    bar.position.set(0, v.h * 1.12, -0.1);
    g.add(bar);
    const red = new T.Mesh(new T.BoxGeometry(0.28, 0.16, 0.4), new T.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.28, v.h * 1.26, -0.1);
    const blue = new T.Mesh(new T.BoxGeometry(0.28, 0.16, 0.4), new T.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.set(0.28, v.h * 1.26, -0.1);
    g.add(red); g.add(blue);
    g.userData.lightRed = red;
    g.userData.lightBlue = blue;
  }
  const wheelGeo = new T.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new T.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.9 });
  for (const [wx, wz] of [[-v.wid / 2, v.len * 0.32], [v.wid / 2, v.len * 0.32], [-v.wid / 2, -v.len * 0.32], [v.wid / 2, -v.len * 0.32]]) {
    const w = new T.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w);
  }
  // Headlights.
  const hl = new T.Mesh(new T.BoxGeometry(v.wid * 0.8, 0.18, 0.1), new T.MeshBasicMaterial({ color: 0xffe9a8 }));
  hl.position.set(0, v.h * 0.45, -v.len / 2 - 0.02);
  g.add(hl);
  g.userData.bodyMat = bodyMat;
  g.userData.variant = variant;
  return g;
}

// One car entity, shared by traffic, parked cars and the player's ride.
export class Car {
  constructor(variant, colorHex) {
    this.variant = variant;
    this.mesh = makeCarMesh(variant, colorHex);
    this.x = 0; this.z = 0; this.heading = 0;
    this.speed = 0;
    this.top = (VARIANTS[variant] || VARIANTS.sedan).top;
    this.accel = (VARIANTS[variant] || VARIANTS.sedan).accel;
    this.turn = (VARIANTS[variant] || VARIANTS.sedan).turn;
    this.stolen = false;
  }

  place(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
  }

  sync() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }
}

// Arcade driving for the car the player is in. input: {up, down, left,
// right, handbrake}. Returns the impact speed when a building is hit
// (for crash sound + smoke), else 0.
export function driveCar(car, input, dt, resolveCollision) {
  const v = VARIANTS[car.variant] || VARIANTS.sedan;
  if (input.up) car.speed += v.accel * dt;
  else if (input.down) car.speed -= (car.speed > 0.5 ? CAR.brake : CAR.reverse) * dt;
  else car.speed -= Math.sign(car.speed) * 6 * dt;
  car.speed = clamp(car.speed, -CAR.maxReverse, v.top);
  if (Math.abs(car.speed) < 0.05) car.speed = 0;
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const dir = car.speed >= 0 ? 1 : -1;
  const turnRate = v.turn * (input.handbrake ? CAR.handbrakeTurn : 1) * clamp(Math.abs(car.speed) / 8, 0, 1);
  car.heading += steer * turnRate * dir * dt;
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const hit = resolveCollision ? resolveCollision(nx, nz, 1.4) : { x: nx, z: nz };
  let impact = 0;
  if (Math.abs(hit.x - nx) > 0.01 || Math.abs(hit.z - nz) > 0.01) {
    impact = Math.abs(car.speed);
    car.speed *= -0.25;
  }
  car.x = clamp(hit.x, -CITY.half, CITY.half);
  car.z = clamp(hit.z, -CITY.half, CITY.half);
  car.sync();
  return impact;
}

// --------------------------------------------------------------- traffic
export class Traffic {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = mulberry32(seed + 11);
    this.cars = [];
    this.parked = [];
    const plan = [
      ['taxi', 5], ['van', 5], ['sport', 6],
    ];
    let made = 0;
    for (const [variant, n] of plan) {
      for (let i = 0; i < n; i += 1) made += this.spawnCar(variant);
    }
    while (made < TRAFFIC_COUNT) made += this.spawnCar('sedan');
    for (let i = 0; i < PARKED_COUNT; i += 1) {
      const p = randomRoadPoint(this.rng);
      const near = nearestRoad(p.x, p.z);
      const variant = ['sedan', 'sedan', 'taxi', 'van', 'sport'][i % 5];
      const colors = VARIANTS[variant].colors;
      const car = new Car(variant, colors[Math.floor(this.rng() * colors.length)]);
      const along = near.along === 'z';
      const side = this.rng() < 0.5 ? 1 : -1;
      const hx = along ? near.x + side * (CITY.roadWidth / 2 - 1.2) : p.x;
      const hz = along ? p.z : near.z + side * (CITY.roadWidth / 2 - 1.2);
      const heading = along ? (this.rng() < 0.5 ? 0 : Math.PI) : (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      car.place(hx, hz, heading);
      this.scene.add(car.mesh);
      this.parked.push(car);
    }
  }

  spawnCar(variant) {
    const rng = this.rng;
    const p = randomRoadPoint(rng);
    const near = nearestRoad(p.x, p.z);
    const colors = VARIANTS[variant].colors;
    const car = new Car(variant, colors[Math.floor(rng() * colors.length)]);
    const along = near.along === 'z';
    const lane = (rng() < 0.5 ? 1 : -1) * CITY.lane;
    const x = along ? near.x + lane : p.x;
    const z = along ? p.z : near.z + lane;
    let heading;
    if (along) heading = lane > 0 ? 0 : Math.PI;
    else heading = lane > 0 ? Math.PI / 2 : -Math.PI / 2;
    car.place(x, z, heading);
    car.speed = car.top * (0.55 + rng() * 0.35);
    car.axis = along ? 'z' : 'x';
    car.dir = lane > 0 ? 1 : -1;
    this.scene.add(car.mesh);
    this.cars.push(car);
    return 1;
  }

  update(dt, resolveCollision) {
    for (const car of this.cars) {
      // Slow down if another car is right ahead.
      let ahead = false;
      for (const other of this.cars) {
        if (other === car) continue;
        const dx = other.x - car.x;
        const dz = other.z - car.z;
        const d = Math.hypot(dx, dz);
        if (d < 7 && d > 0.01) {
          const fx = Math.sin(car.heading);
          const fz = Math.cos(car.heading);
          if ((dx * fx + dz * fz) / d > 0.85) { ahead = true; break; }
        }
      }
      const target = ahead ? 0 : car.top;
      car.speed += clamp(target - car.speed, -10 * dt, 6 * dt);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      // At an intersection, sometimes turn onto the crossing road.
      const onRoadX = ROADS.some((c) => Math.abs(car.x - c) < 1.2);
      const onRoadZ = ROADS.some((c) => Math.abs(car.z - c) < 1.2);
      if (onRoadX && onRoadZ && this.rng() < 0.25 * dt * 60) {
        car.heading += (this.rng() < 0.5 ? 1 : -1) * Math.PI / 2;
      }
      // Turn around at the map edge instead of leaving town.
      if (Math.abs(car.x) > CITY.half - 6 || Math.abs(car.z) > CITY.half - 6) {
        car.heading += Math.PI;
        car.x = clamp(car.x, -CITY.half + 8, CITY.half - 8);
        car.z = clamp(car.z, -CITY.half + 8, CITY.half - 8);
      }
      const hit = resolveCollision ? resolveCollision(car.x, car.z, 1.4) : null;
      if (hit) { car.x = hit.x; car.z = hit.z; }
      car.sync();
    }
  }
}

// --------------------------------------------------------------- police
function makeHeli() {
  const g = new T.Group();
  const bodyMat = new T.MeshStandardMaterial({ color: 0x1a2a44, roughness: 0.4, metalness: 0.5 });
  const body = new T.Mesh(new T.BoxGeometry(2.4, 1.6, 5.2), bodyMat);
  g.add(body);
  const glass = new T.Mesh(new T.BoxGeometry(2.2, 1.0, 1.6), new T.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.1, metalness: 0.8 }));
  glass.position.set(0, 0.3, -2.0);
  g.add(glass);
  const tail = new T.Mesh(new T.BoxGeometry(0.7, 0.7, 5.5), bodyMat);
  tail.position.set(0, 0.3, 4.6);
  g.add(tail);
  const fin = new T.Mesh(new T.BoxGeometry(0.2, 1.6, 1.2), bodyMat);
  fin.position.set(0, 1.0, 7.0);
  g.add(fin);
  const skidMat = new T.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
  for (const sx of [-1.0, 1.0]) {
    const skid = new T.Mesh(new T.BoxGeometry(0.15, 0.15, 4.4), skidMat);
    skid.position.set(sx, -1.1, 0);
    g.add(skid);
  }
  const rotor = new T.Group();
  rotor.position.y = 1.15;
  const bladeMat = new T.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.6 });
  for (let i = 0; i < 2; i += 1) {
    const blade = new T.Mesh(new T.BoxGeometry(11, 0.08, 0.5), bladeMat);
    blade.rotation.y = (i * Math.PI) / 2;
    rotor.add(blade);
  }
  g.add(rotor);
  const tailRotor = new T.Mesh(new T.BoxGeometry(0.08, 2.6, 0.4), bladeMat);
  tailRotor.position.set(0.45, 0.9, 7.0);
  g.add(tailRotor);
  const spot = new T.SpotLight(0xfff2c0, 900, 90, 0.28, 0.5, 1.2);
  spot.position.set(0, -0.8, -1);
  const spotTarget = new T.Object3D();
  spotTarget.position.set(0, -30, 0);
  g.add(spotTarget);
  spot.target = spotTarget;
  g.add(spot);
  const cone = new T.Mesh(
    new T.ConeGeometry(7, 26, 16, 1, true),
    new T.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.10, side: T.DoubleSide, depthWrite: false }),
  );
  cone.rotation.x = Math.PI;
  cone.position.y = -13.5;
  g.add(cone);
  g.userData.rotor = rotor;
  g.userData.tailRotor = tailRotor;
  g.userData.spot = spot;
  return g;
}

export class Police {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = mulberry32(seed + 77);
    this.cruisers = [];
    this.cops = [];
    this.roadblocks = [];
    this.heli = makeHeli();
    this.heli.visible = false;
    this.scene.add(this.heli);
    this.heliAngle = 0;
    this.blockTimer = 0;
    this.sirenPhase = 0;
  }

  cruiserCountFor(wanted) {
    return wanted <= 0 ? 0 : wanted === 1 ? 1 : wanted === 2 ? 2 : wanted === 3 ? 3 : 4;
  }

  spawnCruiser(x, z) {
    const car = new Car('cruiser', 0x1a1a22);
    car.place(x, z, 0);
    car.speed = 0;
    car.top = 20;
    this.scene.add(car.mesh);
    this.cruisers.push(car);
    return car;
  }

  makeCopMesh() {
    const g = new T.Group();
    const navy = new T.MeshStandardMaterial({ color: 0x1a2a5a, roughness: 0.8 });
    const skin = new T.MeshStandardMaterial({ color: 0xc89878, roughness: 0.8 });
    const torso = new T.Mesh(new T.BoxGeometry(0.55, 0.75, 0.3), navy);
    torso.position.y = 1.05;
    const head = new T.Mesh(new T.BoxGeometry(0.34, 0.34, 0.34), skin);
    head.position.y = 1.65;
    const cap = new T.Mesh(new T.BoxGeometry(0.38, 0.12, 0.38), new T.MeshStandardMaterial({ color: 0x0a1430, roughness: 0.7 }));
    cap.position.y = 1.86;
    const legs = new T.Mesh(new T.BoxGeometry(0.45, 0.7, 0.28), new T.MeshStandardMaterial({ color: 0x141428, roughness: 0.9 }));
    legs.position.y = 0.35;
    g.add(torso); g.add(head); g.add(cap); g.add(legs);
    return g;
  }

  update(dt, t, px, pz, wanted, resolveCollision) {
    this.sirenPhase += dt;
    // Cruisers: spawn / despawn to match the wanted level.
    const want = this.cruiserCountFor(wanted);
    while (this.cruisers.length < want) {
      const a = this.rng() * Math.PI * 2;
      this.spawnCruiser(px + Math.sin(a) * 55, pz + Math.cos(a) * 55);
    }
    while (this.cruisers.length > want) {
      const c = this.cruisers.pop();
      this.scene.remove(c.mesh);
    }
    // Chase: steer toward the player, Manhattan-style, with a speed
    // edge over traffic so the chase feels real.
    for (const c of this.cruisers) {
      const dx = px - c.x;
      const dz = pz - c.z;
      const d = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      const turn = clamp(angleDiff(wantHeading, c.heading), -2.4 * dt, 2.4 * dt);
      c.heading += turn;
      const targetSpeed = d > 26 ? 21 : d > 10 ? 18 : 12;
      c.speed += clamp(targetSpeed - c.speed, -14 * dt, 10 * dt);
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      const hit = resolveCollision ? resolveCollision(c.x, c.z, 1.4) : null;
      if (hit) { c.x = hit.x; c.z = hit.z; }
      c.sync();
      // Flashing light bar.
      const on = Math.floor(this.sirenPhase * 6) % 2 === 0;
      if (c.mesh.userData.lightRed) c.mesh.userData.lightRed.material.color.set(on ? 0xff2222 : 0x440000);
      if (c.mesh.userData.lightBlue) c.mesh.userData.lightBlue.material.color.set(on ? 0x111188 : 0x2266ff);
    }
    // Cops on foot at wanted 1+: one per star, capped at 3.
    const wantCops = wanted >= 1 ? Math.min(3, wanted) : 0;
    while (this.cops.length < wantCops) {
      const mesh = this.makeCopMesh();
      const a = this.rng() * Math.PI * 2;
      mesh.position.set(px + Math.sin(a) * 18, 0, pz + Math.cos(a) * 18);
      this.scene.add(mesh);
      this.cops.push({ mesh, x: mesh.position.x, z: mesh.position.z, bustT: 0 });
    }
    while (this.cops.length > wantCops) {
      const c = this.cops.pop();
      this.scene.remove(c.mesh);
    }
    for (const cop of this.cops) {
      const dx = px - cop.x;
      const dz = pz - cop.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.5) {
        cop.x += (dx / d) * 4.6 * dt;
        cop.z += (dz / d) * 4.6 * dt;
      }
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = Math.atan2(dx, dz);
      cop.bustT = d < WANTED.copBustRange ? cop.bustT + dt : 0;
    }

    // Roadblocks at wanted 3+: two cruisers parked across the road ahead.
    if (wanted >= 3) {
      this.blockTimer -= dt;
      if (this.roadblocks.length === 0 || this.blockTimer <= 0) {
        this.clearRoadblocks();
        const near = nearestRoad(px, pz);
        const along = near.along === 'z';
        // A point ~28 m ahead of the player on that road.
        const fx = Math.abs(Math.sin(Math.atan2(px - near.x, pz - near.z))) > 0.5 ? 1 : 0;
        const aheadX = along ? near.x : clamp(px + (px > near.x ? 28 : -28), -CITY.half, CITY.half);
        const aheadZ = along ? clamp(pz + (pz > near.z ? 28 : -28), -CITY.half, CITY.half) : near.z;
        const bx = along ? near.x : aheadX;
        const bz = along ? aheadZ : near.z;
        void fx;
        for (let i = 0; i < 2; i += 1) {
          const car = new Car('cruiser', 0x1a1a22);
          const off = (i === 0 ? -3.4 : 3.4);
          const rx = along ? bx + off : bx;
          const rz = along ? bz : bz + off;
          // Parked across the road: heading perpendicular to the road.
          car.place(rx, rz, along ? Math.PI / 2 : 0);
          this.scene.add(car.mesh);
          this.roadblocks.push(car);
        }
        this.blockTimer = 6;
      }
    } else {
      this.clearRoadblocks();
    }

    // Helicopter at wanted 4+: orbits above the player, rotor spinning,
    // spotlight cone sweeping down. Never flyable.
    if (wanted >= 4) {
      this.heli.visible = true;
      this.heliAngle += dt * 0.45;
      const hx = px + Math.sin(this.heliAngle) * 20;
      const hz = pz + Math.cos(this.heliAngle) * 20;
      this.heli.position.set(hx, 27, hz);
      this.heli.rotation.y = Math.atan2(px - hx, pz - hz);
      this.heli.userData.rotor.rotation.y += dt * 28;
      this.heli.userData.tailRotor.rotation.z += dt * 30;
    } else {
      this.heli.visible = false;
    }
  }

  clearRoadblocks() {
    for (const car of this.roadblocks) this.scene.remove(car.mesh);
    this.roadblocks = [];
  }

  // Nearest foot cop close enough to bust the player, if any.
  bustingCop() {
    return this.cops.find((c) => c.bustT >= WANTED.copBustSeconds) || null;
  }

  // A cruiser close enough to ram the player.
  rammingCruiser(px, pz) {
    for (const c of this.cruisers) {
      if (dist2(c.x, c.z, px, pz) < WANTED.ramRange && Math.abs(c.speed) > 6) return c;
    }
    return null;
  }
}
