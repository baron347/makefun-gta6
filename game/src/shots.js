// NEON HARBOR — screenshot staging (?shot=cover|street|mission|chase).
// Each scene runs the REAL game forward with a scripted autopilot at
// fixed 1/60 s steps, then freezes and sets window.__shotReady. The
// take-shots script waits for that flag before capturing 1280x800.

import { autopilotDrive } from './vehicles.js';
import { nearestRoad, clamp } from './config.js';

const STEP = 1 / 60;

export function setupShots(G) {
  const params = new URLSearchParams(location.search);
  const kind = params.get('shot');
  if (!kind) return false;

  function step(n) {
    for (let i = 0; i < n; i++) G.update(STEP);
  }

  function freeze() {
    G.frozen = true;
    window.__shotReady = true;
  }

  function begin() {
    G.hud.hideAllScreens();
    G.state = 'playing';
    G.started = true;
  }

  function stealParked() {
    const car = G.traffic.parked[0];
    G.player.setPosition(car.x + 2.6, car.z, car.heading);
    G.stealNearestCar();
    return G.playerCar;
  }

  function repaint(car, hex) {
    car.mesh.userData.bodyMat.color.setHex(hex);
  }

  function placeCar(car, x, z, heading, speed = 0) {
    car.x = x;
    car.z = z;
    car.heading = heading;
    car.speed = speed;
    car.mesh.position.set(x, 0, z);
    car.mesh.rotation.y = heading;
  }

  function gridDrive(car, target, seconds) {
    const st = { stuckT: 0, reverseT: 0 };
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) autopilotDrive(car, target, STEP, G.city, st);
  }

  // Move any traffic car off the rectangle the staged car will drive
  // through, so the shot never shows a car overlapping the hero car.
  function clearCorridor(x0, z0, x1, z1, r) {
    const minX = Math.min(x0, x1) - r;
    const maxX = Math.max(x0, x1) + r;
    const minZ = Math.min(z0, z1) - r;
    const maxZ = Math.max(z0, z1) + r;
    for (const c of G.traffic.cars) {
      if (c.x > minX && c.x < maxX && c.z > minZ && c.z < maxZ) {
        c.x += 30;
        c.z += 30;
        c.mesh.position.set(c.x, 0, c.z);
      }
    }
  }

  // Park a cruiser alongside the hero car: `ahead` metres in front,
  // `left` metres to its left, matching speed.
  function parkCruiserAlongside(car, ahead, left) {
    let cruiser = G.police.cruisers[0];
    if (!cruiser) cruiser = G.police.spawnCruiser(car.x, car.z);
    if (!cruiser) return;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const lx = Math.cos(car.heading);
    const lz = -Math.sin(car.heading);
    cruiser.x = car.x + fx * ahead + lx * left;
    cruiser.z = car.z + fz * ahead + lz * left;
    cruiser.heading = car.heading;
    cruiser.speed = car.speed;
    cruiser.mesh.position.set(cruiser.x, 0, cruiser.z);
    cruiser.mesh.rotation.y = cruiser.heading;
  }

  function pushCruisersAway(cx, cz, minD) {
    for (const c of G.police.cruisers) {
      const dx = c.x - cx;
      const dz = c.z - cz;
      const d = Math.hypot(dx, dz) || 1;
      if (d < minD) {
        const k = minD / d;
        c.x = cx + dx * k;
        c.z = cz + dz * k;
        c.mesh.position.set(c.x, 0, c.z);
      }
    }
  }

  if (kind === 'cover') {
    begin();
    const car = stealParked();
    repaint(car, 0xd8232a);
    placeCar(car, 0, -180, 0);
    G.setWanted(3);
    clearCorridor(-8, -180, 8, 240, 4);
    gridDrive(car, { x: 0, z: 240 }, 6);
    G.police.spawnCruiser(car.x, car.z);
    parkCruiserAlongside(car, 12, 4.5);
    G.player.updateCamera(G.camera, STEP, car, true);
    G.hud.update(STEP);
    freeze();
    return true;
  }

  if (kind === 'street') {
    begin();
    // Player walks north along the avenue's west lane for 2 s. The lane
    // matters: the diagonal camera sits at player + (6, 4.5, 7.5), and
    // from x = -4 that lands over the road, not inside a building.
    G.player.setPosition(-4, 20, Math.PI);
    G.player.camYaw = 0;
    G.keys.KeyW = true;
    G.keys.ShiftLeft = true;
    step(120);
    G.keys.KeyW = false;
    G.keys.ShiftLeft = false;
    // Stage the avenue: 3 traffic cars, 6 pedestrians on the sidewalks.
    const t = G.traffic.cars;
    const spots = [
      { x: 3.5, z: -14, h: 0 },
      { x: -3.5, z: -44, h: 0 },
      { x: -26, z: 0, h: Math.PI / 2 },
    ];
    spots.forEach((s, i) => {
      const c = t[i];
      if (!c) return;
      c.x = s.x;
      c.z = s.z;
      c.heading = s.h;
      c.speed = 0;
      c.mesh.position.set(s.x, 0, s.z);
      c.mesh.rotation.y = s.h;
    });
    const pedSpots = [
      { x: 8.6, z: 14 }, { x: -8.6, z: 8 }, { x: 8.6, z: 0 },
      { x: -8.6, z: -6 }, { x: 8.6, z: -12 }, { x: -8.6, z: -16 },
    ];
    pedSpots.forEach((s, i) => {
      const p = G.peds.list[i];
      if (!p) return;
      p.x = s.x;
      p.z = s.z;
      p.target = { x: s.x + 2, z: s.z - 4 };
      p.mesh.position.set(s.x, 0, s.z);
    });
    // Diagonal 3/4 camera.
    const px = G.player.x;
    const pz = G.player.z;
    G.camera.position.set(px + 6, 4.5, pz + 7.5);
    G.camera.lookAt(px - 3, 1.5, pz - 8);
    freeze();
    return true;
  }

  if (kind === 'mission') {
    begin();
    // Jump straight to job 2 (Hot Delivery) for the shot.
    G.missions.index = 1;
    G.missions.startNext();
    const car = stealParked();
    repaint(car, 0xe0a83c);
    placeCar(car, 0, 120, Math.PI);
    const marker = G.missions.markerPos();
    clearCorridor(-8, -240, 8, 120, 4);
    gridDrive(car, marker, 4);
    // Re-pose on the road centre, heading along the road toward the
    // marker, doing 22 m/s.
    const n = nearestRoad(car.x, car.z);
    let heading;
    if (n.along === 'z') heading = marker.z > car.z ? 0 : Math.PI;
    else heading = marker.x > car.x ? Math.PI / 2 : -Math.PI / 2;
    placeCar(car, n.x, n.z, heading, 22);
    G.player.updateCamera(G.camera, STEP, car, true);
    G.hud.update(STEP);
    G.hud.el.toast.classList.add('hidden');
    G.police.spawnCruiser(car.x, car.z);
    G.police.spawnCruiser(car.x, car.z);
    pushCruisersAway(car.x, car.z, 14);
    parkCruiserAlongside(car, 12, 4.5);
    freeze();
    return true;
  }

  if (kind === 'chase') {
    begin();
    G.setWanted(5);
    G.player.setPosition(0, 0, Math.PI);
    G.player.camPitch = 0.5;
    G.player.camDist = 10;
    G.player.camYaw = 0;
    // Stand still 2.5 s while the chase closes in.
    step(150);
    pushCruisersAway(G.player.x, G.player.z, 8);
    G.player.updateCamera(G.camera, STEP, null, true);
    G.shoot();
    G.hud.update(STEP);
    freeze();
    return true;
  }

  return false;
}

export { clamp };
