// NEON HARBOR — vehicles: car mesh factory, arcade player driving,
// traffic AI on the road grid, and the police (cruisers, foot cops,
// roadblocks, helicopter).

import { CITY, clamp, angleDiff, dist2, headingVec, mulberry32, pick } from './config.js';

const THREE = window.THREE;

const VARIANT_DEFS = {
  sedan: { len: 4.4, wid: 1.9, h: 0.75, top: 1.35, speed: 1.0, colors: [0x3a6fd8, 0xc23b3b, 0xdadada, 0x2f2f33, 0x3f8f5f] },
  taxi: { len: 4.4, wid: 1.9, h: 0.75, top: 1.35, speed: 1.05, colors: [0xf2c200] },
  van: { len: 5.2, wid: 2.1, h: 1.5, top: 1.9, speed: 0.8, colors: [0xdadada, 0x5a6a7a, 0x8a5a3a] },
  truck: { len: 6.4, wid: 2.3, h: 1.4, top: 2.1, speed: 0.7, colors: [0x7a7f85, 0x4a6a8a] },
  sport: { len: 4.2, wid: 2.0, h: 0.55, top: 1.0, speed: 1.25, colors: [0xd8232a, 0xff7a1a, 0x22d3ee, 0x111111] },
  police: { len: 4.6, wid: 1.95, h: 0.78, top: 1.35, speed: 1.15, colors: [0x1a1a22] },
};

// Build a car mesh. userData.bodyMat is the paint material so callers can
// repaint a car (screenshot staging) without rebuilding the mesh.
export function createCarMesh(variant, colorHex) {
  const def = VARIANT_DEFS[variant] || VARIANT_DEFS.sedan;
  const color = colorHex !== undefined ? colorHex : pick(Math.random, def.colors);
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(def.wid, def.h, def.len), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.15, metalness: 0.8 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(def.wid * 0.82, def.top - def.h, def.len * 0.5), glassMat);
  cabin.position.set(0, def.h + (def.top - def.h) / 2 - 0.1, -def.len * 0.06);
  cabin.castShadow = true;
  group.add(cabin);
  if (variant === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.22, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xf2c200, emissive: 0xaa8800, emissiveIntensity: 0.6 }),
    );
    sign.position.set(0, def.top + 0.05, -def.len * 0.06);
    group.add(sign);
  }
  if (variant === 'truck') {
    const cargo = new THREE.Mesh(
      new THREE.BoxGeometry(def.wid * 0.95, 1.1, def.len * 0.42),
      new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.6, metalness: 0.3 }),
    );
    cargo.position.set(0, 1.15, def.len * 0.22);
    cargo.castShadow = true;
    group.add(cargo);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const wheels = [];
  for (const [wx, wz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx * (def.wid / 2 - 0.05), 0.36, wz * (def.len / 2 - 0.75));
    group.add(w);
    wheels.push(w);
  }
  // Headlights / taillights.
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffedb0, emissiveIntensity: 1.4 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xcc2222, emissiveIntensity: 1.2 });
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), headMat);
    h.position.set(sx * (def.wid / 2 - 0.35), 0.62, def.len / 2 + 0.01);
    group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), tailMat);
    t.position.set(sx * (def.wid / 2 - 0.35), 0.62, -def.len / 2 - 0.01);
    group.add(t);
  }
  // Police light bar: two boxes whose emissive flips every 0.25 s.
  let lightBar = null;
  if (variant === 'police') {
    lightBar = {};
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 2 }),
    );
    red.position.set(-0.32, def.top + 0.08, -def.len * 0.06);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x000033, emissive: 0x2244ff, emissiveIntensity: 2 }),
    );
    blue.position.set(0.32, def.top + 0.08, -def.len * 0.06);
    group.add(red, blue);
    lightBar = { red, blue, timer: 0, phase: false };
  }
  group.userData.bodyMat = bodyMat;
  group.userData.wheels = wheels;
  group.userData.lightBar = lightBar;
  group.userData.def = def;
  return group;
}

export function repaintCar(car, colorHex) {
  car.color = colorHex;
  if (car.mesh && car.mesh.userData.bodyMat) {
    car.mesh.userData.bodyMat.color.setHex(colorHex);
  }
}

