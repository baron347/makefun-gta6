// NEON HARBOR — procedural sunset city. A canvas texture paints the
// ground (asphalt, sidewalks, lane dashes, crosswalks); buildings are
// boxes with per-facade window textures in varied sunset colors; the
// ground floors glow with lit shopfronts instead of flat black; downtown
// carries neon billboards; simple traffic lights cycle at intersections.
// Also owns collision: building AABBs the player and cars push out of.

import { CITY, ROADS, mulberry32 } from './config.js';

// three.js is vendored as the UMD build (game/vendor/three.min.js) and
// loaded by index.html before any module runs, so window.THREE is the
// only source of the API.
const T = window.THREE;

const FACADE_COLORS = [
  0x8a5a3b, 0x6b4a6e, 0x3b5a7a, 0x7a6a3b, 0x5a7a5a, 0x9a6a4a,
  0x4a6a7a, 0x7a3b4a, 0x5a4a6a, 0x8a7a5a, 0x3b4a5a, 0x6e3b5a,
];
const NEON_COLORS = [0xff2e88, 0x00e5ff, 0xffc861, 0x7cff5a, 0xff6a3b, 0xc05aff];
const SHOP_COLORS = [0xffc861, 0x7ce8ff, 0xff9a5a, 0xb8ff7c, 0xff7ad9];

function groundTexture() {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  const span = CITY.half * 2;
  const px = (v) => ((v + CITY.half) / span) * S;
  g.fillStyle = '#3a3345'; g.fillRect(0, 0, S, S);
  // Blocks: warm sidewalk slabs.
  g.fillStyle = '#6e6258';
  for (let i = 0; i < CITY.blocks; i += 1) {
    for (let j = 0; j < CITY.blocks; j += 1) {
      const x0 = px(-CITY.half + i * CITY.pitch + CITY.roadWidth / 2);
      const z0 = px(-CITY.half + j * CITY.pitch + CITY.roadWidth / 2);
      const w = px(CITY.pitch - CITY.roadWidth) - px(0);
      g.fillRect(x0, z0, w, w);
    }
  }
  // Roads: dark asphalt strips.
  g.fillStyle = '#23202e';
  for (const c of ROADS) {
    const w = px(CITY.roadWidth) - px(0);
    g.fillRect(px(c) - w / 2, 0, w, S);
    g.fillRect(0, px(c) - w / 2, S, w);
  }
  // Lane dashes.
  g.fillStyle = '#c9b458';
  for (const c of ROADS) {
    for (let a = -CITY.half + 8; a < CITY.half; a += 24) {
      g.fillRect(px(c) - 1.5, px(a), 3, 9);
      g.fillRect(px(a), px(c) - 1.5, 9, 3);
    }
  }
  // Crosswalks at every intersection.
  g.fillStyle = 'rgba(235,235,225,0.85)';
  for (const cx of ROADS) {
    for (const cz of ROADS) {
      for (let k = -3; k <= 3; k += 1) {
        g.fillRect(px(cx + k * 1.8) - 1.4, px(cz - 8), 2.8, 5);
        g.fillRect(px(cx + k * 1.8) - 1.4, px(cz + 3), 2.8, 5);
      }
    }
  }
  const tex = new T.CanvasTexture(cv);
  tex.anisotropy = 4;
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

function facadeTexture(base, litRatio, rng) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 256;
  const g = cv.getContext('2d');
  const c = new T.Color(base);
  g.fillStyle = '#' + c.getHexString();
  g.fillRect(0, 0, 128, 256);
  // Slight vertical shade so the top reads darker in the sunset.
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,150,80,0.18)');
  grad.addColorStop(1, 'rgba(20,10,40,0.35)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  // Windows: some warm-lit, some dark.
  for (let r = 0; r < 10; r += 1) {
    for (let col = 0; col < 5; col += 1) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? (rng() < 0.7 ? '#ffd98a' : '#8ad8ff') : 'rgba(15,12,28,0.85)';
      g.fillRect(10 + col * 23, 12 + r * 24, 15, 14);
    }
  }
  const tex = new T.CanvasTexture(cv);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

