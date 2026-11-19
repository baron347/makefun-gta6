// NEON HARBOR — the game itself: renderer, input, the main loop,
// wanted + health rules, shooting, stealing cars, save/load and the
// menu / pause / busted / wasted flow. Every subsystem hangs off the
// one game object G, which is also window.__game for the playtests.

import {
  SAVE_KEY, PLAYER, WANTED, CAR, clamp, dist2,
} from './config.js';
import { buildCity } from './city.js';
import { createAudio } from './audio.js';
import { createTraffic, createPolice, createSmoke, drivePlayerCar } from './vehicles.js';
import { createPeds } from './peds.js';
import { createPlayer } from './player.js';
import { createMissions } from './missions.js';
import { createHUD } from './hud.js';
import { setupShots } from './shots.js';

const urlSeed = Number(new URLSearchParams(location.search).get('seed') ?? 7) || 7;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 8, 42);
camera.lookAt(0, 1, 10);

const G = {
  renderer,
  scene,
  camera,
  state: 'menu',
  started: false,
  frozen: false,
  money: 0,
  wanted: 0,
  playerCar: null,
  keys: {},
  mouseDX: 0,
  mouseDY: 0,
  time: 0,
  lastDamageT: -100,
  lastDamageAt: -100,
  quietT: 0,
  decayT: 0,
  muted: false,
};

G.city = buildCity(scene, urlSeed);
G.audio = createAudio();
G.player = createPlayer(scene);
G.traffic = createTraffic(G.city, scene, urlSeed);
G.police = createPolice(G.city, scene, urlSeed);
G.peds = createPeds(scene, G.city, urlSeed);
G.smoke = createSmoke(scene);
G.hud = createHUD(G);
G.missions = createMissions(scene, G);

// Muzzle flash light + tracer line for shooting.
const muzzle = new THREE.PointLight(0xffc861, 0, 14);
scene.add(muzzle);
let tracer = null;
let policeTracer = null;
let flashTexture = null;

function setWanted(n) {
  G.wanted = clamp(Math.round(n), 0, WANTED.max);
}

function addWanted(n) {
  setWanted(G.wanted + n);
}

function saveGame() {
  try {
    const pos = G.playerCar ? { x: G.playerCar.x, z: G.playerCar.z } : { x: G.player.x, z: G.player.z };
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: Math.floor(G.money),
      missionIndex: G.missions.index,
      completed: G.missions.completed,
      x: pos.x,
      z: pos.z,
    }));
    return true;
  } catch {
    return false;
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    G.money = s.money ?? 0;
    G.missions.index = s.missionIndex ?? 0;
    G.missions.completed = s.completed ?? [];
    G.player.setPosition(s.x ?? 0, s.z ?? 20, Math.PI);
    return true;
  } catch {
    return false;
  }
}