export function makeCar(variant, colorHex, x, z, heading) {
  const mesh = createCarMesh(variant, colorHex);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  return {
    variant,
    color: mesh.userData.bodyMat.color.getHex(),
    mesh,
    x, z, heading,
    speed: 0,
    steer: 0,
    hold: false, // staging flag: traffic update skips held cars
  };
}

function syncCarMesh(car) {
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  const spin = car.speed * 0.016;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  const lb = car.mesh.userData.lightBar;
  if (lb) {
    lb.timer += 0.016;
    if (lb.timer > 0.25) {
      lb.timer = 0;
      lb.phase = !lb.phase;
      lb.red.material.emissiveIntensity = lb.phase ? 2.4 : 0.15;
      lb.blue.material.emissiveIntensity = lb.phase ? 0.15 : 2.4;
    }
  }
}

// --- Player driving (arcade) ----------------------------------------------
export function updatePlayerCar(car, input, dt, city, onHardHit) {
  const def = car.mesh.userData.def;
  const speedNorm = Math.abs(car.speed) / DRIVING_MAX;
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const steerMax = 0.55 * (1 - 0.45 * Math.min(1, Math.abs(car.speed) / 20));
  car.steer += (steerTarget * steerMax * (input.handbrake ? 1.7 : 1) - car.steer) * Math.min(1, dt * 10);
  if (input.forward) {
    car.speed += (car.speed < 0 ? 30 : 16) * dt * def.speed;
  } else if (input.back) {
    car.speed -= (car.speed > 0 ? 30 : 10) * dt * def.speed;
  } else {
    car.speed -= car.speed * (input.handbrake ? 3.2 : 0.55) * dt;
  }
  if (input.handbrake) car.speed -= car.speed * 2.2 * dt;
  const maxF = 34 * def.speed;
  car.speed = clamp(car.speed, -10, maxF);
  if (Math.abs(car.speed) < 0.05 && !input.forward && !input.back) car.speed = 0;
  car.heading += (car.steer * (car.speed / 2.6)) * dt * (car.speed < 0 ? -1 : 1);
  const fwd = headingVec(car.heading);
  const prevX = car.x;
  const prevZ = car.z;
  car.x += fwd.x * car.speed * dt;
  car.z += fwd.z * car.speed * dt;
  // Buildings / parks stop the car; a hard hit bounces speed back.
  if (city.resolveCircleCars(car, 2.3)) {
    const hitSpeed = Math.abs(car.speed);
    if (hitSpeed > 6 && onHardHit) onHardHit(hitSpeed);
    car.speed *= -0.25;
    // Step back out of the wall so we do not sit inside it.
    car.x = prevX;
    car.z = prevZ;
  }
  if (!city.inBounds(car.x, car.z, 2)) {
    car.x = clamp(car.x, -CITY.span + 2, CITY.span - 2);
    car.z = clamp(car.z, -CITY.span + 2, CITY.span - 2);
    car.speed *= 0.5;
  }
  syncCarMesh(car);
}

const DRIVING_MAX = 34;

// Car-vs-car: push apart and trade 40% of the speed difference.
export function collideCars(a, b, radius = 4.4) {
  const d = dist2(a.x, a.z, b.x, b.z);
  if (d >= radius || d < 1e-4) return false;
  const nx = (b.x - a.x) / d;
  const nz = (b.z - a.z) / d;
  const push = (radius - d) / 2;
  a.x -= nx * push;
  a.z -= nz * push;
  b.x += nx * push;
  b.z += nz * push;
  const exchange = (b.speed - a.speed) * 0.4;
  a.speed += exchange;
  b.speed -= exchange;
  return true;
}

