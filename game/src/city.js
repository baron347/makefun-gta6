// NEON HARBOR — procedural sunset city. One 2048px canvas texture paints
// the whole ground (roads, sidewalks, dashes, crosswalks); buildings are
// boxes with generated window facades, taller downtown; 7 blocks are
// parks; streetlights, palms, a gradient sky dome and a low sun finish
// the sunset. Also owns collision: building AABBs and park rects.

import { CITY, ROADS, mulberry32, clamp } from './config.js';

const PX_PER_M = 2048 / (CITY.half * 2);
const toPx = (v) => (v + CITY.half) * PX_PER_M;

function makeFacadeTexture(rng, hue) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = hue;
  g.fillRect(0, 0, 128, 256);
  // Window grid: roughly one window per 2.6 m of facade.
  const cols = 6;
  const rows = 12;
  const ww = 128 / cols;
  const wh = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = rng() < 0.42;
      if (lit) {
        g.fillStyle = rng() < 0.6 ? 'rgba(255,196,110,0.95)' : 'rgba(150,210,255,0.9)';
      } else {
        g.fillStyle = 'rgba(12,14,26,0.9)';
      }
      g.fillRect(col * ww + 3, r * wh + 4, ww - 6, wh - 8);
    }
  }
  // Ground floor: a lit storefront, not a black band — warm shop
  // windows, a door, and a thin neon awning strip.
  const neon = ['#ff2fb3', '#4be3ff', '#ffc861', '#4be37a'][Math.floor(rng() * 4)];
  g.fillStyle = '#2a1e33';
  g.fillRect(0, 256 - 24, 128, 24);
  g.fillStyle = 'rgba(255,200,120,0.95)';
  g.fillRect(8, 256 - 20, 44, 16);
  g.fillRect(76, 256 - 20, 44, 16);
  g.fillStyle = '#1a1210';
  g.fillRect(56, 256 - 20, 16, 20);
  g.fillStyle = neon;
  g.fillRect(0, 256 - 26, 128, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function paintGround(rng) {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  // Base: block slabs.
  g.fillStyle = '#4a4358';
  g.fillRect(0, 0, S, S);
  // Sidewalk strips around every block: the ring between the asphalt
  // edge and the block content (3 m on each side).
  g.fillStyle = '#8a8098';
  for (let i = 0; i < CITY.blocks; i++) {
    for (let j = 0; j < CITY.blocks; j++) {
      const x0 = ROADS[i] + CITY.roadWidth / 2;
      const z0 = ROADS[j] + CITY.roadWidth / 2;
      const w = CITY.pitch - CITY.roadWidth;
      g.fillRect(toPx(x0), toPx(z0), w * PX_PER_M, w * PX_PER_M);
    }
  }
  // Asphalt roads.
  g.fillStyle = '#2e2a3a';
  for (const r of ROADS) {
    g.fillRect(toPx(r - CITY.roadWidth / 2), 0, CITY.roadWidth * PX_PER_M, S);
    g.fillRect(0, toPx(r - CITY.roadWidth / 2), S, CITY.roadWidth * PX_PER_M);
  }
  // Centre dashes.
  g.fillStyle = '#d8c56a';
  for (const r of ROADS) {
    for (let m = -CITY.half + 8; m < CITY.half; m += 16) {
      g.fillRect(toPx(r) - 1.5, toPx(m), 3, 7 * PX_PER_M);
      g.fillRect(toPx(m), toPx(r) - 1.5, 7 * PX_PER_M, 3);
    }
  }
  // Crosswalks: 5 stripes at every intersection.
  g.fillStyle = 'rgba(230,230,230,0.75)';
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      for (let k = -2; k <= 2; k++) {
        g.fillRect(toPx(rx + k * 2.2) - 2.5, toPx(rz - CITY.roadWidth / 2), 5, 3.2 * PX_PER_M);
        g.fillRect(toPx(rx - CITY.roadWidth / 2), toPx(rz + k * 2.2) - 2.5, 3.2 * PX_PER_M, 5);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildCity(scene, seed = 7) {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  scene.add(group);

  // ---- sky, fog, lights -----------------------------------------------
  scene.fog = new THREE.Fog(0xdd7a4e, 180, 780);
  const skyGeo = new THREE.SphereGeometry(900, 24, 16);
  const top = new THREE.Color(0x2a1e4f);
  const horizon = new THREE.Color(0xff8c4a);
  const pos = skyGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = clamp((pos.getY(i) / 900) * 0.5 + 0.5, 0, 1);
    tmp.copy(horizon).lerp(top, Math.pow(t, 0.7));
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(
    skyGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }),
  );
  group.add(sky);
  // Low sun disc.
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(46, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }),
  );
  sun.position.set(-420, 90, -620);
  sun.lookAt(0, 60, 0);
  group.add(sun);

  const dirLight = new THREE.DirectionalLight(0xffd9a0, 2.2);
  dirLight.position.set(-180, 280, -120);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  dirLight.shadow.camera.left = -260;
  dirLight.shadow.camera.right = 260;
  dirLight.shadow.camera.top = 260;
  dirLight.shadow.camera.bottom = -260;
  dirLight.shadow.camera.far = 900;
  scene.add(dirLight);
  scene.add(new THREE.HemisphereLight(0xffc490, 0x4a3a5d, 1.9));

  // ---- ground -----------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.half * 2, CITY.half * 2),
    new THREE.MeshStandardMaterial({ map: paintGround(rng), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // ---- parks: 7 random blocks become lawns ------------------------------
  const parkBlocks = new Set();
  while (parkBlocks.size < 7) {
    parkBlocks.add(Math.floor(rng() * CITY.blocks) + ',' + Math.floor(rng() * CITY.blocks));
  }
  const parks = [];
  const lawnMat = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 1 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6b2a, roughness: 1 });
  const treeGeo = new THREE.ConeGeometry(2.2, 5, 6);
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6);

  function addTree(x, z, s = 1) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 1.2 * s, z);
    trunk.scale.setScalar(s);
    const leaves = new THREE.Mesh(treeGeo, leafMat);
    leaves.position.set(x, (2.4 + 2.2) * s, z);
    leaves.scale.setScalar(s);
    leaves.castShadow = true;
    group.add(trunk);
    group.add(leaves);
  }

  // ---- buildings ---------------------------------------------------------
  const buildings = [];
  const facadeHues = ['#7a7490', '#847a6a', '#6f7a93', '#8d7a82', '#5f6b8a', '#93806a', '#7d6a8a', '#6a7a6a'];
  const facadeTex = facadeHues.map((h) => makeFacadeTexture(rng, h));
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a2530, roughness: 1 });
  const wallMats = facadeTex.map(
    (t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }),
  );

  for (let i = 0; i < CITY.blocks; i++) {
    for (let j = 0; j < CITY.blocks; j++) {
      // Block content sits inside the sidewalk ring: road edge + 3 m.
      const bx0 = ROADS[i] + CITY.roadWidth / 2 + CITY.sidewalk;
      const bz0 = ROADS[j] + CITY.roadWidth / 2 + CITY.sidewalk;
      const bw = CITY.pitch - CITY.roadWidth - CITY.sidewalk * 2;
      const cx = bx0 + bw / 2;
      const cz = bz0 + bw / 2;
      if (parkBlocks.has(i + ',' + j)) {
        const lawn = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.4, bw), lawnMat);
        lawn.position.set(cx, 0.2, cz);
        lawn.receiveShadow = true;
        group.add(lawn);
        parks.push({ minX: bx0, maxX: bx0 + bw, minZ: bz0, maxZ: bz0 + bw });
        for (let t = 0; t < 6; t++) {
          addTree(bx0 + 6 + rng() * (bw - 12), bz0 + 6 + rng() * (bw - 12), 0.9 + rng() * 0.5);
        }
        continue;
      }
      // Height falls off with distance from downtown.
      const dCentre = Math.hypot(cx, cz) / (CITY.half * Math.SQRT2);
      const maxH = 9 + (1 - dCentre) * 59;
      const parts = rng() < 0.3 ? 1 : rng() < 0.6 ? 2 : 4;
      const mat = wallMats[Math.floor(rng() * wallMats.length)];
      const cells = parts === 1 ? [[0, 0, bw]] : parts === 2 ? [[0, 0, bw / 2 - 1], [bw / 2 + 1, 0, bw / 2 - 1]] : [
        [0, 0, bw / 2 - 1],
        [bw / 2 + 1, 0, bw / 2 - 1],
        [0, bw / 2 + 1, bw / 2 - 1],
        [bw / 2 + 1, bw / 2 + 1, bw / 2 - 1],
      ];
      for (const [ox, oz, w] of cells) {
        const h = 6 + rng() * (maxH - 6);
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
        const px = bx0 + ox + w / 2;
        const pz = bz0 + oz + w / 2;
        box.position.set(px, h / 2, pz);
        box.castShadow = true;
        box.receiveShadow = true;
        group.add(box);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 1.2, w * 0.7), roofMat);
        roof.position.set(px, h + 0.6, pz);
        group.add(roof);
        buildings.push({ minX: px - w / 2, maxX: px + w / 2, minZ: pz - w / 2, maxZ: pz + w / 2, h, cx: px, cz: pz });
      }
    }
  }

  // ---- neon billboards on tall downtown rooftops -----------------------
  function makeBillboardTexture(text, color) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#120a1e';
    g.fillRect(0, 0, 512, 128);
    g.strokeStyle = color;
    g.lineWidth = 6;
    g.strokeRect(4, 4, 504, 120);
    g.font = '900 64px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 28;
    g.fillStyle = color;
    g.fillText(text, 256, 66);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const BILLBOARDS = [
    ['NEON HARBOR', '#ff2fb3'],
    ["MAMA LOU'S", '#ffc861'],
    ['HARBOR CASINO', '#4be3ff'],
    ['SUNSET MOTEL', '#ff8c4a'],
    ['TACOS 24H', '#4be37a'],
  ];
  const downtown = buildings
    .filter((b) => b.h > 22 && Math.hypot(b.cx, b.cz) < 170)
    .sort((a, b) => b.h - a.h)
    .slice(0, BILLBOARDS.length);
  downtown.forEach((b, i) => {
    const [text, color] = BILLBOARDS[i % BILLBOARDS.length];
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 5.5),
      new THREE.MeshBasicMaterial({ map: makeBillboardTexture(text, color) }),
    );
    // Face south (+z) from the rooftop front edge.
    board.position.set(b.cx, b.h + 3.4, b.maxZ + 0.3);
    group.add(board);
    const back = board.clone();
    back.rotation.y = Math.PI;
    back.position.set(b.cx, b.h + 3.4, b.minZ - 0.3);
    group.add(back);
  });

  // ---- traffic lights at central intersections (visual) ----------------
  const tlPoleMat = new THREE.MeshStandardMaterial({ color: 0x2c2c34, roughness: 0.6, metalness: 0.4 });
  const tlBoxMat = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.5 });
  const tlRed = new THREE.MeshStandardMaterial({ color: 0xcc1010, emissive: 0xff2222, emissiveIntensity: 1.8 });
  const tlGreen = new THREE.MeshStandardMaterial({ color: 0x10cc40, emissive: 0x22ff66, emissiveIntensity: 1.8 });
  const tlDim = new THREE.MeshStandardMaterial({ color: 0x30251a, emissive: 0x000000, emissiveIntensity: 0 });
  const tlPoleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6.5, 6);
  const tlBoxGeo = new THREE.BoxGeometry(0.7, 1.8, 0.5);
  const tlDotGeo = new THREE.SphereGeometry(0.22, 8, 6);
  let tlI = 0;
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      if (Math.abs(rx) > 120 || Math.abs(rz) > 120) continue;
      if ((tlI++ % 3) !== 0) continue;
      const pole = new THREE.Mesh(tlPoleGeo, tlPoleMat);
      pole.position.set(rx + 8.2, 3.25, rz + 8.2);
      group.add(pole);
      const box = new THREE.Mesh(tlBoxGeo, tlBoxMat);
      box.position.set(rx + 8.2, 6.6, rz + 8.2);
      group.add(box);
      // One direction green, the other red — static, visual only.
      const go = (tlI % 2) === 0;
      const top = new THREE.Mesh(tlDotGeo, go ? tlDim : tlRed);
      top.position.set(rx + 8.2, 7.05, rz + 8.47);
      const bot = new THREE.Mesh(tlDotGeo, go ? tlGreen : tlDim);
      bot.position.set(rx + 8.2, 6.15, rz + 8.47);
      group.add(top);
      group.add(bot);
    }
  }

  // ---- streetlights on alternating intersections -------------------------
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2c34, roughness: 0.6, metalness: 0.4 });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffe9a8,
    emissive: 0xffc861,
    emissiveIntensity: 1.6,
  });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  const armGeo = new THREE.BoxGeometry(2.4, 0.12, 0.12);
  const lampGeo = new THREE.SphereGeometry(0.32, 10, 8);
  let li = 0;
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      if ((li++ % 2) !== 0) continue;
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(rx + 8.4, 3.5, rz + 8.4);
      const arm = new THREE.Mesh(armGeo, poleMat);
      arm.position.set(rx + 7.2, 6.9, rz + 8.4);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(rx + 6.1, 6.8, rz + 8.4);
      group.add(pole);
      group.add(arm);
      group.add(lamp);
    }
  }

  // ---- palms along the central avenue ------------------------------------
  const palmTrunk = new THREE.CylinderGeometry(0.18, 0.3, 7, 6);
  const palmMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 });
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 1 });
  const frondGeo = new THREE.ConeGeometry(0.9, 4.5, 4);
  for (let z = -270; z <= 270; z += 30) {
    for (const x of [-9.5, 9.5]) {
      const trunk = new THREE.Mesh(palmTrunk, palmMat);
      trunk.position.set(x, 3.5, z);
      trunk.rotation.z = (rng() - 0.5) * 0.12;
      group.add(trunk);
      for (let f = 0; f < 5; f++) {
        const frond = new THREE.Mesh(frondGeo, frondMat);
        const a = (f / 5) * Math.PI * 2;
        frond.position.set(x + Math.cos(a) * 1.4, 7.2, z + Math.sin(a) * 1.4);
        frond.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
        group.add(frond);
      }
    }
  }

  // ---- collision helpers --------------------------------------------------
  function pushOutOfRect(o, r, rect) {
    const nx = clamp(o.x, rect.minX, rect.maxX);
    const nz = clamp(o.z, rect.minZ, rect.maxZ);
    const dx = o.x - nx;
    const dz = o.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return false;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      o.x = nx + (dx / d) * r;
      o.z = nz + (dz / d) * r;
    } else {
      // Inside the rect: shove out along the smallest penetration axis.
      const pl = o.x - rect.minX;
      const pr = rect.maxX - o.x;
      const pt = o.z - rect.minZ;
      const pb = rect.maxZ - o.z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) o.x = rect.minX - r;
      else if (m === pr) o.x = rect.maxX + r;
      else if (m === pt) o.z = rect.minZ - r;
      else o.z = rect.maxZ + r;
    }
    return true;
  }

  // Push a circle (x, z, radius r) out of every building AABB.
  function resolveCircle(o, r) {
    let hit = false;
    for (const b of buildings) if (pushOutOfRect(o, r, b)) hit = true;
    return hit;
  }

  // Same, plus park rects (cars treat parks as obstacles; peds do not).
  function resolveCircleCars(o, r) {
    let hit = resolveCircle(o, r);
    for (const p of parks) if (pushOutOfRect(o, r, p)) hit = true;
    return hit;
  }

  return { group, buildings, parks, resolveCircle, resolveCircleCars };
}