function stealNearestCar() {
  if (G.playerCar || G.state !== 'playing') return false;
  const px = G.player.x;
  const pz = G.player.z;
  let best = null;
  let bestD = 4;
  for (const c of G.traffic.parked) {
    const d = dist2(px, pz, c.x, c.z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (!best) {
    for (const c of G.traffic.cars) {
      if (Math.abs(c.speed) > 3) continue;
      const d = dist2(px, pz, c.x, c.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
  }
  if (!best) return false;
  const pi = G.traffic.parked.indexOf(best);
  if (pi >= 0) G.traffic.parked.splice(pi, 1);
  const ti = G.traffic.cars.indexOf(best);
  if (ti >= 0) G.traffic.cars.splice(ti, 1);
  best.kind = 'player';
  best.speed = 0;
  G.playerCar = best;
  G.player.mesh.visible = false;
  addWanted(1);
  G.hud.toast('Car stolen — the cops noticed.');
  G.audio.blip();
  return true;
}

function exitCar() {
  const car = G.playerCar;
  if (!car) return;
  car.kind = 'parked';
  car.speed = 0;
  G.traffic.parked.push(car);
  G.playerCar = null;
  G.player.mesh.visible = true;
  G.player.setPosition(car.x + 2.6, car.z, car.heading);
  G.player.updateCamera(camera, 0.016, null, true);
}

function onBusted() {
  const fine = Math.min(Math.floor(G.money), 100 + 50 * G.wanted);
  G.money -= fine;
  if (G.playerCar) {
    G.playerCar.kind = 'parked';
    G.playerCar.speed = 0;
    G.traffic.parked.push(G.playerCar);
    G.playerCar = null;
  }
  G.player.mesh.visible = true;
  G.wanted = 0;
  G.police.clearAll();
  G.player.setPosition(0, -270, Math.PI);
  G.player.health = PLAYER.health;
  G.state = 'busted';
  G.hud.show('busted');
  document.getElementById('busted-fine').textContent = `Fine paid: $${fine}. Mama Lou is not impressed.`;
  G.audio.bustedSting();
  saveGame();
  if (document.pointerLockElement) document.exitPointerLock();
}

function onWasted() {
  const lost = Math.floor(G.money * 0.15);
  G.money -= lost;
  if (G.playerCar) {
    G.playerCar.kind = 'parked';
    G.playerCar.speed = 0;
    G.traffic.parked.push(G.playerCar);
    G.playerCar = null;
  }
  G.player.mesh.visible = true;
  G.wanted = 0;
  G.police.clearAll();
  G.player.setPosition(30, 270, Math.PI);
  G.player.health = PLAYER.health;
  G.state = 'wasted';
  G.hud.show('wasted');
  document.getElementById('wasted-loss').textContent = `You lost $${lost} (15%) at the clinic.`;
  G.audio.bustedSting();
  saveGame();
  if (document.pointerLockElement) document.exitPointerLock();
}

function damagePlayer(amount) {
  if (G.state !== 'playing') return;
  G.player.health -= amount;
  G.lastDamageT = G.time;
  G.lastDamageAt = performance.now() / 1000;
  if (G.player.health <= 0) {
    G.player.health = 0;
    onWasted();
  }
}

function shoot() {
  if (G.state !== 'playing' || G.playerCar) return;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = camera.position.clone();
  // Nearest ped or car within 60 m and ~3° of the crosshair.
  const cos3 = Math.cos((3 * Math.PI) / 180);
  let best = null;
  let bestD = 60;
  let bestKind = null;
  const consider = (x, z, obj, kind) => {
    const dx = x - origin.x;
    const dy = 1.2 - origin.y;
    const dz = z - origin.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > bestD) return;
    const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / d;
    if (dot > cos3) {
      bestD = d;
      best = obj;
      bestKind = kind;
    }
  };
  for (const p of G.peds.list) {
    if (p.state === 'down') continue;
    consider(p.x, p.z, p, 'ped');
  }
  for (const c of [...G.traffic.cars, ...G.traffic.parked, ...G.police.cruisers]) {
    consider(c.x, c.z, c, 'car');
  }
  const end = best
    ? new THREE.Vector3(best.x, 1.2, best.z)
    : origin.clone().add(dir.clone().multiplyScalar(60));
  if (tracer) {
    scene.remove(tracer.line);
    scene.remove(tracer.bolt);
    scene.remove(tracer.flash);
    tracer = null;
  }
  // The tracer and flash come from the gun in the player's hand, not
  // from the camera — so the shot reads in third person.
  const gunPos = new THREE.Vector3(
    G.player.x + Math.sin(G.player.heading) * 0.5,
    1.3,
    G.player.z + Math.cos(G.player.heading) * 0.5,
  );
  const geo = new THREE.BufferGeometry().setFromPoints([gunPos, end]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: 0xffe9a0, transparent: true, opacity: 0.95,
  }));
  scene.add(line);
  // A short, fat tracer cylinder reads at screenshot scale where a
  // 1 px line disappears, and a sprite flash marks the muzzle.
  const shotDir = end.clone().sub(gunPos);
  const shotLen = shotDir.length();
  const bolt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, shotLen, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe9a0 }),
  );
  bolt.position.copy(gunPos).add(end).multiplyScalar(0.5);
  bolt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), shotDir.normalize());
  scene.add(bolt);
  if (!flashTexture) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g2 = c.getContext('2d');
    const grad = g2.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,240,180,1)');
    grad.addColorStop(0.4, 'rgba(255,180,80,0.7)');
    grad.addColorStop(1, 'rgba(255,120,40,0)');
    g2.fillStyle = grad;
    g2.fillRect(0, 0, 64, 64);
    flashTexture = new THREE.CanvasTexture(c);
  }
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flashTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  flash.position.copy(gunPos);
  flash.scale.set(1.4, 1.4, 1);
  scene.add(flash);
  tracer = { line, bolt, flash, life: 0.08 };
  muzzle.position.copy(gunPos);
  muzzle.intensity = 4;
  G.audio.gunshot();
  if (bestKind === 'ped') {
    G.peds.knockDown(best);
    G.peds.scareNear(best.x, best.z, 25);
    addWanted(1);
    G.hud.toast('You shot a pedestrian (+1★).');
  }
}