// --- Traffic ----------------------------------------------------------------
export class Traffic {
  constructor(scene, city, seed = 7) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed + 101);
    this.cars = [];
    this.parked = [];
  }

  spawn() {
    const variants = ['sedan', 'sedan', 'sedan', 'taxi', 'van', 'truck', 'sport', 'sedan'];
    for (let i = 0; i < 32; i++) {
      const variant = pick(this.rng, variants);
      const p = this.city.randomRoadPoint(this.rng);
      const axis = this.rng() < 0.5 ? 'x' : 'z';
      const dir = this.rng() < 0.5 ? 1 : -1;
      const lane = (this.rng() < 0.5 ? -3.5 : 3.5);
      const car = makeCar(variant, undefined, p.x, p.z, axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI));
      car.speed = 9 + this.rng() * 4;
      car.axis = axis;
      car.dir = dir;
      car.lane = lane;
      car.cruise = (9 + this.rng() * 4) * (VARIANT_DEFS[variant].speed || 1);
      car.isTraffic = true;
      this.cars.push(car);
      this.scene.add(car.mesh);
    }
    // 14 parked cars along curbs, stealable.
    for (let i = 0; i < 14; i++) {
      const variant = pick(this.rng, ['sedan', 'sedan', 'taxi', 'sport', 'van']);
      const p = this.city.randomRoadPoint(this.rng);
      const near = this.city.nearestRoad(p.x, p.z);
      const heading = near.axis === 'z'
        ? (this.rng() < 0.5 ? 0 : Math.PI)
        : (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      const off = (this.rng() < 0.5 ? -8.6 : 8.6);
      const x = near.axis === 'z' ? near.x + off : p.x;
      const z = near.axis === 'z' ? p.z : near.z + off;
      const car = makeCar(variant, undefined, x, z, heading);
      car.isParked = true;
      this.parked.push(car);
      this.scene.add(car.mesh);
    }
  }

  _carAhead(car, list, maxD) {
    const fwd = headingVec(car.heading);
    let best = null;
    let bestD = maxD;
    for (const o of list) {
      if (o === car || o.hold) continue;
      const dx = o.x - car.x;
      const dz = o.z - car.z;
      const along = dx * fwd.x + dz * fwd.z;
      if (along < 0 || along > bestD) continue;
      const side = Math.abs(dx * fwd.z - dz * fwd.x);
      if (side < 2.6) {
        best = o;
        bestD = along;
      }
    }
    return best;
  }

  update(dt, playerCar, playerOnFoot) {
    for (const car of this.cars) {
      if (car.hold) {
        syncCarMesh(car);
        continue;
      }
      // Slow for a car ahead, or for the player's car ahead.
      let target = car.cruise;
      const ahead = this._carAhead(car, this.cars, 14);
      if (ahead) target = Math.min(target, 3);
      if (playerCar && this._carAhead(car, [playerCar], 12)) target = Math.min(target, 2);
      car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
      const fwd = headingVec(car.heading);
      car.x += fwd.x * car.speed * dt;
      car.z += fwd.z * car.speed * dt;
      // At an intersection (within 1.2 m of a crossing road centre), sometimes turn.
      car.turnCooldown = Math.max(0, (car.turnCooldown || 0) - dt);
      const near = this.city.nearestRoad(car.x, car.z);
      if (near.d < 1.2 && car.turnCooldown <= 0 && this.rng() < 0.3) {
        this._turn(car, near);
        car.turnCooldown = 2;
      }
      if (!this.city.inBounds(car.x, car.z, 3)) {
        // Turn around at the city edge.
        car.heading += Math.PI;
        car.x = clamp(car.x, -CITY.span + 3, CITY.span - 3);
        car.z = clamp(car.z, -CITY.span + 3, CITY.span - 3);
      }
      this.city.resolveCircleCars(car, 2.3);
      syncCarMesh(car);
    }
  }

  _turn(car, near) {
    const choices = [];
    if (near.axis === 'z') {
      choices.push(Math.PI / 2, -Math.PI / 2, car.heading + Math.PI);
    } else {
      choices.push(0, Math.PI, car.heading + Math.PI);
    }
    const h = pick(this.rng, choices);
    car.heading = h;
    // Snap onto the crossing road centre + lane offset.
    if (near.axis === 'z') car.x = near.x + (this.rng() < 0.5 ? -3.5 : 3.5);
    else car.z = near.z + (this.rng() < 0.5 ? -3.5 : 3.5);
  }

  removeParked(car) {
    const i = this.parked.indexOf(car);
    if (i >= 0) this.parked.splice(i, 1);
  }

  addParked(car) {
    car.isParked = true;
    car.speed = 0;
    this.parked.push(car);
  }
}

