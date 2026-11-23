// NEON HARBOR — procedural sunset city: one textured ground plane, a 9x9
// grid of blocks with lit-window facades, parks, streetlights, palms,
// a gradient sky dome and warm sunset lighting. All geometry is built
// from the seed, so ?seed=7 always draws the same city.

import { CITY, mulberry32, pick, clamp } from './config.js';

const THREE = window.THREE;

function roadCentres() {
  const out = [];
  for (let i = 0; i < CITY.roadCount; i++) out.push(-CITY.span + i * CITY.pitch);
  return out;
}

export class City {
  constructor(scene, seed = 7) {
    this.scene = scene;
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.roads = roadCentres();
    this.buildings = []; // {minX,maxX,minZ,maxZ}
    this.parks = []; // {minX,maxX,minZ,maxZ}
    this.lights = [];
  }

  build() {
    this._sky();
    this._ground();
    this._blocks();
    this._streetlights();
    this._palms();
    this._lights();
  }

  // --- Sky, sun, fog ------------------------------------------------------
  _sky() {
    const geo = new THREE.SphereGeometry(900, 24, 16);
    const top = new THREE.Color(0x2a1e4f);
    const horizon = new THREE.Color(0xff8c4a);
    const colors = [];
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 900; // -1..1
      const t = clamp((y + 0.12) / 0.75, 0, 1);
      const c = horizon.clone().lerp(top, t);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    const dome = new THREE.Mesh(geo, mat);
    this.scene.add(dome);

    // Low sun disc, warm and huge.
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(46, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }),
    );
    sun.position.set(-420, 130, -620);
    sun.lookAt(0, 60, 0);
    this.scene.add(sun);

    this.scene.fog = new THREE.Fog(0xdd7a4e, 180, 780);
  }

  _lights() {
    const dir = new THREE.DirectionalLight(0xffd9a0, 1.9);
    dir.position.set(-180, 280, -120);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    const c = dir.shadow.camera;
    c.left = -260;
    c.right = 260;
    c.top = 260;
    c.bottom = -260;
    c.far = 900;
    this.scene.add(dir);
    this.scene.add(new THREE.HemisphereLight(0xffb37a, 0x3a2b4d, 1.4));
  }

  // --- Ground: one 2048px canvas texture for the whole map ----------------
  _ground() {
    const S = 2048;
    const cv = document.createElement('canvas');
    cv.width = S;
    cv.height = S;
    const g = cv.getContext('2d');
    const span = CITY.span + 7; // half-extent covered by the texture
    const toPx = (v) => ((v + span) / (span * 2)) * S;

    // Block slabs.
    g.fillStyle = '#2e2a33';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#3a3540';
    for (let i = 0; i < CITY.blocks; i++) {
      for (let j = 0; j < CITY.blocks; j++) {
        const cx = -CITY.span + CITY.pitch / 2 + i * CITY.pitch;
        const cz = -CITY.span + CITY.pitch / 2 + j * CITY.pitch;
        g.fillRect(toPx(cx - 23), toPx(cz - 23), toPx(46) - toPx(0), toPx(46) - toPx(0));
      }
    }
    // Sidewalk strips along every road.
    g.fillStyle = '#57505e';
    for (const r of this.roads) {
      const w = CITY.roadWidth / 2 + CITY.sidewalk;
      g.fillRect(toPx(-span), toPx(r - w), S, toPx(w * 2) - toPx(0));
      g.fillRect(toPx(r - w), toPx(-span), toPx(w * 2) - toPx(0), S);
    }
    // Asphalt.
    g.fillStyle = '#232028';
    for (const r of this.roads) {
      const w = CITY.roadWidth / 2;
      g.fillRect(toPx(-span), toPx(r - w), S, toPx(w * 2) - toPx(0));
      g.fillRect(toPx(r - w), toPx(-span), toPx(w * 2) - toPx(0), S);
    }
    // Centre dashes + crosswalks at every intersection.
    g.fillStyle = '#d8b13c';
    for (const r of this.roads) {
      for (let d = -CITY.span + 15; d < CITY.span; d += 15) {
        g.fillRect(toPx(d - 2), toPx(r - 0.35), toPx(4) - toPx(0), toPx(0.7) - toPx(0));
        g.fillRect(toPx(r - 0.35), toPx(d - 2), toPx(0.7) - toPx(0), toPx(4) - toPx(0));
      }
    }
    g.fillStyle = 'rgba(235,235,225,0.75)';
    for (const rx of this.roads) {
      for (const rz of this.roads) {
        for (let s = -1; s <= 1; s++) {
          g.fillRect(toPx(rx - 5.5 + s * 3.2), toPx(rz - 7), toPx(1.8) - toPx(0), toPx(3) - toPx(0));
          g.fillRect(toPx(rx - 5.5 + s * 3.2), toPx(rz + 4), toPx(1.8) - toPx(0), toPx(3) - toPx(0));
          g.fillRect(toPx(rx - 7), toPx(rz - 5.5 + s * 3.2), toPx(3) - toPx(0), toPx(1.8) - toPx(0));
          g.fillRect(toPx(rx + 4), toPx(rz - 5.5 + s * 3.2), toPx(3) - toPx(0), toPx(1.8) - toPx(0));
        }
      }
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    tex.colorSpace = THREE.SRGBColorSpace;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(span * 2, span * 2),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  // --- Facade texture: window grid, some windows lit warm/cool ------------
  _facadeTexture(base, litRatio) {
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 256);
    // Ground floor: shopfront strip, never flat black.
    g.fillStyle = '#4a3b2e';
    g.fillRect(0, 226, 128, 30);
    g.fillStyle = '#6b4a2f';
    for (let x = 6; x < 128; x += 22) g.fillRect(x, 232, 16, 20);
    const lit = ['#ffd27a', '#ffb36b', '#9fd8ff', '#fff2c8'];
    for (let y = 8; y < 218; y += 18) {
      for (let x = 8; x < 120; x += 16) {
        if (this.rng() < litRatio) {
          g.fillStyle = pick(this.rng, lit);
          g.globalAlpha = 0.75 + this.rng() * 0.25;
        } else {
          g.fillStyle = '#1c1a24';
          g.globalAlpha = 1;
        }
        g.fillRect(x, y, 9, 12);
      }
    }
    g.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _blocks() {
    const rng = this.rng;
    const bases = ['#7a6a72', '#6a6f85', '#8a6f6a', '#5f6a7a', '#75655e', '#4f5a6e'];
    const facades = bases.map((b) => this._facadeTexture(b, 0.42));
    const parkBlocks = new Set();
    while (parkBlocks.size < 7) {
      parkBlocks.add(Math.floor(rng() * CITY.blocks * CITY.blocks));
    }
    const neonSigns = [];
    for (let i = 0; i < CITY.blocks; i++) {
      for (let j = 0; j < CITY.blocks; j++) {
        const cx = -CITY.span + CITY.pitch / 2 + i * CITY.pitch;
        const cz = -CITY.span + CITY.pitch / 2 + j * CITY.pitch;
        const idx = i * CITY.blocks + j;
        if (parkBlocks.has(idx)) {
          this._park(cx, cz);
          continue;
        }
        const distC = Math.hypot(cx, cz);
        const maxH = 9 + (1 - distC / 430) * 59; // ~68 downtown, ~9 at edges
        const n = pick(rng, [1, 2, 2, 4]);
        const slots = n === 1 ? [[0, 0, 40]] : n === 2
          ? [[-11, 0, 19], [11, 0, 19]]
          : [[-11, -11, 19], [11, -11, 19], [-11, 11, 19], [11, 11, 19]];
        for (const [ox, oz, w] of slots) {
          const h = 8 + rng() * (maxH - 8);
          const mat = new THREE.MeshStandardMaterial({
            map: pick(rng, facades),
            roughness: 0.85,
          });
          const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
          box.position.set(cx + ox, h / 2, cz + oz);
          box.castShadow = true;
          box.receiveShadow = true;
          this.scene.add(box);
          // Roof box.
          const roof = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.7, 1.6, w * 0.7),
            new THREE.MeshStandardMaterial({ color: 0x2c2830, roughness: 1 }),
          );
          roof.position.set(cx + ox, h + 0.8, cz + oz);
          this.scene.add(roof);
          this.buildings.push({
            minX: cx + ox - w / 2, maxX: cx + ox + w / 2,
            minZ: cz + oz - w / 2, maxZ: cz + oz + w / 2,
          });
          // Downtown towers get a neon billboard on the roof edge.
          if (h > 45 && rng() < 0.5) {
            const sign = new THREE.Mesh(
              new THREE.BoxGeometry(w * 0.8, 3, 0.4),
              new THREE.MeshStandardMaterial({
                color: 0x111111,
                emissive: pick(rng, [0xff2e88, 0x22d3ee, 0xffb020, 0x7c3aed]),
                emissiveIntensity: 1.6,
              }),
            );
            sign.position.set(cx + ox, h + 3.4, cz + oz + w / 2 + 0.3);
            this.scene.add(sign);
            neonSigns.push(sign);
          }
        }
      }
    }
    this.neonSigns = neonSigns;
  }

  _park(cx, cz) {
    const lawn = new THREE.Mesh(
      new THREE.BoxGeometry(46, 0.4, 46),
      new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 1 }),
    );
    lawn.position.set(cx, 0.2, cz);
    lawn.receiveShadow = true;
    this.scene.add(lawn);
    this.parks.push({ minX: cx - 23, maxX: cx + 23, minZ: cz - 23, maxZ: cz + 23 });
    for (let t = 0; t < 6; t++) {
      const tx = cx - 16 + this.rng() * 32;
      const tz = cz - 16 + this.rng() * 32;
      this._tree(tx, tz, 1.6 + this.rng() * 1.2);
    }
  }

  _tree(x, z, s = 2) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22 * s, 0.3 * s, 2.2 * s, 6),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 }),
    );
    trunk.position.set(x, 1.1 * s, z);
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(1.5 * s, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x2f6b2f, roughness: 1 }),
    );
    crown.position.set(x, (2.2 + 1.1) * s, z);
    this.scene.add(trunk, crown);
  }

  _palm(x, z) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.26, 5.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 }),
    );
    trunk.position.set(x, 2.75, z);
    this.scene.add(trunk);
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 1 });
    for (let i = 0; i < 5; i++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.6, 4), frondMat);
      const a = (i / 5) * Math.PI * 2;
      frond.position.set(x + Math.cos(a) * 1.1, 5.6, z + Math.sin(a) * 1.1);
      frond.rotation.z = Math.cos(a) * 1.1;
      frond.rotation.x = -Math.sin(a) * 1.1;
      this.scene.add(frond);
    }
  }

  _streetlights() {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.7, metalness: 0.4 });
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffe9b0, emissive: 0xffc86b, emissiveIntensity: 2.2,
    });
    let n = 0;
    for (const rx of this.roads) {
      for (const rz of this.roads) {
        if ((n++ % 2) === 1) continue; // alternating intersections
        const x = rx + 8.5;
        const z = rz + 8.5;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.4, 6), poleMat);
        pole.position.set(x, 3.2, z);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.1), poleMat);
        arm.position.set(x - 0.8, 6.35, z);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), lampMat);
        lamp.position.set(x - 1.7, 6.25, z);
        this.scene.add(pole, arm, lamp);
        // No per-lamp PointLight: the emissive sphere reads as a glow, and
        // 25+ point lights would make the forward renderer crawl.
      }
    }
  }

  _palms() {
    for (let z = -270; z <= 270; z += 30) {
      this._palm(-9.5, z);
      this._palm(9.5, z + 15);
    }
  }

  // --- Collision + road helpers -------------------------------------------
  _insideRect(x, z, r) {
    return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
  }

  // Push a circle (obj has x/z) out of building AABBs. Returns true on hit.
  resolveCircle(obj, r) {
    let hit = false;
    for (const b of this.buildings) {
      const cx = clamp(obj.x, b.minX, b.maxX);
      const cz = clamp(obj.z, b.minZ, b.maxZ);
      const dx = obj.x - cx;
      const dz = obj.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          obj.x = cx + (dx / d) * r;
          obj.z = cz + (dz / d) * r;
        } else {
          // Dead centre: shove along the smallest penetration axis.
          const px = Math.min(obj.x - b.minX + r, b.maxX - obj.x + r);
          const pz = Math.min(obj.z - b.minZ + r, b.maxZ - obj.z + r);
          if (px < pz) obj.x = obj.x - b.minX < b.maxX - obj.x ? b.minX - r : b.maxX + r;
          else obj.z = obj.z - b.minZ < b.maxZ - obj.z ? b.minZ - r : b.maxZ + r;
        }
      }
    }
    return hit;
  }

  // Same, but parks also block cars.
  resolveCircleCars(obj, r) {
    let hit = this.resolveCircle(obj, r);
    for (const p of this.parks) {
      const cx = clamp(obj.x, p.minX, p.maxX);
      const cz = clamp(obj.z, p.minZ, p.maxZ);
      const dx = obj.x - cx;
      const dz = obj.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-6) {
        hit = true;
        const d = Math.sqrt(d2);
        obj.x = cx + (dx / d) * r;
        obj.z = cz + (dz / d) * r;
      }
    }
    return hit;
  }

  // Nearest point on the road network to (x, z).
  nearestRoad(x, z) {
    let bestX = this.roads[0];
    let bestZ = this.roads[0];
    for (const r of this.roads) {
      if (Math.abs(x - r) < Math.abs(x - bestX)) bestX = r;
      if (Math.abs(z - r) < Math.abs(z - bestZ)) bestZ = r;
    }
    const dx = Math.abs(x - bestX);
    const dz = Math.abs(z - bestZ);
    if (dx <= dz) return { x: bestX, z, along: z, d: dx, axis: 'z' };
    return { x, z: bestZ, along: x, d: dz, axis: 'x' };
  }

  randomRoadPoint(rng) {
    const r = this.roads[Math.floor(rng() * this.roads.length)];
    const along = -CITY.span + rng() * CITY.span * 2;
    if (rng() < 0.5) return { x: r, z: along };
    return { x: along, z: r };
  }

  inBounds(x, z, margin = 5) {
    return Math.abs(x) < CITY.span - margin && Math.abs(z) < CITY.span - margin;
  }
}
