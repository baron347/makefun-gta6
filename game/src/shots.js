// NEON HARBOR — deterministic screenshot staging (?shot= + ?seed=7).
// Each scene drives the REAL game forward with a scripted autopilot for
// a fixed number of 1/60 s steps, then freezes the frame and sets
// window.__shotReady. The take-shots script waits for that flag.

import { angleDiff, clamp, dist2 } from './config.js';
import { repaintCar } from './vehicles.js';

const STEP = 1 / 60;

function stepN(game, n) {
  for (let i = 0; i < n; i++) game.tick(STEP);
}

// Set the player's key state for the autopilot, then step once.
function driveStep(game, { forward = true, back = false, left = false, right = false, handbrake = false } = {}) {
  const k = game.keys;
  k.clear();
  if (forward) k.add('KeyW');
  if (back) k.add('KeyS');
  if (left) k.add('KeyA');
  if (right) k.add('KeyD');
  if (handbrake) k.add('Space');
  game.tick(STEP);
}

// Manhattan autopilot: drive along the current road axis toward the
// target; turn only near intersections. Never steer straight at the
// target — that drives through buildings. `stuck` detection reverses
// briefly when the car stops making progress.
export function gridDrive(game, target, seconds) {
  const car = game.playerCar;
  if (!car) return;
  const steps = Math.round(seconds * 60);
  let stuckT = 0;
  let reversing = 0;
  let lastD = dist2(car.x, car.z, target.x, target.z);
  for (let i = 0; i < steps; i++) {
    const d = dist2(car.x, car.z, target.x, target.z);
    if (d < 6) break;
    if (reversing > 0) {
      reversing--;
      driveStep(game, { forward: false, back: true });
      continue;
    }
    if (Math.abs(car.speed) < 1.5) {
      stuckT += STEP;
      if (stuckT > 1.5) {
        reversing = Math.round(0.9 * 60);
        stuckT = 0;
        continue;
      }
    } else {
      stuckT = 0;
    }
    // Which axis are we driving on? The one our heading is closest to.
    const onXAxis = Math.abs(Math.sin(car.heading)) > Math.abs(Math.cos(car.heading));
    // Desired heading: along the current axis toward the target's road,
    // turning only when we are near the intersection with that road.
    let desired;
    if (onXAxis) {
      const targetRoadZ = game.city.nearestRoad(target.x, target.z).z;
      const dzRoad = targetRoadZ - car.z;
      if (Math.abs(dzRoad) < 4) {
        desired = target.x > car.x ? Math.PI / 2 : -Math.PI / 2;
      } else {
        desired = car.heading; // keep going along X until the turn road
        if (Math.abs(car.z - targetRoadZ) < 14) {
          // Approaching the turn: aim for the intersection.
          desired = dzRoad > 0 ? 0 : Math.PI;
          // Blend: steer toward the target road only when close.
          if (Math.abs(car.z - targetRoadZ) > 6) desired = car.heading;
        }
      }
    } else {
      const targetRoadX = game.city.nearestRoad(target.x, target.z).x;
      const dxRoad = targetRoadX - car.x;
      if (Math.abs(dxRoad) < 4) {
        desired = target.z > car.z ? 0 : Math.PI;
      } else {
        desired = car.heading;
        if (Math.abs(car.x - targetRoadX) < 14) {
          desired = dxRoad > 0 ? Math.PI / 2 : -Math.PI / 2;
          if (Math.abs(car.x - targetRoadX) > 6) desired = car.heading;
        }
      }
    }
    const turn = angleDiff(car.heading, desired);
    const handbrake = Math.abs(turn) > 0.6;
    driveStep(game, {
      forward: !handbrake || Math.abs(car.speed) < 4,
      left: turn > 0.06,
      right: turn < -0.06,
      handbrake,
    });
    lastD = d;
  }
  game.keys.clear();
}