// --- Police -----------------------------------------------------------------
function makeCopMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.9, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x1a2a55, roughness: 0.8 }),
  );
  body.position.y = 1.05;
  body.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8a075, roughness: 0.7 }),
  );
  head.position.y = 1.72;
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.21, 0.22, 0.1, 10),
    new THREE.MeshStandardMaterial({ color: 0x101830, roughness: 0.6 }),
  );
  cap.position.y = 1.86;
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.6, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x141c33, roughness: 0.8 }),
  );
  legs.position.y = 0.3;
  group.add(body, head, cap, legs);
  return group;
}

export class Police {
  constructor(scene, city, seed = 7) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed + 202);
    this.cruisers = [];
    this.cops = []; // on-foot officers
    this.roadblocks = [];
    this.heli = this._buildHeli();
    this.heli.visible = false;
    this.scene.add(this.heli);
    this._roadblockCooldown = 0;
  }

  _buildHeli() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 1.1, 4.6),
      new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.4, metalness: 0.5 }),
    );
    body.castShadow = true;
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 3.4),
      new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.4, metalness: 0.5 }),
    );
    tail.position.set(0, 0.2, -3.6);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.7, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.1, metalness: 0.8 }),
    );
    glass.position.set(0, 0.25, 1.6);
    const rotor = new THREE.Group();
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(9, 0.08, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }),
    );
    rotor.add(blade);
    rotor.position.y = 0.85;
    rotor.name = 'rotor';
    const spot = new THREE.Mesh(
      new THREE.ConeGeometry(6, 18, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff2b0, transparent: true, opacity: 0.14,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    spot.position.y = -9.5;
    spot.name = 'spot';
    const light = new THREE.PointLight(0xffe9a0, 30, 60);
    light.position.y = -2;
    group.add(body, tail, glass, rotor, spot, light);
    group.userData.rotor = rotor;
    return group;
  }

  wantedCount(wanted) {
    return wanted > 0 ? Math.min(1 + wanted, 6) : 0;
  }

  update(dt, wanted, player, playerCar, onBusted) {
    // --- Cruisers: spawn / despawn to the wanted count.
    const want = this.wantedCount(wanted);
    while (this.cruisers.length < want) this._spawnCruiser(player, playerCar);
    while (this.cruisers.length > want) {
      const c = this.cruisers.pop();
      this.scene.remove(c.mesh);
    }
    const px = playerCar ? playerCar.x : player.x;
    const pz = playerCar ? playerCar.z : player.z;
    const playerSpeed = playerCar ? Math.abs(playerCar.speed) : 0;
    for (const c of this.cruisers) {
      const d = dist2(c.x, c.z, px, pz);
      const targetHeading = Math.atan2(px - c.x, pz - c.z);
      const turn = clamp(angleDiff(c.heading, targetHeading), -1.9 * dt, 1.9 * dt);
      c.heading += turn;
      let top = 15 + 2.4 * wanted;
      if (d < 10) top = Math.min(top, playerSpeed + 3); // tail, don't plough through
      c.speed += (top - c.speed) * Math.min(1, dt * 1.2);
      const fwd = headingVec(c.heading);
      c.x += fwd.x * c.speed * dt;
      c.z += fwd.z * c.speed * dt;
      this.city.resolveCircleCars(c, 2.3);
      syncCarMesh(c);
      // A cruiser close to a player on foot drops a cop.
      if (!playerCar && d < 12 && this.cops.length < 2 + wanted && this.rng() < dt * 0.5) {
        this._spawnCop(c.x, c.z);
      }
    }
    // --- Foot cops chase and can bust the player.
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const cop = this.cops[i];
      const d = dist2(cop.x, cop.z, player.x, player.z);
      if (d > 90 || wanted === 0) {
        this.scene.remove(cop.mesh);
        this.cops.splice(i, 1);
        continue;
      }
      cop.heading = Math.atan2(player.x - cop.x, player.z - cop.z);
      const fwd = headingVec(cop.heading);
      cop.x += fwd.x * 5.2 * dt;
      cop.z += fwd.z * 5.2 * dt;
      this.city.resolveCircle(cop, 0.5);
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
      if (d < 1.6) {
        cop.bustTimer += dt;
        if (cop.bustTimer > 1.5) {
          onBusted();
          return;
        }
      } else {
        cop.bustTimer = 0;
      }
    }
    // --- Roadblocks at wanted >= 3.
    this._roadblockCooldown -= dt;
    if (wanted >= 3 && this.roadblocks.length === 0 && this._roadblockCooldown <= 0) {
      this._placeRoadblock(player, playerCar);
    }
    if (wanted < 3) this._clearRoadblocks();
    // --- Helicopter at wanted >= 4.
    this.heli.visible = wanted >= 4;
    if (this.heli.visible) {
      const t = performance.now() * 0.001;
      const orbitR = 26;
      this.heli.position.set(
        px + Math.cos(t * 0.35) * orbitR,
        42 + Math.sin(t * 0.5) * 2,
        pz + Math.sin(t * 0.35) * orbitR,
      );
      this.heli.rotation.y = Math.atan2(px - this.heli.position.x, pz - this.heli.position.z);
      this.heli.userData.rotor.rotation.y += dt * 22;
    }
  }

  _spawnCruiser(player, playerCar) {
    const px = playerCar ? playerCar.x : player.x;
    const pz = playerCar ? playerCar.z : player.z;
    for (let tries = 0; tries < 12; tries++) {
      const p = this.city.randomRoadPoint(this.rng);
      const d = dist2(p.x, p.z, px, pz);
      if (d >= 45 && d <= 90) {
        const near = this.city.nearestRoad(p.x, p.z);
        const heading = near.axis === 'z' ? (this.rng() < 0.5 ? 0 : Math.PI) : (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
        const car = makeCar('police', undefined, p.x, p.z, heading);
        car.speed = 12;
        car.isPolice = true;
        this.cruisers.push(car);
        this.scene.add(car.mesh);
        return;
      }
    }
  }

  _spawnCop(x, z) {
    const mesh = makeCopMesh();
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    this.cops.push({ x, z, heading: 0, mesh, bustTimer: 0 });
  }

  // Two cruisers parked across the road ahead of the player.
  _placeRoadblock(player, playerCar) {
    const px = playerCar ? playerCar.x : player.x;
    const pz = playerCar ? playerCar.z : player.z;
    const heading = playerCar ? playerCar.heading : player.heading;
    const fwd = headingVec(heading);
    const near = this.city.nearestRoad(px + fwd.x * 55, pz + fwd.z * 55);
    const bx = near.axis === 'z' ? near.x : px + fwd.x * 55;
    const bz = near.axis === 'z' ? pz + fwd.z * 55 : near.z;
    const across = near.axis === 'z' ? Math.PI / 2 : 0;
    const block = { x: bx, z: bz, heading: across, cars: [] };
    for (const off of [-3.4, 3.4]) {
      const cx = bx + (near.axis === 'z' ? off : 0);
      const cz = bz + (near.axis === 'z' ? 0 : off);
      const car = makeCar('police', undefined, cx, cz, across);
      car.speed = 0;
      car.isRoadblock = true;
      block.cars.push(car);
      this.scene.add(car.mesh);
    }
    this.roadblocks.push(block);
    this._roadblockCooldown = 20;
  }

  // Park one cruiser alongside a given car (screenshot staging helper).
  parkAlongside(car, aheadM, sideM) {
    const fwd = headingVec(car.heading);
    const side = { x: fwd.z, z: -fwd.x };
    const x = car.x + fwd.x * aheadM + side.x * sideM;
    const z = car.z + fwd.z * aheadM + side.z * sideM;
    const c = makeCar('police', undefined, x, z, car.heading);
    c.speed = 0;
    this.cruisers.push(c);
    this.scene.add(c.mesh);
    return c;
  }

  pushCruisersAway(px, pz, minD) {
    for (const c of this.cruisers) {
      const d = dist2(c.x, c.z, px, pz);
      if (d < minD) {
        const a = Math.atan2(c.x - px, c.z - pz);
        c.x = px + Math.sin(a) * minD;
        c.z = pz + Math.cos(a) * minD;
        syncCarMesh(c);
      }
    }
  }

  _clearRoadblocks() {
    for (const b of this.roadblocks) {
      for (const c of b.cars) this.scene.remove(c.mesh);
    }
    this.roadblocks = [];
  }

  clearAll() {
    for (const c of this.cruisers) this.scene.remove(c.mesh);
    this.cruisers = [];
    for (const cop of this.cops) this.scene.remove(cop.mesh);
    this.cops = [];
    this._clearRoadblocks();
    this.heli.visible = false;
  }
}
