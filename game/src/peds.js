// NEON HARBOR — pedestrians: sidewalk walkers who flee from danger and
// get knocked down when hit. They may cross parks; cars treat them as
// scenery until the player runs one over (which is a crime).

import { CITY, mulberry32, pick } from './config.js';

const THREE = window.THREE;

const SHIRTS = [0xd84a4a, 0x4a7ad8, 0x4ad87a, 0xe0a83c, 0x9a4ad8, 0xdadada, 0x2f2f33, 0xd87a4a];

function makePedMesh(shirtColor) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.75, 0.28),
    new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.85 }),
  );
  body.position.y = 1.0;
  body.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8a075, roughness: 0.7 }),
  );
  head.position.y = 1.58;
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 }),
  );
  hair.position.y = 1.62;
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.62, 0.26),
    new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.9 }),
  );
  legs.position.y = 0.31;
  group.add(body, head, hair, legs);
  return group;
}

export class Peds {
  constructor(scene, city, seed = 7) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed + 303);
    this.list = [];
  }

  spawn(count = 24) {
    for (let i = 0; i < count; i++) {
      const p = this.city.randomRoadPoint(this.rng);
      const near = this.city.nearestRoad(p.x, p.z);
      const side = this.rng() < 0.5 ? -8.6 : 8.6;
      const x = near.axis === 'z' ? near.x + side : p.x;
      const z = near.axis === 'z' ? p.z : near.z + side;
      const mesh = makePedMesh(pick(this.rng, SHIRTS));
      mesh.position.set(x, 0, z);
      this.scene.add(mesh);
      this.list.push({
        x, z,
        heading: this.rng() * Math.PI * 2,
        speed: 1.0 + this.rng() * 0.7,
        mesh,
        state: 'walk', // walk | flee | down
        target: this._newTarget(x, z),
        downTimer: 0,
        walkPhase: this.rng() * Math.PI * 2,
      });
    }
  }

  _newTarget(x, z) {
    const p = this.city.randomRoadPoint(this.rng);
    const near = this.city.nearestRoad(p.x, p.z);
    const side = this.rng() < 0.5 ? -8.6 : 8.6;
    return {
      x: near.axis === 'z' ? near.x + side : p.x,
      z: near.axis === 'z' ? p.z : near.z + side,
    };
  }

  update(dt, time) {
    for (const ped of this.list) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.state = 'walk';
          ped.mesh.rotation.x = 0;
          ped.mesh.position.y = 0;
          ped.target = this._newTarget(ped.x, ped.z);
        }
        continue;
      }
      const speed = ped.state === 'flee' ? 4.6 : ped.speed;
      const dx = ped.target.x - ped.x;
      const dz = ped.target.z - ped.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) {
        ped.target = this._newTarget(ped.x, ped.z);
        if (ped.state === 'flee') ped.state = 'walk';
        continue;
      }
      ped.heading = Math.atan2(dx, dz);
      ped.x += (dx / d) * speed * dt;
      ped.z += (dz / d) * speed * dt;
      this.city.resolveCircle(ped, 0.5);
      // Little walking bob.
      ped.walkPhase += dt * speed * 4;
      ped.mesh.position.set(ped.x, Math.abs(Math.sin(ped.walkPhase)) * 0.05, ped.z);
      ped.mesh.rotation.y = ped.heading;
    }
  }

  // Everyone within `radius` of (x, z) runs away from it.
  scare(x, z, radius = 25) {
    for (const ped of this.list) {
      if (ped.state === 'down') continue;
      const dx = ped.x - x;
      const dz = ped.z - z;
      const d = Math.hypot(dx, dz);
      if (d < radius && d > 0.01) {
        ped.state = 'flee';
        const fleeDist = 40 + this.rng() * 20;
        ped.target = {
          x: ped.x + (dx / d) * fleeDist,
          z: ped.z + (dz / d) * fleeDist,
        };
      }
    }
  }

  knockDown(ped) {
    ped.state = 'down';
    ped.downTimer = 6;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.25;
  }

  nearest(x, z, maxD) {
    let best = null;
    let bestD = maxD;
    for (const ped of this.list) {
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < bestD) {
        best = ped;
        bestD = d;
      }
    }
    return best;
  }

  // Move a ped somewhere exact (screenshot staging).
  place(ped, x, z, heading = 0) {
    ped.x = x;
    ped.z = z;
    ped.heading = heading;
    ped.state = 'walk';
    ped.target = { x: x + Math.sin(heading) * 30, z: z + Math.cos(heading) * 30 };
    ped.mesh.position.set(x, 0, z);
    ped.mesh.rotation.y = heading;
    ped.mesh.rotation.x = 0;
  }
}