function stealParkedNear(game, x, z) {
  game.player.setPosition(x, z, 0);
  game.stealNearestCar();
  return game.playerCar;
}

function nearestParked(game, x, z) {
  let best = null;
  let bestD = 1e9;
  for (const c of game.traffic.parked) {
    const d = dist2(c.x, c.z, x, z);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

// --- Shot 1: cover / chase -------------------------------------------------
function shotCover(game) {
  // Cash above $0 in frame: finish job 1 first, for real.
  game.missions.startNext();
  const marker = game.missions.markerPos();
  const car0 = nearestParked(game, 0, 60);
  game.player.setPosition(car0.x + 2.6, car0.z, car0.heading);
  game.stealNearestCar();
  const car = game.playerCar;
  car.x = marker.x;
  car.z = marker.z - 5;
  car.heading = 0;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = 0;
  stepN(game, 30); // mission 1 completes, +$150
  // Chase staging.
  repaintCar(car, 0xd8232a);
  car.x = 0;
  car.z = -180;
  car.heading = 0;
  car.speed = 0;
  car.mesh.position.set(0, 0, -180);
  car.mesh.rotation.y = 0;
  game.setWanted(3);
  gridDrive(game, { x: 0, z: 240 }, 6);
  // A cruiser alongside ahead-left so the chase reads in frame.
  game.police.parkAlongside(car, 12, -4.5);
  game.hud.hideToast();
  game.freezeFrame();
}

// --- Shot 2: street ---------------------------------------------------------
function shotStreet(game) {
  // Pack 3 traffic cars + 6 peds onto the downtown avenue.
  const spots = [
    { x: 3.5, z: -14, h: 0 },
    { x: -3.5, z: -44, h: 0 },
    { x: -26, z: 0, h: Math.PI / 2 },
  ];
  game.traffic.cars.slice(0, 3).forEach((c, i) => {
    const s = spots[i];
    c.x = s.x;
    c.z = s.z;
    c.heading = s.h;
    c.speed = 0;
    c.hold = true; // stay put for the shot
    c.mesh.position.set(s.x, 0, s.z);
    c.mesh.rotation.y = s.h;
  });
  const pedSpots = [
    { x: 8.6, z: 14 }, { x: 8.6, z: -2 }, { x: 8.6, z: -16 },
    { x: -8.6, z: 10 }, { x: -8.6, z: -6 }, { x: -8.6, z: -14 },
  ];
  game.peds.list.slice(0, 6).forEach((p, i) => {
    const s = pedSpots[i];
    game.peds.place(p, s.x, s.z, Math.PI);
    p.target = { x: s.x, z: s.z - 12 }; // keep them walking nearby
  });
  // Player walks north for 2 s.
  game.player.setPosition(2, 20, Math.PI);
  game.player.camYaw = 0;
  game.keys.clear();
  game.keys.add('KeyW');
  game.keys.add('ShiftLeft');
  stepN(game, 120);
  game.keys.clear();
  // Diagonal 3/4 camera.
  const p = game.player;
  game.cameraOverride = {
    pos: { x: p.x + 6, y: 4.5, z: p.z + 7.5 },
    look: { x: p.x - 3, y: 1.5, z: p.z - 8 },
  };
  game.hud.hideToast();
  game.freezeFrame();
}

// --- Shot 3: mission ---------------------------------------------------------
function shotMission(game) {
  // Cash above $0 in frame: finish job 1 first, for real.
  const car0 = nearestParked(game, 0, 120);
  game.player.setPosition(car0.x + 2.6, car0.z, car0.heading);
  game.stealNearestCar();
  const car = game.playerCar;
  game.missions.startNext(); // First Pickup
  const m1 = game.missions.markerPos();
  car.x = m1.x;
  car.z = m1.z - 5;
  car.heading = 0;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = 0;
  stepN(game, 30); // +$150
  // Now the real shot: Hot Delivery sets wanted 2; stepping out and
  // stealing the car again adds the third star.
  game.missions.index = 1;
  game.missions.startNext(); // Hot Delivery, wanted 2, 150 s
  game.exitCar();
  game.player.setPosition(car.x + 2.6, car.z, car.heading);
  game.stealNearestCar();
  repaintCar(car, 0xe0a83c);
  car.x = 0;
  car.z = 120;
  car.heading = Math.PI;
  car.speed = 0;
  car.mesh.position.set(0, 0, 120);
  car.mesh.rotation.y = Math.PI;
  const marker = game.missions.markerPos();
  gridDrive(game, marker, 4);
  // Re-pose on the marker's own road, 60 m short of it, heading straight
  // at it at 22 m/s — so the gold beam is dead-centre in frame.
  const road = game.city.nearestRoad(marker.x, marker.z);
  let nx = marker.x;
  let nz = marker.z;
  let head = 0;
  if (road.axis === 'z') {
    nx = road.x;
    if (marker.z + 60 <= 295) { nz = marker.z + 60; head = Math.PI; }
    else { nz = marker.z - 60; head = 0; }
  } else {
    nz = road.z;
    if (marker.x + 60 <= 295) { nx = marker.x + 60; head = -Math.PI / 2; }
    else { nx = marker.x - 60; head = Math.PI / 2; }
  }
  car.x = nx;
  car.z = nz;
  car.heading = head;
  car.speed = 22;
  car.mesh.position.set(nx, 0, nz);
  car.mesh.rotation.y = head;
  // Snap the chase camera behind the car (no lerp after a teleport).
  snapChaseCamera(game, car);
  game.police.pushCruisersAway(car.x, car.z, 14);
  game.police.parkAlongside(car, 12, -4.5);
  game.hud.hideToast();
  game.freezeFrame();
}

// Place the chase camera directly behind `car` and look ahead of it.
function snapChaseCamera(game, car) {
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  game.camera.position.set(car.x - fx * 8.5, 3.6, car.z - fz * 8.5);
  game.camera.lookAt(car.x + fx * 6, 1.4, car.z + fz * 6);
  game.cameraOverride = null;
}

// --- Shot 4: shootout ---------------------------------------------------------
function shotChase(game) {
  game.setWanted(5);
  game.player.setPosition(0, 0, Math.PI);
  game.player.camYaw = 0;
  game.player.camPitch = 0.5;
  // Stand still 2.5 s while the cruisers close in.
  stepN(game, 150);
  // Safety: if a foot cop busted the player mid-stand, reset the scene.
  if (game.state !== 'playing') {
    game.state = 'playing';
    game.hud.showScreen(null);
    game.player.setPosition(0, 0, Math.PI);
    game.setWanted(5);
  }
  for (const cop of game.police.cops) game.scene.remove(cop.mesh);
  game.police.cops = [];
  game.police.pushCruisersAway(0, 0, 8);
  // A target standing in the street ahead, dead-centre in the crosshair.
  game.peds.place(game.peds.list[0], 0, -14, 0);
  game.peds.list[0].target = { x: 0, z: -14 };
  // Low 3/4 camera (pitch 0.5, dist 10), looking level down the street
  // so the shot travels forward, then fire once for the flash.
  game.cameraOverride = {
    pos: { x: 0, y: 1.6 + Math.sin(0.5) * 10, z: Math.cos(0.5) * 10 },
    look: { x: 0, y: 1.2, z: -30 },
  };
  game.tick(STEP); // apply the override once
  game.shoot();
  game.hud.update();
  game.freezeFrame();
}

export function runShot(game, kind) {
  switch (kind) {
    case 'cover':
      shotCover(game);
      break;
    case 'street':
      shotStreet(game);
      break;
    case 'mission':
      shotMission(game);
      break;
    case 'chase':
      shotChase(game);
      break;
    default:
      game.freezeFrame();
      break;
  }
}
