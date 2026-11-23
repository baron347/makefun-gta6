// NEON HARBOR — game orchestration: loop, input, wanted/health/crime,
// shooting, save/load, menus. Subsystems own their own state; this file
// wires them together and exposes window.__game for playtests.

import { CITY, PLAYER, SAVE_KEY, RESPAWN, clamp } from './config.js';
import { City } from './city.js';
import { AudioSys } from './audio.js';
import { Traffic, Police, updatePlayerCar, collideCars, repaintCar } from './vehicles.js';
import { Peds } from './peds.js';
import { Player } from './player.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { runShot } from './shots.js';

const THREE = window.THREE;

export class Game {
  constructor() {
    this.state = 'menu'; // menu | playing | paused | busted | wasted
    this.money = 0;
    this.health = PLAYER.healthMax;
    this.wanted = 0;
    this.lastDamageAt = 0;
    this.lastHealAt = 0;
    this.quietTimer = 0;
    this.decayTimer = 0;
    this.playerCar = null;
    this.frozen = false;
    this.cameraOverride = null;
    this.seed = this._seedFromUrl();

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdd7a4e);
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(0, 90, 180);

    this.city = new City(this.scene, this.seed);
    this.city.build();
    this.audio = new AudioSys();
    this.traffic = new Traffic(this.scene, this.city, this.seed);
    this.traffic.spawn();
    this.peds = new Peds(this.scene, this.city, this.seed);
    this.peds.spawn(24);
    this.player = new Player(this.scene, this.city);
    this.police = new Police(this.scene, this.city, this.seed);
    this.missions = new Missions(this.scene, this.city, this);
    this.hud = new HUD(this);
    this.input = { forward: false, back: false, left: false, right: false, run: false, jump: false, handbrake: false, action: false };

    this._buildShooterFx();
    this._bindInput();
    this._bindButtons();
    this.hud.refreshMenu(this.loadSave() !== null);

    window.__game = this;

