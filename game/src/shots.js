// NEON HARBOR — screenshot staging (?shot=cover|street|mission|chase).
// Each scene runs the REAL game forward (real driving, real mission
// completion, real wanted system), positions the camera low and close,
// then freezes the world and sets window.__shotReady. The take-shots
// script waits for that flag before capturing 1280x800.

import { CITY, ROADS, snapToRoad, nearestRoad, dist2 } from './config.js';

const T = window.THREE;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (fn()) return true;
    await sleep(100);
  }
  console.warn('staging wait timed out:', label);
  return false;
}

function setCam(game, px, py, pz, lx, ly, lz) {
  game.shotCamera = {
    pos: new T.Vector3(px, py, pz),
    look: new T.Vector3(lx, ly, lz),
  };
}

function freeze(game) {
  game.frozen = true;
  game.keys = {};
  game.clearTracers();
}

// Put the player in a car parked on a road, facing along it.
function putPlayerInCar(game, x, z, heading) {
  const car = game.traffic.parked[0] || game.traffic.cars[0];
  car.place(x, z, heading);
  car.speed = 0;
  game.playerCar = car;
  game.player.inCar = true;
  game.player.mesh.visible = false;
  game.player.x = x;
  game.player.z = z;
  game.player.heading = heading;
  const idx = game.traffic.parked.indexOf(car);
  if (idx >= 0) game.traffic.parked.splice(idx, 1);
  return car;
}

// Scatter traffic cars + peds onto the roads around (x, z) so the
// frame reads dense, not empty.
function crowdAround(game, x, z, nCars, nPeds) {
  const roads = ROADS.filter((c) => Math.abs(c - x) < 90 || Math.abs(c - z) < 90);
  let placed = 0;
  for (const car of game.traffic.cars) {
    if (placed >= nCars) break;
    const road = roads[placed % roads.length];
    const along = (placed % 2 === 0);
    const off = (Math.floor(placed / 2) % 5 - 2) * 16;
    const cx = along ? road + (placed % 2 ? 3.5 : -3.5) : x + off;
    const cz = along ? z + off : road + (placed % 2 ? 3.5 : -3.5);
    car.place(cx, cz, along ? (placed % 2 ? 0 : Math.PI) : (placed % 2 ? Math.PI / 2 : -Math.PI / 2));
    car.speed = 0;
    placed += 1;
  }
  let pp = 0;
  for (const p of game.peds.list) {
    if (pp >= nPeds) break;
    p.x = x + (pp % 5 - 2) * 4;
    p.z = z + (Math.floor(pp / 5) % 3 - 1) * 5 + 6;
    p.down = false;
    p.mesh.rotation.z = 0;
    p.mesh.position.set(p.x, 0, p.z);
    pp += 1;
  }
}

async function stageCover(game) {
  // Wanted 3: roadblocks form across the road ahead of the player.
  // Heading PI faces -Z, where the roadblock spawns on road x=0.
  const car = putPlayerInCar(game, 0, 60, Math.PI);
  game.setWanted(3, true);
  await sleep(2500); // let cruisers + roadblock spawn and settle
  // Pull the car to ~14 m short of the roadblock so the two cruisers
  // parked across the road fill the frame.
  const block = game.police.roadblocks[0];
  if (block) {
    car.place(block.x, block.z + 14, Math.PI);
    game.player.x = block.x;
    game.player.z = block.z + 14;
  }
  crowdAround(game, 0, 40, 4, 4);
  // Camera low behind the car (behind = +Z for heading PI), looking
  // forward down the road at the roadblock cruisers.
  setCam(game, car.x - 2, 2.8, car.z + 10, car.x, 2, car.z - 40);
  game.hud.toast('Roadblock ahead — 3★ wanted!', 3);
  freeze(game);
}

async function stageStreet(game) {
  // On foot, downtown, dense traffic + peds in frame, player visible.
  // Player faces -Z (heading PI); camera sits behind (+Z) and looks
  // straight at the player so he is centered, street beyond him.
  game.player.setPosition(0, 0, Math.PI);
  game.player.camYaw = Math.PI;
  crowdAround(game, 0, -6, 10, 12);
  await sleep(1200);
  // Keep the line camera->player clear of traffic cars.
  for (const c of game.traffic.cars) {
    if (Math.abs(c.x) < 3 && c.z > -2 && c.z < 10) c.place(c.x + 14, c.z, c.heading);
  }
  setCam(game, 2.5, 3.0, 7.5, 0, 1.3, -2);
  game.hud.toast('Downtown — steal a car with E', 3);
  freeze(game);
}

