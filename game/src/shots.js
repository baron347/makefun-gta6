// NEON HARBOR — screenshot staging (?shot=cover|street|mission|chase).
// Each scene runs the REAL game forward with a scripted autopilot at
// fixed 1/60 s steps, then freezes and sets window.__shotReady. The
// take-shots script waits for that flag before capturing 1280x800.
//
// Staging rules (design v2): every shot shows real traffic + pedestrians
// in frame, cash is genuinely > $0 (job 1 is really completed first),
// the mission marker is inside the frame on the mission shot, the
// player is clearly visible on the street shot, and the chase shot
// reads as combat (target down, thick tracers, cops firing).

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

  // Complete job 1 ("First Pickup", $150) for real, so cash > $0 and
  // the HUD tells the truth. `car` is the stolen car (or null on foot).
  function completeJob1(car) {
    G.missions.index = 0;
    G.missions.startNext();
    const m = G.missions.markerPos();
    if (car) placeCar(car, m.x, m.z - 6, 0, 0);
    else G.player.setPosition(m.x, m.z - 6, 0);
    step(6);
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

  // Place traffic cars at fixed spots (in frame, on roads, moving).
  function stageTraffic(spots) {
    spots.forEach((s, i) => {
      const c = G.traffic.cars[i];
      if (!c) return;
      c.x = s.x;
      c.z = s.z;
      c.heading = s.h;
      c.speed = s.v ?? 9;
      c.mesh.position.set(s.x, 0, s.z);
      c.mesh.rotation.y = s.h;
    });
  }

  // Place pedestrians on the sidewalks around (cx, cz).
  function stagePeds(cx, cz, n) {
    for (let i = 0; i < n; i++) {
      const p = G.peds.list[i];
      if (!p) return;
      const side = i % 2 === 0 ? 8.6 : -8.6;
      const along = cz - 24 + i * 9;
      p.x = cx + side;
      p.z = along;
      p.target = { x: cx + side, z: along - 6 };
      p.mesh.position.set(p.x, 0, p.z);
    }
  }

  // Low, close chase camera: less empty asphalt, hero car fills frame.
  function chaseCamera(car, back = 8, up = 3.4, ahead = 12) {
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    G.camera.position.set(car.x - fx * back, up, car.z - fz * back);
    G.camera.lookAt(car.x + fx * ahead, 1.3, car.z + fz * ahead);
  }

  if (kind === 'cover') {
    begin();
    const car = stealParked();
    repaint(car, 0xd8232a);
    completeJob1(car); // cash $150, toast "Job complete — +$150".
    placeCar(car, 0, -180, 0);
    G.setWanted(3);
    clearCorridor(-8, -180, 8, 240, 4);
    gridDrive(car, { x: 0, z: 240 }, 6);
    step(12); // police spawn cruisers + roadblock (wanted 3).
    parkCruiserAlongside(car, 8, 4.5);
    // Pull the roadblock in to 15 m ahead so it reads as a blockade:
    // two cruisers parked sideways, touching in the middle to close
    // the hero's lane, both light bars lit red + blue. Angled ~26°
    // off perpendicular so the red/blue bar reads from the chase
    // camera (dead-sideways hides the far half of the bar).
    G.police.roadblocks.forEach((c, i) => {
      c.x = car.x + (i % 2 === 0 ? -2.2 : 2.2);
      c.z = car.z + 15 + Math.floor(i / 2) * 55;
      c.heading = Math.PI / 2 - 0.45;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
      const lb = c.mesh.userData.lightBar;
      if (lb) {
        lb.redMat.emissiveIntensity = 2.4;
        lb.blueMat.emissiveIntensity = 2.4;
      }
    });
    // Stage traffic + peds AFTER the last update step: traffic.update
    // re-snaps cars to their old road, so anything staged earlier
    // would teleport out of frame.
    const hz = car.z;
    stageTraffic([
      // Was hz + 16: that now sits on top of the roadblock at hz + 15,
      // so move it past the blockade instead.
      { x: 3.5, z: hz + 30, h: 0, v: 11 },
      { x: -3.5, z: hz + 24, h: Math.PI, v: 10 },
      { x: -23.5, z: hz + 20, h: Math.PI / 2, v: 9 },
      { x: 26.5, z: hz + 38, h: -Math.PI / 2, v: 10 },
      { x: 3.5, z: hz + 58, h: 0, v: 12 },
    ]);
    stagePeds(0, hz, 6);
    chaseCamera(car, 8, 3.4, 16); // look-ahead 16 m: roadblock centred.
    G.hud.update(STEP);
    freeze();
    return true;
  }

  if (kind === 'street') {
    begin();
    completeJob1(null); // cash $150 on foot.
    // Player walks north along the avenue's west lane for 2 s. The lane
    // matters: the diagonal camera sits near the player, and from
    // x = -4 it lands over the road, not inside a building.
    G.player.setPosition(-4, 20, Math.PI);
    G.player.camYaw = 0;
    G.keys.KeyW = true;
    G.keys.ShiftLeft = true;
    step(120);
    G.keys.KeyW = false;
    G.keys.ShiftLeft = false;
    // Stage the avenue: 5 traffic cars + 8 pedestrians in frame.
    const px = G.player.x;
    const pz = G.player.z;
    stageTraffic([
      { x: 3.5, z: pz - 10, h: 0, v: 10 },
      { x: -3.5, z: pz - 30, h: Math.PI, v: 9 },
      { x: 3.5, z: pz + 22, h: 0, v: 11 },
      { x: -23.5, z: pz - 6, h: Math.PI / 2, v: 9 },
      { x: 26.5, z: pz - 18, h: -Math.PI / 2, v: 10 },
    ]);
    stagePeds(0, pz, 8);
    // Close diagonal 3/4 camera from the west side — the player fills
    // the frame and no palm trunk sits in the sightline.
    G.camera.position.set(px - 4, 2.8, pz + 5);
    G.camera.lookAt(px + 1.5, 1.4, pz - 7);
    G.hud.update(STEP);
    freeze();
    return true;
  }

  if (kind === 'mission') {
    begin();
    const car = stealParked();
    completeJob1(car); // cash $150.
    // Jump to job 2 (Hot Delivery) for the shot.
    G.missions.index = 1;
    G.missions.startNext();
    repaint(car, 0xe0a83c);
    const marker = G.missions.markerPos();
    // Pose the car on the marker's road, 45 m before the marker,
    // heading straight at it — the gold beam sits centre-frame.
    const n = nearestRoad(marker.x, marker.z);
    let hx;
    let hz;
    let heading;
    if (n.along === 'z') {
      hx = n.x;
      hz = marker.z > 0 ? marker.z - 45 : marker.z + 45;
      heading = marker.z > hz ? 0 : Math.PI;
    } else {
      hx = marker.x > 0 ? marker.x - 45 : marker.x + 45;
      hz = n.z;
      heading = marker.x > hx ? Math.PI / 2 : -Math.PI / 2;
    }
    placeCar(car, hx, hz, heading, 22);
    gridDrive(car, marker, 1.2);
    G.police.spawnCruiser(car.x, car.z);
    G.police.spawnCruiser(car.x, car.z);
    step(6);
    pushCruisersAway(car.x, car.z, 14);
    // Re-pose exactly 45 m out (the drive + settle steps closed distance).
    placeCar(car, hx, hz, heading, 22);
    parkCruiserAlongside(car, 14, 4.5);
    // Traffic on the same road + the cross street, peds on sidewalks.
    // Staged after the last update step (see cover shot).
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const lx = Math.cos(heading);
    const lz = -Math.sin(heading);
    const ahead = (d) => ({ x: hx + fx * d, z: hz + fz * d });
    const a1 = ahead(24);
    const a2 = ahead(38);
    const a3 = ahead(-14);
    stageTraffic([
      { x: a1.x + lx * 3.5, z: a1.z + lz * 3.5, h: heading, v: 10 },
      { x: a2.x - lx * 3.5, z: a2.z - lz * 3.5, h: heading + Math.PI, v: 9 },
      { x: a3.x - lx * 3.5, z: a3.z - lz * 3.5, h: heading + Math.PI, v: 11 },
      { x: hx + lx * 22, z: hz + lz * 22 + fz * 30, h: heading + Math.PI / 2, v: 9 },
      { x: hx - lx * 22, z: hz - lz * 22 + fz * 30, h: heading - Math.PI / 2, v: 10 },
    ]);
    stagePeds(hx, hz, 6);
    chaseCamera(car);
    G.hud.update(STEP);
    G.hud.el.toast.classList.add('hidden');
    freeze();
    return true;
  }

  if (kind === 'chase') {
    begin();
    completeJob1(null); // cash $150.
    G.setWanted(5);
    G.player.setPosition(0, 0, Math.PI);
    G.player.camPitch = 0.35;
    G.player.camDist = 7;
    G.player.camYaw = 0;
    // Stand still 2.5 s while the chase closes in (cruisers, cops on
    // foot, helicopter at 5 stars, roadblocks).
    step(150);
    pushCruisersAway(G.player.x, G.player.z, 8);
    // Combat staging: a target ped dead ahead in the crosshair line, a
    // second ped already down, two cops on foot closing in, and a
    // cruiser firing a red tracer at the player.
    const target = G.peds.list[0];
    target.x = 0.3;
    target.z = -11;
    target.mesh.position.set(0.3, 0, -11);
    const down = G.peds.list[1];
    down.x = -2.5;
    down.z = -8;
    down.mesh.position.set(-2.5, 0, -8);
    G.peds.knockDown(down);
    const cop1 = G.police.spawnCop(5, -7);
    const cop2 = G.police.spawnCop(-5, -9);
    if (cop1) { cop1.heading = Math.PI; cop1.mesh.position.set(5, 0, -7); }
    if (cop2) { cop2.heading = Math.PI; cop2.mesh.position.set(-5, 0, -9); }
    const shooter = G.police.cruisers.find((c) => Math.hypot(c.x, c.z + 20) < 25) || G.police.cruisers[0];
    if (shooter) {
      shooter.x = -7;
      shooter.z = -20;
      shooter.heading = 0;
      shooter.mesh.position.set(-7, 0, -20);
      shooter.mesh.rotation.y = 0;
    }
    G.player.updateCamera(G.camera, STEP, null, true);
    G.shoot();
    // The shot may or may not catch the target in its 3° cone — make
    // the combat read regardless: the target goes down.
    if (target.state !== 'down') G.peds.knockDown(target);
    if (shooter) G.policeShot({ x: shooter.x, z: shooter.z }, { x: 1, z: -1 });
    G.hud.update(STEP);
    G.hud.el.toast.classList.add('hidden');
    freeze();
    return true;
  }

  return false;
}

export { clamp };
