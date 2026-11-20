// NEON HARBOR — the game itself: renderer, input, the main loop,
// wanted + health rules, shooting with thick tracers, stealing cars,
// crash smoke, save/load and the menu / pause / busted / wasted flow.
// The one game object is window.__game for the playtests and the
// screenshot staging.

import { CITY, SAVE_KEY, WANTED, TRAFFIC_COUNT, PED_COUNT, clamp, dist2 } from './config.js';
import { buildCity } from './city.js';
import { Traffic, Police, driveCar } from './vehicles.js';
import { Peds } from './peds.js';
import { Player } from './player.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { AudioSys } from './audio.js';
import { stageShot } from './shots.js';

const T = window.THREE;

function smokeTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(200,200,200,0.85)');
  grad.addColorStop(1, 'rgba(200,200,200,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new T.CanvasTexture(cv);
  return tex;
}

export class Game {
  constructor() {
    const params = new URLSearchParams(location.search);
    this.seed = parseInt(params.get('seed') || '7', 10) || 7;
    this.shotName = params.get('shot') || null;
    this.renderer = new T.WebGLRenderer({ antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    document.getElementById('game').appendChild(this.renderer.domElement);
    this.scene = new T.Scene();
    this.scene.background = new T.Color(0x2a1745);
    this.camera = new T.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2000);
    this.camera.position.set(0, 8, 42);

    const hemi = new T.HemisphereLight(0xffd9a0, 0x2a1a3a, 1.05);
    this.scene.add(hemi);
    const sun = new T.DirectionalLight(0xff9a3b, 1.9);
    sun.position.set(-180, 220, -120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
    sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
    sun.shadow.camera.far = 700;
    this.scene.add(sun);

    this.city = buildCity(this.scene, this.seed);
    this.traffic = new Traffic(this.scene, this.seed);
    this.police = new Police(this.scene, this.seed);
    this.peds = new Peds(this.scene, this.seed, PED_COUNT);
    this.player = new Player(this.scene);
    this.playerCar = null;
    this.missions = new Missions(this);
    this.hud = new HUD();
    this.audio = new AudioSys();

    this.state = 'menu';
    this.money = 0;
    this.wanted = 0;
    this.wantedTimer = 0;
    this.decayTimer = 0;
    this.time = 0;
    this.frozen = false;
    this.shotCamera = null;
    this.keys = {};
    this.tracers = [];
    this.smokes = [];
    this.smokeTex = smokeTexture();
    this.shootCooldown = 0;
    this.policeShootT = 0;
    this.ramCooldown = 0;
    this.lastTime = performance.now();
    this.saveData = this.loadSave();

    this.bindInput();
    this.bindButtons();
    this.hud.setCash(0);
    this.hud.setHealth(this.player.health);
    this.hud.setStars(0);
    const cont = document.getElementById('btn-continue');
    if (cont && this.saveData) cont.classList.remove('hidden');
    window.__game = this;

    if (this.shotName) {
      // Screenshot staging runs the real game, then freezes it.
      this.startFromMenu();
      stageShot(this, this.shotName).catch((e) => {
        console.error('staging failed', e);
        window.__shotReady = true;
      });
    }
    this.renderer.setAnimationLoop(() => this.frame());
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  // ------------------------------------------------------------ input
  bindInput() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (e.code === 'KeyM') {
        this.audio.setMuted(!this.audio.muted);
        this.hud.toast(this.audio.muted ? 'Sound off' : 'Sound on', 1.5);
      }
      if (this.state !== 'playing') return;
      if (e.code === 'KeyE') this.onPressE();
      if (e.code === 'KeyN') {
        if (this.missions.startNext()) this.audio.blip(880, 0.1, 0.3);
        else this.hud.toast('Finish the current job first.', 2);
      }
      if (e.code === 'KeyP') this.pause();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('mousedown', (e) => {
      if (this.state === 'busted' || this.state === 'wasted') { this.respawn(); return; }
      if (this.state !== 'playing' || this.player.inCar) return;
      if (e.target && e.target.closest && e.target.closest('button')) return;
      this.shoot();
    });
    addEventListener('mousemove', (e) => {
      if (this.state !== 'playing' || this.player.inCar) return;
      this.player.camYaw -= e.movementX * 0.0022;
      this.player.camPitch = clamp(this.player.camPitch + e.movementY * 0.0016, 0.08, 0.9);
    });
  }

  bindButtons() {
    const start = document.getElementById('btn-start');
    if (start) start.addEventListener('click', () => this.startFromMenu());
    const cont = document.getElementById('btn-continue');
    if (cont) cont.addEventListener('click', () => this.startFromMenu(true));
    const resume = document.getElementById('btn-resume');
    if (resume) resume.addEventListener('click', () => this.resume());
    const save = document.getElementById('btn-save');
    if (save) save.addEventListener('click', () => { this.save(); this.hud.toast('Saved.', 2); });
    const quit = document.getElementById('btn-quit');
    if (quit) quit.addEventListener('click', () => this.toMenu());
  }

  inputState() {
    return {
      up: !!this.keys['KeyW'] || !!this.keys['ArrowUp'],
      down: !!this.keys['KeyS'] || !!this.keys['ArrowDown'],
      left: !!this.keys['KeyA'] || !!this.keys['ArrowLeft'],
      right: !!this.keys['KeyD'] || !!this.keys['ArrowRight'],
      run: !!this.keys['ShiftLeft'] || !!this.keys['ShiftRight'],
      jump: !!this.keys['Space'],
      handbrake: !!this.keys['Space'],
    };
  }

  // ------------------------------------------------------------ flow
  startFromMenu(useSave) {
    this.audio.init();
    if (useSave && this.saveData) {
      this.money = this.saveData.money || 0;
      this.missions.completed = this.saveData.completed || 0;
      this.missions.index = this.saveData.index || 0;
    }
    this.hud.hide('menu');
    this.hud.hide('pause');
    this.hud.hide('busted');
    this.hud.hide('wasted');
    this.state = 'playing';
    this.hud.setCash(this.money);
    this.hud.setHint('WASD walk · E steal / exit car · N start job · Click shoot · P pause');
    this.hud.setCrosshair(true);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    document.getElementById('pause-stats').textContent =
      'Cash $' + this.money + ' · Jobs done ' + this.missions.completed + ' · Wanted ' + this.wanted + '★';
    this.hud.show('pause');
  }

  resume() {
    this.hud.hide('pause');
    this.state = 'playing';
  }

  toMenu() {
    this.hud.hide('pause');
    this.hud.show('menu');
    this.state = 'menu';
  }

  respawn() {
    this.hud.hide('busted');
    this.hud.hide('wasted');
    this.player.health = 100;
    this.player.setPosition(0, 30, Math.PI);
    this.setWanted(0, true);
    this.state = 'playing';
    this.hud.setHealth(100);
  }

  busted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    const fine = Math.min(this.money, 150);
    this.money -= fine;
    this.hud.setCash(this.money);
    document.getElementById('busted-fine').textContent =
      'The Harbor PD caught you. Fine: $' + fine + '.';
    this.hud.show('busted');
    this.audio.jingle(false);
    this.save();
  }

  wasted() {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    const loss = Math.min(this.money, 50);
    this.money -= loss;
    this.hud.setCash(this.money);
    document.getElementById('wasted-loss').textContent =
      'You wake up at the clinic, $' + loss + ' lighter.';
    this.hud.show('wasted');
    this.audio.jingle(false);
    this.save();
  }

  // ------------------------------------------------------------ wanted
  setWanted(w, silent) {
    const nw = clamp(Math.round(w), 0, WANTED.max);
    const changed = nw !== this.wanted;
    this.wanted = nw;
    this.wantedTimer = 0;
    this.decayTimer = 0;
    this.hud.setStars(nw);
    this.audio.setWanted(nw);
    if (changed && !silent && nw > 0) this.hud.toast('Wanted level ' + nw + '★ — lose the cops!', 3);
    if (nw === 0) this.hud.setStars(0);
  }

  addWanted(n) {
    this.setWanted(this.wanted + n);
  }

  // ------------------------------------------------------------ cars
  nearestCar(maxD) {
    let best = null;
    let bestD = maxD;
    const px = this.player.x;
    const pz = this.player.z;
    for (const c of [...this.traffic.parked, ...this.traffic.cars]) {
      if (c === this.playerCar) continue;
      const d = dist2(px, pz, c.x, c.z);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  stealNearestCar() {
    const car = this.nearestCar(5);
    if (!car) return false;
    this.playerCar = car;
    car.stolen = true;
    this.player.inCar = true;
    this.player.mesh.visible = false;
    const idx = this.traffic.parked.indexOf(car);
    if (idx >= 0) this.traffic.parked.splice(idx, 1);
    if (this.wanted === 0) this.addWanted(1);
    else this.hud.toast('Car stolen!', 2);
    this.audio.blip(520, 0.08, 0.25);
    return true;
  }

  exitCar() {
    if (!this.playerCar) return;
    const car = this.playerCar;
    this.player.inCar = false;
    this.player.setPosition(car.x + Math.sin(car.heading + Math.PI / 2) * 2.5, car.z + Math.cos(car.heading + Math.PI / 2) * 2.5, car.heading);
    this.player.mesh.visible = true;
    this.playerCar = null;
  }

  onPressE() {
    if (this.player.inCar) { this.exitCar(); return; }
    // Score mission grab is handled by the mission update (E held).
    this.stealNearestCar();
  }

  // ------------------------------------------------------------ combat
  fireTracer(from, to, color, width) {
    const dir = new T.Vector3(to.x - from.x, to.y - from.y, to.z - from.z);
    const len = dir.length();
    if (len < 0.1) return;
    const geo = new T.BoxGeometry(width || 0.16, width || 0.16, len);
    const mat = new T.MeshBasicMaterial({ color: color || 0xffd23e, transparent: true, opacity: 0.95 });
    const mesh = new T.Mesh(geo, mat);
    mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    mesh.lookAt(to.x, to.y, to.z);
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.14 });
  }

  shoot() {
    if (this.shootCooldown > 0) return;
    this.shootCooldown = 0.28;
    const px = this.player.x;
    const pz = this.player.z;
    const dir = new T.Vector3(Math.sin(this.player.camYaw), 0, Math.cos(this.player.camYaw));
    // Aim from the player toward the camera forward, slightly down.
    const from = new T.Vector3(px, 1.4, pz);
    const to = new T.Vector3(px - dir.x * 34, 1.2, pz - dir.z * 34);
    this.fireTracer(from, to, 0xffe14a, 0.22);
    this.audio.shot();
    this.peds.scare(px, pz, 24);
    // Hit anything near the line's end: peds fall, cops take a hit.
    for (const p of this.peds.list) {
      if (!p.down && dist2(p.x, p.z, to.x, to.z) < 3.5) this.peds.knockDown(p);
    }
    for (const cop of this.police.cops) {
      if (dist2(cop.x, cop.z, to.x, to.z) < 3.5) {
        cop.x += (cop.x - px) * 0.4;
        cop.z += (cop.z - pz) * 0.4;
        this.addWanted(1);
      }
    }
    this.addWanted(0); // refresh HUD, no-op
  }

  // Remove every tracer mesh (stray police fire during staging).
  clearTracers() {
    for (const tr of this.tracers) {
      this.scene.remove(tr.mesh);
      tr.mesh.geometry.dispose();
      tr.mesh.material.dispose();
    }
    this.tracers = [];
  }

  spawnSmoke(x, z, big) {
    const n = big ? 6 : 3;
    for (let i = 0; i < n; i += 1) {
      const mat = new T.SpriteMaterial({ map: this.smokeTex, transparent: true, opacity: 0.8, depthWrite: false });
      const s = new T.Sprite(mat);
      s.position.set(x + (Math.random() - 0.5) * 2, 1 + Math.random(), z + (Math.random() - 0.5) * 2);
      const sc = big ? 3.5 : 2.2;
      s.scale.set(sc, sc, 1);
      this.scene.add(s);
      this.smokes.push({ sprite: s, life: big ? 1.6 : 1.0, max: big ? 1.6 : 1.0 });
    }
  }

  // ------------------------------------------------------------ save
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: this.money,
        completed: this.missions.completed,
        index: this.missions.index,
      }));
    } catch (e) { /* private mode: ignore */ }
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // ------------------------------------------------------------ loop
  frame() {
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    dt = clamp(dt, 0.001, 0.05);
    if (this.state === 'playing' && !this.frozen) this.update(dt);
    // Tracers + smoke animate only while the world runs, so a frozen
    // staged shot keeps its tracers visible for the screenshot.
    if (!this.frozen) {
      for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
        const tr = this.tracers[i];
        tr.life -= dt;
        if (tr.life <= 0) {
          this.scene.remove(tr.mesh);
          tr.mesh.geometry.dispose();
          tr.mesh.material.dispose();
          this.tracers.splice(i, 1);
        }
      }
      for (let i = this.smokes.length - 1; i >= 0; i -= 1) {
        const s = this.smokes[i];
        s.life -= dt;
        const k = Math.max(0, s.life / s.max);
        s.sprite.material.opacity = 0.8 * k;
        s.sprite.scale.x += dt * 2;
        s.sprite.scale.y += dt * 2;
        s.sprite.position.y += dt * 1.2;
        if (s.life <= 0) {
          this.scene.remove(s.sprite);
          s.sprite.material.dispose();
          this.smokes.splice(i, 1);
        }
      }
    }
    if (this.shotCamera) {
      this.camera.position.copy(this.shotCamera.pos);
      this.camera.lookAt(this.shotCamera.look);
    }
    this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    this.time += dt;
    const input = this.inputState();
    this.audio.update();
    this.city.update(dt, this.time);
    const px = this.player.inCar && this.playerCar ? this.playerCar.x : this.player.x;
    const pz = this.player.inCar && this.playerCar ? this.playerCar.z : this.player.z;

    if (this.player.inCar && this.playerCar) {
      const impact = driveCar(this.playerCar, input, dt, (x, z, r) => this.city.resolveCollision(x, z, r));
      if (impact > 6) {
        this.audio.crash(impact);
        this.spawnSmoke(this.playerCar.x, this.playerCar.z, impact > 14);
        this.peds.scare(this.playerCar.x, this.playerCar.z, 18);
        if (impact > 20) this.addWanted(1);
      }
      // Run over peds.
      for (const p of this.peds.list) {
        if (!p.down && dist2(p.x, p.z, this.playerCar.x, this.playerCar.z) < 2.1 && Math.abs(this.playerCar.speed) > 3) {
          this.peds.knockDown(p);
          this.addWanted(1);
        }
      }
      // Bump traffic.
      for (const c of this.traffic.cars) {
        if (c === this.playerCar) continue;
        if (dist2(c.x, c.z, this.playerCar.x, this.playerCar.z) < 3.2) {
          const push = 3;
          c.x += (c.x - this.playerCar.x) * 0.1 + push * 0.05;
          c.z += (c.z - this.playerCar.z) * 0.1 + push * 0.05;
          if (Math.abs(this.playerCar.speed) > 10) {
            this.audio.crash(Math.abs(this.playerCar.speed));
            this.spawnSmoke(this.playerCar.x, this.playerCar.z, false);
          }
          this.playerCar.speed *= 0.55;
        }
      }
      this.player.followCar(dt, this.camera, this.playerCar);
      this.audio.setEngine(true, Math.abs(this.playerCar.speed) / 35);
    } else {
      this.player.update(dt, this.time, input, this.camera, (x, z, r) => this.city.resolveCollision(x, z, r));
      this.audio.setEngine(false, 0);
    }

    this.traffic.update(dt, (x, z, r) => this.city.resolveCollision(x, z, r));
    this.police.update(dt, this.time, px, pz, this.wanted, (x, z, r) => this.city.resolveCollision(x, z, r));
    this.peds.update(dt, (x, z, r) => this.city.resolveCollision(x, z, r), px, pz);

    // Wanted decay after a quiet spell.
    if (this.wanted > 0) {
      this.wantedTimer += dt;
      if (this.wantedTimer > WANTED.quietSeconds) {
        this.decayTimer += dt;
        if (this.decayTimer > WANTED.decayEvery) {
          this.decayTimer = 0;
          this.setWanted(this.wanted - 1, true);
        }
      }
    }

    // Police ram damage + bust.
    if (this.ramCooldown > 0) this.ramCooldown -= dt;
    const ram = this.police.rammingCruiser(px, pz);
    if (ram && this.ramCooldown <= 0) {
      this.ramCooldown = 1.2;
      if (this.player.hurt(WANTED.ramDamage, this.time)) { this.wasted(); return; }
      this.hud.setVignette(0.8);
      this.audio.crash(10);
    }
    if (this.police.bustingCop()) { this.busted(); return; }
    if (this.shootCooldown > 0) this.shootCooldown -= dt;

    // Police shoot at the player when close and wanted.
    if (this.wanted >= 2) {
      this.policeShootT -= dt;
      if (this.policeShootT <= 0) {
        this.policeShootT = 1.4;
        const near = this.police.cruisers.find((c) => dist2(c.x, c.z, px, pz) < 42);
        if (near) {
          this.fireTracer(
            { x: near.x, y: 1.4, z: near.z },
            { x: px + (Math.random() - 0.5) * 3, y: 1.3, z: pz + (Math.random() - 0.5) * 3 },
            0xff4a3a, 0.2,
          );
          this.audio.shot();
          if (Math.random() < 0.25 && this.player.hurt(4, this.time)) { this.wasted(); return; }
        }
      }
    }

    // Missions.
    const eHeld = !!this.keys['KeyE'];
    this.missions.update(dt, px, pz, this.player.inCar, eHeld);

    // HUD.
    this.hud.setHealth(this.player.health);
    this.hud.tickToast(dt);
    this.hud.setSpeed(this.playerCar ? this.playerCar.speed * 2.2 : 0, !!this.playerCar);
    this.hud.setCrosshair(!this.player.inCar);
    const marker = this.missions.markerPos();
    this.hud.drawMinimap(this.time, px, pz, this.player.inCar ? this.playerCar.heading : this.player.heading, this.traffic.cars, marker, this.wanted >= 4);
    if (this.hud && this.player.health < 100) {
      const v = document.getElementById('vignette');
      if (v) v.style.opacity = String(this.player.health < 35 ? 0.45 : 0.15);
    }
    // Edge arrow: distance + direction to the mission marker.
    if (marker) {
      const d = Math.round(dist2(px, pz, marker.x, marker.z));
      const dx = marker.x - px;
      const dz = marker.z - pz;
      const ang = Math.atan2(dx, dz);
      const arrows = ['▲', '↗', '▶', '↘', '▼', '↙', '◀', '↖'];
      const rel = Math.round(((ang - (this.player.inCar ? this.playerCar.heading : this.player.heading)) / (Math.PI / 4)) + 8) % 8;
      this.hud.setEdgeArrow(arrows[rel] + ' ' + d + 'm');
    } else {
      this.hud.setEdgeArrow('');
    }
    const nearCar = !this.player.inCar ? this.nearestCar(5) : null;
    this.hud.setHint(nearCar ? 'Press E to steal the ' + nearCar.variant : 'WASD walk · E steal / exit car · N start job · Click shoot · P pause');
  }
}

// Boot the game when the module loads.
new Game();
