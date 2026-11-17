// NEON HARBOR — pedestrians. They stroll the sidewalks, run away when
// scared, and fall over when shot or run down. Also builds the shared
// low-poly person mesh the player and the on-foot cops reuse.

import { CITY, ROADS, mulberry32, clamp, dist2, angleDiff } from './config.js';

const SHIRTS = [0xd84a5a, 0x4a7dd8, 0x4ad87a, 0xd8b84a, 0x9a4ad8, 0x4ad8c8, 0xe0e0e0];
const PANTS = [0x2a2f45, 0x3a2a22, 0x22303a, 0x4a4a4a];
const SKINS = [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0];

// A simple boxy person: legs, torso, head, hair, arms. `shirt` colours
// the torso; scale ~1.8 m tall.
export function makePersonMesh(shirt = 0xd8c84a, skin = 0xe8b88a) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.9 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2a2f45, roughness: 0.9 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 1 });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 0.18), pantsMat);
  legL.position.set(-0.11, 0.38, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), shirtMat);
  torso.position.y = 1.06;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), skinMat);
  head.position.y = 1.58;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.34), hairMat);
  hair.position.y = 1.78;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.14), shirtMat);
  armL.position.set(-0.33, 1.05, 0);
  const armR = armL.clone();
  armR.position.x = 0.33;
  for (const m of [legL, legR, torso, head, hair, armL, armR]) {
    m.castShadow = true;
    g.add(m);
  }
  g.userData = { legL, legR, armL, armR, torso, head };
  return g;
}

function sidewalkPoint(rng) {
  // A point on a sidewalk: beside a road, just outside the asphalt.
  const road = ROADS[Math.floor(rng() * ROADS.length)];
  const along = -290 + rng() * 580;
  const side = rng() < 0.5 ? -1 : 1;
  const off = CITY.roadWidth / 2 + 1.6;
  return rng() < 0.5
    ? { x: road + side * off, z: along }
    : { x: along, z: road + side * off };
}

export function createPeds(scene, city, seed = 7) {
  const rng = mulberry32(seed + 101);
  const list = [];

  function spawn(x, z) {
    const mesh = makePersonMesh(
      SHIRTS[Math.floor(rng() * SHIRTS.length)],
      SKINS[Math.floor(rng() * SKINS.length)],
    );
    scene.add(mesh);
    const p = {
      mesh,
      x,
      z,
      heading: rng() * Math.PI * 2,
      speed: 1.1 + rng() * 0.7,
      state: 'walk', // walk | flee | down
      target: sidewalkPoint(rng),
      downT: 0,
      walkPhase: rng() * Math.PI * 2,
      dead: false,
    };
    mesh.position.set(x, 0, z);
    list.push(p);
    return p;
  }

  for (let i = 0; i < 24; i++) {
    const s = sidewalkPoint(rng);
    spawn(s.x, s.z);
  }

  function update(dt, playerPos, playerCar) {
    for (const p of list) {
      if (p.state === 'down') {
        p.downT += dt;
        // Stay down a while, then get up and walk off shaken.
        if (p.downT > 6) {
          p.state = 'walk';
          p.downT = 0;
          p.target = sidewalkPoint(rng);
          p.mesh.rotation.x = 0;
          p.mesh.position.y = 0;
        }
        continue;
      }
      const tx = p.target.x;
      const tz = p.target.z;
      const dx = tx - p.x;
      const dz = tz - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 2) {
        p.target = sidewalkPoint(rng);
        continue;
      }
      const wantH = Math.atan2(dx, dz);
      p.heading += clamp(angleDiff(wantH, p.heading), -2.4 * dt, 2.4 * dt);
      const sp = p.state === 'flee' ? 4.4 : p.speed;
      p.x += Math.sin(p.heading) * sp * dt;
      p.z += Math.cos(p.heading) * sp * dt;
      p.x = clamp(p.x, -298, 298);
      p.z = clamp(p.z, -298, 298);
      city.resolveCircle(p, 0.5);
      // A car barrelling at a ped scares them off the road.
      const threat = playerCar;
      if (threat && Math.abs(threat.speed) > 6 && dist2(p.x, p.z, threat.x, threat.z) < 14) {
        fleeFrom(p, threat.x, threat.z);
      }
      // Walk-cycle swing.
      p.walkPhase += dt * sp * 3.2;
      const swing = Math.sin(p.walkPhase) * 0.5;
      p.mesh.userData.legL.rotation.x = swing;
      p.mesh.userData.legR.rotation.x = -swing;
      p.mesh.userData.armL.rotation.x = -swing * 0.7;
      p.mesh.userData.armR.rotation.x = swing * 0.7;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      if (p.state === 'flee' && d < 2) p.state = 'walk';
    }
  }

  function fleeFrom(p, fx, fz) {
    if (p.state === 'down') return;
    p.state = 'flee';
    // Run away from the threat, toward the nearest sidewalk.
    const dx = p.x - fx;
    const dz = p.z - fz;
    const d = Math.hypot(dx, dz) || 1;
    p.target = { x: p.x + (dx / d) * 30, z: p.z + (dz / d) * 30 };
  }

  function scareNear(x, z, r) {
    for (const p of list) {
      if (p.state !== 'down' && dist2(p.x, p.z, x, z) < r) fleeFrom(p, x, z);
    }
  }

  function knockDown(p) {
    if (p.state === 'down') return;
    p.state = 'down';
    p.downT = 0;
    p.mesh.rotation.x = -Math.PI / 2;
    p.mesh.position.y = 0.25;
  }

  // Nearest upright ped to (x, z) inside maxD, or null.
  function nearest(x, z, maxD) {
    let best = null;
    let bestD = maxD;
    for (const p of list) {
      if (p.state === 'down') continue;
      const d = dist2(p.x, p.z, x, z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  return { list, update, scareNear, knockDown, nearest, spawn };
}