    // Screenshot staging (?shot=cover|street|mission|chase&seed=7) runs the
    // real game forward with a scripted autopilot, then freezes the frame.
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    if (shot) {
      this.state = 'playing';
      this.hud.showScreen(null);
      runShot(this, shot);
    }
    // The loop always runs: after a freeze it keeps re-rendering the same
    // frame, which keeps the WebGL buffer alive for the screenshot.
    this._loop(performance.now());
    window.addEventListener('resize', () => this._resize());
  }

  _seedFromUrl() {
    const s = Number(new URLSearchParams(window.location.search).get('seed'));
    return Number.isFinite(s) && s > 0 ? Math.floor(s) : 7;
  }

  _resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // --- Shooting FX: thick tracer beam + muzzle flash -----------------------
  _buildShooterFx() {
    // A stretched cylinder reads as a tracer at screenshot distance; a
    // 1 px THREE.Line is invisible in the JPEG.
    this.tracer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 1, 6, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffe9a0, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.tracer.visible = false;
    this.tracer.frustumCulled = false;
    this.scene.add(this.tracer);
    this.tracerLife = 0;
    this.muzzle = new THREE.PointLight(0xffc86b, 0, 12);
    this.scene.add(this.muzzle);
  }

  _showTracer(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.1) return;
    this.tracer.position.copy(from).addScaledVector(dir, 0.5);
    this.tracer.scale.set(1, len, 1);
    this.tracer.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    );
    this.tracer.visible = true;
    this.tracer.material.opacity = 0.9;
    this.tracerLife = 0.08;
    this.muzzle.position.copy(from);
    this.muzzle.intensity = 25;
  }

  // --- Input ----------------------------------------------------------------
  _bindInput() {
    this.keys = new Set();
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyM') {
        this.audio.setMuted(!this.audio.muted);
        this.toast(this.audio.muted ? 'Sound muted' : 'Sound on');
      }
      if (e.code === 'KeyN' && this.state === 'playing' && !this.frozen) {
        if (!this.missions.active) this.missions.startNext();
      }
      if ((e.code === 'KeyP' || e.code === 'Escape') && !this.frozen) {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
      }
      if (e.code === 'Enter' && (this.state === 'busted' || this.state === 'wasted')) {
        this._respawnContinue();
      }
      if (e.code === 'KeyE' && this.state === 'playing' && !this.frozen) {
        if (this.playerCar) this.exitCar();
        else this.stealNearestCar();
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    const canvas = this.renderer.domElement;
    canvas.addEventListener('click', () => {
      if (this.state !== 'playing') return;
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
      if (!this.playerCar) this.shoot();
    });
    document.addEventListener('mousemove', (e) => {
      if (this.state !== 'playing' || this.frozen) return;
      if (document.pointerLockElement === canvas) {
        this.player.camYaw -= e.movementX * 0.0025;
        this.player.camPitch = clamp(this.player.camPitch + e.movementY * 0.002, 0.08, 0.9);
      } else if (this._dragging) {
        this.player.camYaw -= (e.clientX - this._dragX) * 0.005;
        this.player.camPitch = clamp(this.player.camPitch + (e.clientY - this._dragY) * 0.004, 0.08, 0.9);
        this._dragX = e.clientX;
        this._dragY = e.clientY;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      this._dragging = true;
      this._dragX = e.clientX;
      this._dragY = e.clientY;
    });
    window.addEventListener('mouseup', () => { this._dragging = false; });
  }

  _readInput() {
    const k = this.keys;
    this.input.forward = k.has('KeyW') || k.has('ArrowUp');
    this.input.back = k.has('KeyS') || k.has('ArrowDown');
    this.input.left = k.has('KeyA') || k.has('ArrowLeft');
    this.input.right = k.has('KeyD') || k.has('ArrowRight');
    this.input.run = k.has('ShiftLeft') || k.has('ShiftRight');
    this.input.jump = k.has('Space');
    this.input.handbrake = k.has('Space');
    this.input.action = k.has('KeyE');
  }

  _bindButtons() {
    document.getElementById('btn-start').addEventListener('click', () => {
      this.audio.ensure();
      this.audio.click();
      this.startGame(false);
    });
    document.getElementById('btn-continue').addEventListener('click', () => {
      this.audio.ensure();
      this.audio.click();
      this.startGame(true);
    });
    document.getElementById('btn-resume').addEventListener('click', () => this.resume());
    document.getElementById('btn-save').addEventListener('click', () => {
      this.saveGame();
      this.toast('Game saved');
    });
    document.getElementById('btn-quit').addEventListener('click', () => this.quitToMenu());
    document.getElementById('btn-busted-ok').addEventListener('click', () => this._respawnContinue());
    document.getElementById('btn-wasted-ok').addEventListener('click', () => this._respawnContinue());
  }

  // --- Flow -----------------------------------------------------------------
  startGame(fromSave) {
    if (fromSave) {
      const s = this.loadSave();
      if (s) {
        this.money = s.money || 0;
        this.missions.index = s.missionIndex || 0;
        this.missions.completed = s.completed || [];
        this.player.setPosition(s.x ?? 0, s.z ?? 60, Math.PI);
      }
    }
    this.state = 'playing';
    this.hud.showScreen(null);
    this.hud.update();
  }

  pause() {
    this.state = 'paused';
    this.hud.setPauseStats(
      `Cash $${Math.floor(this.money)}  •  Jobs done: ${this.missions.completed.length}  •  Wanted: ${'★'.repeat(this.wanted) || 'clean'}`,
    );
    this.hud.showScreen('pause');
    document.exitPointerLock?.();
  }

  resume() {
    this.state = 'playing';
    this.hud.showScreen(null);
  }

  quitToMenu() {
    this.state = 'menu';
    this.hud.refreshMenu(this.loadSave() !== null);
    this.hud.showScreen('menu');
  }

  _respawnContinue() {
    this.state = 'playing';
    this.hud.showScreen(null);
  }

  // --- Crime / wanted / health ----------------------------------------------
  addCrime(n) {
    if (this.wanted >= 5) return;
    this.wanted = Math.min(5, this.wanted + n);
    this.audio.setWanted(this.wanted);
    this.toast(`+${n}★ wanted`);
  }

  setWanted(n) {
    this.wanted = clamp(Math.round(n), 0, 5);
    this.audio.setWanted(this.wanted);
    if (this.wanted === 0) this.police.clearAll();
  }

  addCash(n) {
    this.money += n;
  }

  toast(msg) {
    this.hud.toast(msg);
  }

  damage(amount) {
    if (this.state !== 'playing') return;
    this.health -= amount;
    this.lastDamageAt = performance.now();
    if (this.health <= 0) {
      this.health = 0;
      this._wasted();
    }
  }

  _wasted() {
    const lost = Math.floor(this.money * 0.15);
    this.money -= lost;
    this.state = 'wasted';
    if (this.playerCar) this._abandonCar();
    this.player.setPosition(RESPAWN.clinic.x, RESPAWN.clinic.z, Math.PI);
    this.player.show();
    this.health = PLAYER.healthMax;
    this.hud.setWastedText(`The streets got you. You lost $${lost} at the clinic.`);
    this.hud.showScreen('wasted');
    document.exitPointerLock?.();
  }

  _busted() {
    if (this.state !== 'playing') return;
    const fine = Math.min(this.money, 100 + 50 * this.wanted);
    this.money -= fine;
    this.state = 'busted';
    if (this.playerCar) this._abandonCar();
    this.player.setPosition(RESPAWN.precinct.x, RESPAWN.precinct.z, Math.PI);
    this.player.show();
    this.setWanted(0);
    this.police.clearAll();
    this.hud.setBustedText(`Busted! The precinct took $${fine} in fines.`);
    this.hud.showScreen('busted');
    document.exitPointerLock?.();
  }

  _abandonCar() {
    const car = this.playerCar;
    this.playerCar = null;
    car.speed = 0;
    this.traffic.addParked(car);
  }

  // --- Cars -------------------------------------------------------------------
  stealNearestCar() {
    if (this.playerCar) return false;
    const px = this.player.x;
    const pz = this.player.z;
    let best = null;
    let bestD = 4.5;
    for (const c of this.traffic.parked) {
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d < bestD) { best = c; bestD = d; }
    }
    for (const c of this.traffic.cars) {
      if (c.speed > 1) continue; // only a stopped car can be jacked
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d < bestD) { best = c; bestD = d; }
    }
    if (!best) return false;
    if (best.isParked) this.traffic.removeParked(best);
    else {
      const i = this.traffic.cars.indexOf(best);
      if (i >= 0) this.traffic.cars.splice(i, 1);
    }
    best.isParked = false;
    this.playerCar = best;
    this.player.hide();
    this.player.setPosition(best.x, best.z, best.heading);
    this.addCrime(1);
    this.audio.blip();
    return true;
  }

  exitCar() {
    if (!this.playerCar) return;
    const car = this.playerCar;
    const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    this.player.setPosition(car.x + side.x * 2.6, car.z + side.z * 2.6, car.heading);
    this.player.show();
    this.playerCar = null;
    car.speed = 0;
    this.traffic.addParked(car);
  }

  // --- Shooting ---------------------------------------------------------------
  shoot() {
    if (this.state !== 'playing' || this.playerCar || this.frozen) return false;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const origin = this.camera.position.clone();
    const muzzlePos = this.player.mesh.position.clone();
    muzzlePos.y = 1.3;
    // Aim where the crosshair points, at torso height: the camera sits
    // metres above the player, so a ray from the camera alone would pass
    // over anything standing in the street ahead. The shot itself travels
    // from the muzzle toward that aim point.
    const aimPoint = origin.clone().add(dir.clone().multiplyScalar(40));
    aimPoint.y = 1.2;
    const shotDir = aimPoint.clone().sub(muzzlePos).normalize();
    this._showTracer(muzzlePos, muzzlePos.clone().add(shotDir.clone().multiplyScalar(40)));
    this.audio.gunshot();
    // Nearest ped or car within 60 m and ~3 degrees of the shot line.
    const cosLimit = Math.cos(0.052);
    let best = null;
    let bestD = 60;
    let bestIsPed = false;
    for (const ped of this.peds.list) {
      if (ped.state === 'down') continue;
      const v = new THREE.Vector3(ped.x - muzzlePos.x, 1.2 - muzzlePos.y, ped.z - muzzlePos.z);
      const d = v.length();
      if (d > 60 || d > bestD) continue;
      if (v.normalize().dot(shotDir) > cosLimit) {
        best = ped;
        bestD = d;
        bestIsPed = true;
      }
    }
    for (const c of [...this.traffic.cars, ...this.traffic.parked, ...this.police.cruisers]) {
      const v = new THREE.Vector3(c.x - muzzlePos.x, 0.8 - muzzlePos.y, c.z - muzzlePos.z);
      const d = v.length();
      if (d > 60 || d > bestD) continue;
      if (v.normalize().dot(shotDir) > cosLimit) {
        best = c;
        bestD = d;
        bestIsPed = false;
      }
    }
    if (best) {
      const hit = new THREE.Vector3(best.x, 1.2, best.z);
      this._showTracer(muzzlePos, hit);
      if (bestIsPed) {
        this.peds.knockDown(best);
        this.peds.scare(best.x, best.z, 25);
        this.addCrime(1);
        this.audio.thud();
      } else {
        this.audio.thud(0.25);
      }
      return true;
    }
    return false;
  }

  // --- Save / load --------------------------------------------------------------
  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: Math.floor(this.money),
        missionIndex: this.missions.index,
        completed: this.missions.completed,
        x: this.playerCar ? this.playerCar.x : this.player.x,
        z: this.playerCar ? this.playerCar.z : this.player.z,
      }));
    } catch {
      // Storage unavailable (private mode, etc.) — the game still runs.
    }
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  // --- Main loop ------------------------------------------------------------------
  _loop(now) {
    requestAnimationFrame((t) => this._loop(t));
    const dt = Math.min(0.05, Math.max(0.001, (now - (this._lastNow ?? now)) / 1000));
    this._lastNow = now;
    if (!this.frozen) this.tick(dt, now);
    this.renderer.render(this.scene, this.camera);
  }

  // One fixed step. The rAF loop calls it with real dt; screenshot staging
  // calls it with 1/60 directly.
  tick(dt, now = performance.now()) {
    if (this.state === 'menu') {
      // Slow orbit behind the menu.
      const t = now * 0.00004;
      this.camera.position.set(Math.cos(t) * 230, 110, Math.sin(t) * 230);
      this.camera.lookAt(0, 10, 0);
      this.traffic.update(dt, null, true);
      this.peds.update(dt, now);
      return;
    }
    if (this.state !== 'playing') return;
    this._readInput();
    const input = this.input;

    if (this.playerCar) {
      const car = this.playerCar;
      updatePlayerCar(car, {
        forward: input.forward,
        back: input.back,
        left: input.left,
        right: input.right,
        handbrake: input.handbrake,
      }, dt, this.city, (hitSpeed) => {
        this.audio.crash(Math.min(0.6, hitSpeed / 40));
        this.damage(hitSpeed * 0.15);
      });
      // Car-vs-car shoves.
      for (const other of this.traffic.cars) {
        if (collideCars(car, other)) this.audio.thud(0.2);
      }
      for (const c of this.police.cruisers) {
        if (collideCars(car, c)) this.audio.thud(0.2);
      }
      for (const b of this.police.roadblocks) {
        for (const c of b.cars) collideCars(car, c);
      }
      // Running a pedestrian over is a crime.
      const ped = this.peds.nearest(car.x, car.z, 2.4);
      if (ped && ped.state !== 'down' && Math.abs(car.speed) > 2) {
        this.peds.knockDown(ped);
        this.peds.scare(ped.x, ped.z, 25);
        this.addCrime(1);
        this.audio.thud();
      }
    } else {
      this.player.update(dt, input);
    }

    this.traffic.update(dt, this.playerCar, !this.playerCar);
    this.peds.update(dt, now);

    // Police ram damage while a cruiser touches the player.
    const px = this.playerCar ? this.playerCar.x : this.player.x;
    const pz = this.playerCar ? this.playerCar.z : this.player.z;
    for (const c of this.police.cruisers) {
      if (Math.hypot(c.x - px, c.z - pz) < 3.2) {
        this.damage(12 * dt);
        break;
      }
    }
    if (this.state !== 'playing') return; // busted/wasted during this step

    this.police.update(dt, this.wanted, this.player, this.playerCar, () => this._busted());
    if (this.state !== 'playing') return;
    this.missions.update(dt);

    // Wanted decay: quiet 25 s with no cop within 60 m, then -1 per 8 s.
    let copNear = false;
    for (const c of this.police.cruisers) {
      if (Math.hypot(c.x - px, c.z - pz) < 60) { copNear = true; break; }
    }
    if (!copNear) {
      for (const cop of this.police.cops) {
        if (Math.hypot(cop.x - px, cop.z - pz) < 60) { copNear = true; break; }
      }
    }
    if (this.wanted > 0 && !copNear) {
      this.quietTimer += dt;
      if (this.quietTimer > 25) {
        this.decayTimer += dt;
        if (this.decayTimer > 8) {
          this.decayTimer = 0;
          this.setWanted(this.wanted - 1);
          this.toast('The heat is cooling off…');
        }
      }
    } else {
      this.quietTimer = 0;
      this.decayTimer = 0;
    }

    // Health regen after 10 s without damage.
    if (this.health < PLAYER.healthMax && now - this.lastDamageAt > 10000) {
      this.health = Math.min(PLAYER.healthMax, this.health + 6 * dt);
    }

    // Audio layers follow the action.
    const speedNorm = this.playerCar ? Math.abs(this.playerCar.speed) / 34 : 0;
    this.audio.setEngine(speedNorm, !!this.playerCar);
    this.audio.setMusicPattern(this.wanted >= 3);

    // Camera + HUD.
    this.player.updateCamera(this.camera, dt, this.playerCar, this.cameraOverride);
    this.hud.update();
    this.hud.drawMinimap(now);

    // Tracer / muzzle fade.
    if (this.tracerLife > 0) {
      this.tracerLife -= dt;
      this.tracer.material.opacity = Math.max(0, this.tracerLife / 0.08);
      this.tracer.visible = this.tracerLife > 0;
      this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 900);
    }
  }

  // Called by shots.js when staging is done: hold this frame forever.
  freezeFrame() {
    this.frozen = true;
    this.hud.update();
    this.hud.drawMinimap(performance.now());
    this.renderer.render(this.scene, this.camera);
    window.__shotReady = true;
  }
}

// Boot when the DOM is ready.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new Game());
} else {
  new Game();
}