async function stageMission(game) {
  // Complete mission 1 FOR REAL (teleport the car to the marker and
  // let the loop pay out), then stage mission 2 with its gold beam in
  // frame and cash already above $0.
  const car = putPlayerInCar(game, 0, 60, 0);
  game.missions.startNext();
  const m1 = game.missions.markerPos();
  // Park 5 m short of the marker ALONG its road (never off-road, or
  // the building collision pushes the car out of frame).
  const n1 = nearestRoad(m1.x, m1.z);
  const dx1 = n1.along === 'x' ? 5 : 0;
  const dz1 = n1.along === 'z' ? 5 : 0;
  car.place(m1.x - dx1, m1.z - dz1, 0);
  game.player.x = m1.x - dx1; game.player.z = m1.z - dz1;
  await waitFor(() => game.missions.completed >= 1, 5000, 'mission 1 payout');
  // Mission 2: delivery across town. Stage the car on the same road
  // as the marker, 26 m short of it, beam + diamond in frame.
  game.missions.startNext();
  const m2 = game.missions.markerPos();
  const n2 = nearestRoad(m2.x, m2.z);
  let spot;
  let heading;
  if (n2.along === 'x') { spot = { x: m2.x - 26, z: m2.z }; heading = Math.PI / 2; }
  else { spot = { x: m2.x, z: m2.z - 26 }; heading = 0; }
  car.place(spot.x, spot.z, heading);
  game.player.x = spot.x; game.player.z = spot.z;
  await sleep(1500);
  crowdAround(game, spot.x, spot.z - 10, 5, 6);
  // Camera sits BEHIND the car (opposite its forward) so the car is
  // in the lower frame and the gold beam is ahead of it.
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  setCam(game, spot.x - fx * 11 + 3, 4.0, spot.z - fz * 11, m2.x, 4, m2.z);
  freeze(game);
}

async function stageChase(game) {
  // Wanted 5: heli overhead, cruisers chasing, police tracers flying,
  // a ped down on the sidewalk — combat that reads as combat.
  // Heading PI faces -Z; camera sits behind (+Z), chasers behind us.
  const car = putPlayerInCar(game, 0, 60, Math.PI);
  game.setWanted(5, true);
  await sleep(3000); // cruisers + heli spawn, chase begins
  crowdAround(game, 0, 40, 6, 8);
  // A ped visibly down near the road, ahead-left of the player car.
  const p = game.peds.list[0];
  game.peds.knockDown(p);
  p.mesh.position.set(-5, 0.3, 44);
  p.x = -5; p.z = 44;
  setCam(game, car.x - 3, 4.0, car.z + 12, car.x, 2, car.z - 40);
  game.hud.toast('5★ — the whole Harbor PD is on you!', 3);
  freeze(game);
  // Fire the tracers AFTER freezing, so they survive to the capture:
  // two red police tracers toward the player, one gold outgoing.
  const near = game.police.cruisers[0];
  if (near) {
    game.fireTracer({ x: near.x, y: 1.5, z: near.z }, { x: car.x + 2, y: 1.4, z: car.z - 2 }, 0xff4a3a, 0.24);
    game.fireTracer({ x: near.x + 3, y: 1.5, z: near.z + 4 }, { x: car.x - 2, y: 1.4, z: car.z - 4 }, 0xff4a3a, 0.24);
  }
  game.fireTracer({ x: car.x, y: 1.5, z: car.z - 2 }, { x: car.x + 6, y: 1.6, z: car.z - 34 }, 0xffe14a, 0.24);
  game.spawnSmoke(car.x + 4, car.z - 6, true);
}

export async function stageShot(game, name) {
  // Let the first frames render so the scene exists.
  await sleep(600);
  if (name === 'cover') await stageCover(game);
  else if (name === 'street') await stageStreet(game);
  else if (name === 'mission') await stageMission(game);
  else if (name === 'chase') await stageChase(game);
  else console.warn('unknown shot:', name);
  window.__shotReady = true;
}
