// NEON HARBOR — pedestrians. They stroll the sidewalks, run away when
// scared (a crash or a gunshot nearby), and fall over when shot or run
// down. Also builds the shared low-poly person mesh the player reuses.

import { CITY, ROADS, mulberry32, clamp, dist2 } from './config.js';

const T = window.THREE;

const SHIRTS = [0xd84a4a, 0x4a7ad8, 0x4ad87a, 0xd8c84a, 0xd84ad8, 0x4ad8d8, 0xe8e8e8, 0x8a5a3a];
const SKINS = [0xc89878, 0x8a5a3a, 0xe8b898, 0x6a3a22];

export function makePersonMesh(shirtColor, skinColor) {
  const g = new T.Group();
  const shirt = new T.MeshStandardMaterial({ color: shirtColor, roughness: 0.85 });
  const skin = new T.MeshStandardMaterial({ color: skinColor, roughness: 0.8 });
  const pants = new T.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.9 });
  const torso = new T.Mesh(new T.BoxGeometry(0.55, 0.72, 0.3), shirt);
  torso.position.y = 1.06;
  torso.castShadow = true;
  const head = new T.Mesh(new T.BoxGeometry(0.34, 0.34, 0.34), skin);
  head.position.y = 1.64;
  const legs = new T.Mesh(new T.BoxGeometry(0.44, 0.68, 0.28), pants);
  legs.position.y = 0.34;
  const armL = new T.Mesh(new T.BoxGeometry(0.14, 0.6, 0.14), shirt);
  armL.position.set(-0.36, 1.05, 0);
  const armR = armL.clone();
  armR.position.x = 0.36;
  g.add(torso); g.add(head); g.add(legs); g.add(armL); g.add(armR);
  g.userData.torso = torso;
  return g;
}

export class Peds {
  constructor(scene, seed, count) {
    this.scene = scene;
    this.rng = mulberry32(seed + 33);
    this.list = [];
    for (let i = 0; i < count; i += 1) this.spawn();
  }

  spawn() {
    const rng = this.rng;
    const mesh = makePersonMesh(
      SHIRTS[Math.floor(rng() * SHIRTS.length)],
      SKINS[Math.floor(rng() * SKINS.length)],
    );
    // Start on a sidewalk: just off a road line, inside a block edge.
    const c = ROADS[Math.floor(rng() * ROADS.length)];
    const along = -CITY.half + rng() * CITY.half * 2;
    const side = rng() < 0.5 ? 1 : -1;
    const x = rng() < 0.5 ? c + side * (7 + rng() * 3) : along;
    const z = rng() < 0.5 ? along : c + side * (7 + rng() * 3);
    const ped = {
      mesh, x: clamp(x, -CITY.half, CITY.half), z: clamp(z, -CITY.half, CITY.half),
      heading: rng() * Math.PI * 2, speed: 1.1 + rng() * 0.9,
      down: false, downT: 0, scared: 0, walkPhase: rng() * 6,
    };
    mesh.position.set(ped.x, 0, ped.z);
    mesh.rotation.y = ped.heading;
    this.scene.add(mesh);
    this.list.push(ped);
    return ped;
  }

  scare(x, z, radius) {
    for (const p of this.list) {
      if (!p.down && dist2(p.x, p.z, x, z) < radius) p.scared = 3;
    }
  }

  knockDown(ped) {
    if (ped.down) return;
    ped.down = true;
    ped.downT = 0;
    ped.mesh.rotation.z = Math.PI / 2;
    ped.mesh.position.y = 0.3;
  }

  update(dt, resolveCollision, px, pz) {
    for (const p of this.list) {
      if (p.down) {
        p.downT += dt;
        if (p.downT > 12) {
          // Get back up and walk off.
          p.down = false;
          p.mesh.rotation.z = 0;
          p.mesh.position.y = 0;
          p.x = clamp(p.x + 20, -CITY.half, CITY.half);
        }
        continue;
      }
      if (p.scared > 0) {
        p.scared -= dt;
        p.speed = 4.2;
        // Run away from the player.
        const dx = p.x - px;
        const dz = p.z - pz;
        const d = Math.hypot(dx, dz) || 1;
        p.heading = Math.atan2(dx / d, dz / d);
      } else {
        p.speed = 1.3;
        if (this.rng() < 0.15 * dt) p.heading += (this.rng() - 0.5) * 1.6;
      }
      const nx = p.x + Math.sin(p.heading) * p.speed * dt;
      const nz = p.z + Math.cos(p.heading) * p.speed * dt;
      const hit = resolveCollision ? resolveCollision(nx, nz, 0.6) : { x: nx, z: nz };
      p.x = clamp(hit.x, -CITY.half, CITY.half);
      p.z = clamp(hit.z, -CITY.half, CITY.half);
      p.walkPhase += dt * p.speed * 2.2;
      p.mesh.position.set(p.x, Math.abs(Math.sin(p.walkPhase)) * 0.06, p.z);
      p.mesh.rotation.y = p.heading;
    }
  }

  // Pedestrians near (x, z) — used to stage dense crowds for screenshots.
  near(x, z, radius) {
    return this.list.filter((p) => !p.down && dist2(p.x, p.z, x, z) < radius);
  }
}