// A cop fires at the player: a thick red tracer from the cruiser to a
// point near the player, plus a small muzzle flash. Staging + live play
// both use it; it never damages the player on its own.
function policeShot(from, to) {
  if (policeTracer) {
    scene.remove(policeTracer.bolt);
    scene.remove(policeTracer.flash);
    policeTracer = null;
  }
  const fromV = new THREE.Vector3(from.x, 1.3, from.z);
  const toV = new THREE.Vector3(to.x, 1.3, to.z);
  const dir = toV.clone().sub(fromV);
  const len = dir.length();
  const bolt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, len, 6),
    new THREE.MeshBasicMaterial({ color: 0xff5a3c }),
  );
  bolt.position.copy(fromV).add(toV).multiplyScalar(0.5);
  bolt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  scene.add(bolt);
  if (!flashTexture) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g2 = c.getContext('2d');
    const grad = g2.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,240,180,1)');
    grad.addColorStop(0.4, 'rgba(255,180,80,0.7)');
    grad.addColorStop(1, 'rgba(255,120,40,0)');
    g2.fillStyle = grad;
    g2.fillRect(0, 0, 64, 64);
    flashTexture = new THREE.CanvasTexture(c);
  }
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flashTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  flash.position.copy(fromV);
  flash.scale.set(1.2, 1.2, 1);
  scene.add(flash);
  policeTracer = { bolt, flash, life: 0.12 };
  G.audio.gunshot();
}

function startGame(fromSave) {
  if (fromSave) loadGame();
  G.state = 'playing';
  G.started = true;
  G.hud.hideAllScreens();
  G.audio.init();
}

function togglePause() {
  if (G.state === 'playing') {
    G.state = 'paused';
    G.hud.showPauseStats();
    G.hud.show('pause');
    if (document.pointerLockElement) document.exitPointerLock();
  } else if (G.state === 'paused') {
    G.state = 'playing';
    G.hud.hideAllScreens();
  }
}

G.setWanted = setWanted;
G.addWanted = addWanted;
G.saveGame = saveGame;
G.loadGame = loadGame;
G.stealNearestCar = stealNearestCar;
G.exitCar = exitCar;
G.shoot = shoot;
G.policeShot = policeShot;
G.damagePlayer = damagePlayer;
G.onBusted = onBusted;
G.onWasted = onWasted;
G.startGame = startGame;
G.onRamDamage = (dt) => damagePlayer(WANTED.ramDamage * dt);

// ---------------------------------------------------------------- input

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && G.state === 'playing') e.preventDefault();
  if (e.repeat) return;
  G.keys[e.code] = true;
  if (G.state === 'playing') {
    if (e.code === 'KeyE') {
      if (G.playerCar) exitCar();
      else stealNearestCar();
    }
    if (e.code === 'KeyN') G.missions.startNext();
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    if (e.code === 'KeyM') {
      G.muted = !G.muted;
      G.audio.setMuted(G.muted);
      G.hud.toast(G.muted ? 'Sound muted.' : 'Sound on.');
    }
  } else if (G.state === 'paused' && (e.code === 'KeyP' || e.code === 'Escape')) {
    togglePause();
  } else if ((G.state === 'busted' || G.state === 'wasted') && (e.code === 'Enter' || e.code === 'Space')) {
    G.state = 'playing';
    G.hud.hideAllScreens();
  }
});

window.addEventListener('keyup', (e) => {
  G.keys[e.code] = false;
});

const canvas = renderer.domElement;
canvas.addEventListener('mousedown', (e) => {
  if (G.state !== 'playing') return;
  if (e.button === 0) {
    shoot();
    if (!document.pointerLockElement) {
      try {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch {
        // Pointer lock unavailable (headless) — drag fallback still works.
      }
    }
  }
});

let dragging = false;
canvas.addEventListener('mousedown', () => { dragging = true; });
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) {
    G.mouseDX += e.movementX;
    G.mouseDY += e.movementY;
  } else if (dragging && G.state === 'playing') {
    G.mouseDX += e.movementX;
    G.mouseDY += e.movementY;
  }
});