function shopfrontTexture(color, rng) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 32;
  const g = cv.getContext('2d');
  g.fillStyle = '#1c1426'; g.fillRect(0, 0, 128, 32);
  const c = new T.Color(color);
  g.fillStyle = '#' + c.getHexString();
  g.globalAlpha = 0.9;
  for (let i = 0; i < 4; i += 1) {
    g.fillRect(6 + i * 31, 5, 24, 22);
  }
  g.globalAlpha = 1;
  g.fillStyle = '#ffd98a';
  g.fillRect(0, 0, 128, 3);
  const tex = new T.CanvasTexture(cv);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, seed) {
  const rng = mulberry32(seed);
  const colliders = [];
  const trafficLights = [];
  const group = new T.Group();
  group.name = 'city';
  scene.add(group);

  // Sky dome + sun + fog.
  const sky = new T.Mesh(
    new T.SphereGeometry(900, 16, 12),
    new T.MeshBasicMaterial({ color: 0x2a1745, side: T.BackSide, fog: false }),
  );
  group.add(sky);
  const sun = new T.Mesh(
    new T.CircleGeometry(60, 32),
    new T.MeshBasicMaterial({ color: 0xff9a3b, fog: false }),
  );
  sun.position.set(-520, 120, -720);
  sun.lookAt(0, 60, 0);
  group.add(sun);
  scene.fog = new T.Fog(0x2a1745, 220, 780);

  // Ground.
  const ground = new T.Mesh(
    new T.PlaneGeometry(CITY.half * 2 + 80, CITY.half * 2 + 80),
    new T.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Harbor water strip on the south edge.
  const water = new T.Mesh(
    new T.PlaneGeometry(CITY.half * 2 + 80, 70),
    new T.MeshStandardMaterial({ color: 0x14324a, roughness: 0.25, metalness: 0.4 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.05, CITY.half + 70);
  group.add(water);

  // Buildings, parks, billboards, traffic lights.
  const downtown = (bx, bz) => Math.abs(bx) <= 90 && Math.abs(bz) <= 90;
  const parkSet = new Set(['2,5', '6,2', '4,7', '7,6']);
  for (let i = 0; i < CITY.blocks; i += 1) {
    for (let j = 0; j < CITY.blocks; j += 1) {
      const bx = -CITY.half + i * CITY.pitch + CITY.pitch / 2;
      const bz = -CITY.half + j * CITY.pitch + CITY.pitch / 2;
      if (parkSet.has(i + ',' + j)) {
        // Park: green slab + a few palms.
        const lawn = new T.Mesh(
          new T.BoxGeometry(CITY.pitch - CITY.roadWidth - 4, 0.4, CITY.pitch - CITY.roadWidth - 4),
          new T.MeshStandardMaterial({ color: 0x2e5a34, roughness: 1 }),
        );
        lawn.position.set(bx, 0.2, bz);
        group.add(lawn);
        for (let p = 0; p < 5; p += 1) {
          const px2 = bx + (rng() - 0.5) * 34;
          const pz2 = bz + (rng() - 0.5) * 34;
          const trunk = new T.Mesh(
            new T.CylinderGeometry(0.25, 0.35, 5, 6),
            new T.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 }),
          );
          trunk.position.set(px2, 2.5, pz2);
          const top = new T.Mesh(
            new T.ConeGeometry(2.2, 3.2, 7),
            new T.MeshStandardMaterial({ color: 0x2e7a3a, roughness: 1 }),
          );
          top.position.set(px2, 6.2, pz2);
          group.add(trunk); group.add(top);
        }
        continue;
      }
      const tall = downtown(bx, bz);
      const h = tall ? 26 + rng() * 42 : 9 + rng() * 16;
      const w = 26 + rng() * 12;
      const d = 26 + rng() * 12;
      const base = FACADE_COLORS[Math.floor(rng() * FACADE_COLORS.length)];
      const facade = facadeTexture(base, tall ? 0.55 : 0.35, rng);
      const side = new T.MeshStandardMaterial({ map: facade, roughness: 0.85 });
      const roof = new T.MeshStandardMaterial({ color: 0x241a30, roughness: 1 });
      const tower = new T.Mesh(new T.BoxGeometry(w, h, d), [side, side, roof, roof, side, side]);
      tower.position.set(bx, h / 2, bz);
      tower.castShadow = true;
      group.add(tower);
      colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });

      // Lit shopfront strip on the ground floor, facing the nearest road.
      const shop = new T.Mesh(
        new T.PlaneGeometry(w * 0.9, 3.4),
        new T.MeshBasicMaterial({ map: shopfrontTexture(SHOP_COLORS[Math.floor(rng() * SHOP_COLORS.length)], rng) }),
      );
      shop.position.set(bx, 1.9, bz + d / 2 + 0.06);
      group.add(shop);
      const shop2 = shop.clone();
      shop2.position.set(bx, 1.9, bz - d / 2 - 0.06);
      shop2.rotation.y = Math.PI;
      group.add(shop2);

      // Neon billboard downtown.
      if (tall && rng() < 0.55) {
        const neon = NEON_COLORS[Math.floor(rng() * NEON_COLORS.length)];
        const board = new T.Mesh(
          new T.BoxGeometry(12 + rng() * 8, 5, 0.6),
          new T.MeshBasicMaterial({ color: neon }),
        );
        board.position.set(bx, h + 3.5, bz + d / 2 + 0.4);
        group.add(board);
        const glow = new T.Mesh(
          new T.PlaneGeometry(13, 1.1),
          new T.MeshBasicMaterial({ color: 0xffffff }),
        );
        glow.position.set(bx, h + 3.5, bz + d / 2 + 0.75);
        group.add(glow);
        const light = new T.PointLight(neon, 12, 45);
        light.position.set(bx, h + 2, bz + d / 2 + 6);
        group.add(light);
      }
    }
  }

  // Streetlights along the roads.
  for (const c of ROADS) {
    for (let a = -CITY.half + 30; a <= CITY.half - 30; a += 60) {
      const pole = new T.Mesh(
        new T.CylinderGeometry(0.12, 0.16, 7, 6),
        new T.MeshStandardMaterial({ color: 0x2a2a33, roughness: 0.7 }),
      );
      pole.position.set(c + CITY.roadWidth / 2 + 1, 3.5, a);
      group.add(pole);
      const lamp = new T.Mesh(
        new T.SphereGeometry(0.5, 8, 6),
        new T.MeshBasicMaterial({ color: 0xffd98a }),
      );
      lamp.position.set(c + CITY.roadWidth / 2 + 1, 7.1, a);
      group.add(lamp);
    }
  }

  // Traffic lights: a pole + three lamps at every other intersection.
  // Visual only — they cycle green/yellow/red on a timer.
  const lampMats = {
    red: new T.MeshBasicMaterial({ color: 0x881111 }),
    yellow: new T.MeshBasicMaterial({ color: 0x887711 }),
    green: new T.MeshBasicMaterial({ color: 0x118811 }),
  };
  for (let i = 1; i < ROADS.length - 1; i += 2) {
    for (let j = 1; j < ROADS.length - 1; j += 2) {
      const cx = ROADS[i];
      const cz = ROADS[j];
      const pole = new T.Mesh(
        new T.CylinderGeometry(0.14, 0.18, 6.4, 6),
        new T.MeshStandardMaterial({ color: 0x222226, roughness: 0.7 }),
      );
      pole.position.set(cx + CITY.roadWidth / 2 + 0.6, 3.2, cz + CITY.roadWidth / 2 + 0.6);
      group.add(pole);
      const box = new T.Mesh(
        new T.BoxGeometry(0.7, 2.2, 0.7),
        new T.MeshStandardMaterial({ color: 0x15151a, roughness: 0.8 }),
      );
      box.position.set(cx + CITY.roadWidth / 2 + 0.6, 6.6, cz + CITY.roadWidth / 2 + 0.6);
      group.add(box);
      const lamps = {};
      const offsets = { red: 0.7, yellow: 0, green: -0.7 };
      for (const [name, off] of Object.entries(offsets)) {
        const lamp = new T.Mesh(
          new T.SphereGeometry(0.26, 8, 6),
          lampMats[name].clone(),
        );
        lamp.position.set(cx + CITY.roadWidth / 2 + 0.6, 6.6 + off, cz + CITY.roadWidth / 2 + 1.0);
        group.add(lamp);
        lamps[name] = lamp;
      }
      trafficLights.push({ x: cx, z: cz, lamps, phase: (i + j) % 3 });
    }
  }

  function update(dt, t) {
    // Cycle the traffic lights every ~4 s, offset per intersection.
    for (const tl of trafficLights) {
      const cycle = Math.floor(t / 4 + tl.phase) % 3;
      const on = cycle === 0 ? 'green' : cycle === 1 ? 'yellow' : 'red';
      for (const [name, lamp] of Object.entries(tl.lamps)) {
        const m = lamp.material;
        if (name === on) {
          m.color.set(name === 'green' ? 0x22ff44 : name === 'yellow' ? 0xffcc22 : 0xff2222);
        } else {
          m.color.set(name === 'green' ? 0x0a3312 : name === 'yellow' ? 0x332a08 : 0x330a0a);
        }
      }
    }
  }

  // Push a circle (x, z, radius) out of every building AABB it overlaps.
  function resolveCollision(x, z, r) {
    let nx = x;
    let nz = z;
    for (const b of colliders) {
      const cx = Math.max(b.minX, Math.min(nx, b.maxX));
      const cz = Math.max(b.minZ, Math.min(nz, b.maxZ));
      const dx = nx - cx;
      const dz = nz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          nx = cx + (dx / d) * r;
          nz = cz + (dz / d) * r;
        } else {
          nx = b.maxX + r;
        }
      }
    }
    return { x: nx, z: nz };
  }

  return { group, colliders, trafficLights, update, resolveCollision };
}