document.getElementById('btn-start').addEventListener('click', () => startGame(false));
document.getElementById('btn-continue').addEventListener('click', () => startGame(true));
document.getElementById('btn-save').addEventListener('click', () => {
  saveGame();
  G.hud.toast('Game saved.');
  G.audio.blip();
});
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-quit').addEventListener('click', () => {
  G.state = 'menu';
  G.hud.show('menu');
  refreshMenu();
});
document.getElementById('busted').addEventListener('click', () => {
  G.state = 'playing';
  G.hud.hideAllScreens();
});
document.getElementById('wasted').addEventListener('click', () => {
  G.state = 'playing';
  G.hud.hideAllScreens();
});

function refreshMenu() {
  let hasSave = false;
  try {
    hasSave = !!localStorage.getItem(SAVE_KEY);
  } catch {
    hasSave = false;
  }
  G.hud.setContinueVisible(hasSave);
}
refreshMenu();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- the loop

function update(dt) {
  G.time += dt;
  const keys = G.keys;

  if (G.playerCar) {
    const input = {
      fwd: keys.KeyW || keys.ArrowUp ? 1 : 0,
      back: keys.KeyS || keys.ArrowDown ? 1 : 0,
      steer: (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0),
      handbrake: !!(keys.Space),
    };
    const { hit } = drivePlayerCar(G.playerCar, input, dt, G.city);
    if (hit) {
      G.audio.thud(1.8);
      G.smoke.puff(G.playerCar.x, G.playerCar.z);
    }
    G.audio.engine(Math.abs(G.playerCar.speed) / CAR.maxSpeed, true);
    // Running over pedestrians is a crime.
    for (const p of G.peds.list) {
      if (p.state === 'down') continue;
      if (dist2(p.x, p.z, G.playerCar.x, G.playerCar.z) < 2.2 && Math.abs(G.playerCar.speed) > 3) {
        G.peds.knockDown(p);
        G.peds.scareNear(p.x, p.z, 25);
        addWanted(1);
        G.audio.thud();
        G.hud.toast('You ran over a pedestrian (+1★).');
      }
    }
  } else {
    G.player.update(dt, keys, G.mouseDX, G.mouseDY, G.city, false);
    G.audio.engine(0, false);
  }
  G.mouseDX = 0;
  G.mouseDY = 0;

  G.player.updateCamera(camera, dt, G.playerCar);
  G.traffic.update(dt, G.playerCar);
  G.police.update(dt, G);
  G.peds.update(dt, G.player, G.playerCar);
  G.missions.update(dt);

  // Wanted decay: quiet for 25 s with no cop within 60 m, then -1★ / 8 s.
  if (G.wanted > 0) {
    const px = G.playerCar ? G.playerCar.x : G.player.x;
    const pz = G.playerCar ? G.playerCar.z : G.player.z;
    let near = false;
    for (const c of G.police.cruisers) {
      if (dist2(px, pz, c.x, c.z) < 60) { near = true; break; }
    }
    if (!near) {
      for (const c of G.police.cops) {
        if (dist2(px, pz, c.x, c.z) < 60) { near = true; break; }
      }
    }
    if (near) {
      G.quietT = 0;
      G.decayT = 0;
    } else {
      G.quietT += dt;
      if (G.quietT > WANTED.quietSeconds) {
        G.decayT += dt;
        if (G.decayT >= WANTED.decayEvery) {
          G.decayT = 0;
          setWanted(G.wanted - 1);
        }
      }
    }
  } else {
    G.quietT = 0;
    G.decayT = 0;
  }

  // Health regen after 10 s without damage.
  if (G.player.health < PLAYER.health && G.time - G.lastDamageT > PLAYER.regenDelay) {
    G.player.health = Math.min(PLAYER.health, G.player.health + PLAYER.regen * dt);
  }

  G.audio.siren(G.wanted > 0, dt);
  G.audio.setIntensity(G.wanted);
  G.smoke.update(dt);

  if (tracer) {
    tracer.life -= dt;
    tracer.line.material.opacity = Math.max(0, tracer.life / 0.08) * 0.95;
    if (tracer.life <= 0) {
      scene.remove(tracer.line);
      scene.remove(tracer.bolt);
      scene.remove(tracer.flash);
      tracer = null;
    }
  }
  if (policeTracer) {
    policeTracer.life -= dt;
    if (policeTracer.life <= 0) {
      scene.remove(policeTracer.bolt);
      scene.remove(policeTracer.flash);
      policeTracer = null;
    }
  }
  if (muzzle.intensity > 0) muzzle.intensity = Math.max(0, muzzle.intensity - dt * 60);

  G.hud.update(dt);
}

G.update = update;

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (!G.frozen && G.state === 'playing') update(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// Screenshot staging (?shot=...) runs the real game forward and freezes.
setupShots(G);

window.__game = G;
