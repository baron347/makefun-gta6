// NEON HARBOR — DOM HUD: cash, health, wanted stars, mission readout,
// toast, speed, crosshair, damage vignette, edge arrow to the marker,
// and a local-zoom minimap (the streets around the player, not the
// whole empty city).

import { CITY } from './config.js';

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {};
    for (const id of [
      'cash', 'health-fill', 'health-num', 'stars', 'mission-title',
      'mission-objective', 'mission-timer', 'toast', 'speed', 'crosshair',
      'vignette', 'edge-arrow', 'minimap', 'menu', 'pause', 'busted',
      'wasted', 'btn-continue', 'pause-stats', 'busted-text', 'wasted-text',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.minimapCtx = this.el.minimap.getContext('2d');
    this._lastMinimap = 0;
    this._toastTimer = null;
  }

  toast(msg, holdMs = 4200) {
    const t = this.el.toast;
    if (!t) return;
    t.textContent = msg;
    t.style.opacity = '1';
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      t.style.opacity = '0';
    }, holdMs);
  }

  hideToast() {
    const t = this.el.toast;
    if (t) t.style.opacity = '0';
    if (this._toastTimer) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
  }

  update() {
    const g = this.game;
    this.el.cash.textContent = `$${Math.floor(g.money).toLocaleString('en-US')}`;
    const hp = Math.max(0, Math.round(g.health));
    this.el['health-fill'].style.width = `${hp}%`;
    this.el['health-fill'].style.background = hp < 35 ? '#e33' : '#3fae5a';
    this.el['health-num'].textContent = hp;
    const stars = this.el.stars.children;
    for (let i = 0; i < stars.length; i++) {
      stars[i].classList.toggle('lit', i < g.wanted);
    }
    const m = g.missions.active;
    if (m) {
      this.el['mission-title'].textContent = m.def.title;
      this.el['mission-objective'].textContent = m.def.text;
      this.el['mission-timer'].textContent = m.timer !== null
        ? `${Math.max(0, Math.ceil(m.timer))}s`
        : (m.def.type === 'tail'
          ? `Tail: ${Math.max(0, Math.ceil(m.def.tailTime - m.tailT))}s`
          : '');
    } else {
      const next = g.missions.index < 6 ? 'Press N for the next job' : 'Press N for a courier run';
      this.el['mission-title'].textContent = g.missions.completed.length ? 'Between jobs' : 'NEON HARBOR';
      this.el['mission-objective'].textContent = next;
      this.el['mission-timer'].textContent = '';
    }
    this.el.speed.textContent = g.playerCar
      ? `${Math.round(Math.abs(g.playerCar.speed) * 3.6)} km/h`
      : '';
    this.el.crosshair.style.display = (!g.playerCar && g.state === 'playing') ? 'block' : 'none';
    const sinceHit = performance.now() - g.lastDamageAt;
    const vig = g.health < 35 ? 0.55 : sinceHit < 900 ? 0.5 : 0;
    this.el.vignette.style.opacity = String(vig);
    this._edgeArrow();
  }

  // Arrow at the screen edge pointing at the off-screen mission marker.
  _edgeArrow() {
    const g = this.game;
    const a = this.el['edge-arrow'];
    const pos = g.missions.markerPos ? g.missions.markerPos() : null;
    const px = g.playerCar ? g.playerCar.x : g.player.x;
    const pz = g.playerCar ? g.playerCar.z : g.player.z;
    if (!pos || !g.missions.active || g.state !== 'playing') {
      a.style.display = 'none';
      return;
    }
    const dx = pos.x - px;
    const dz = pos.z - pz;
    const d = Math.hypot(dx, dz);
    if (d < 25) {
      a.style.display = 'none';
      return;
    }
    // Project the marker into camera space to find the screen direction.
    const cam = g.camera;
    const v = new (window.THREE.Vector3)(pos.x, 2, pos.z).project(cam);
    let sx = v.x;
    let sy = v.y;
    if (v.z > 1 || Math.abs(sx) > 1 || Math.abs(sy) > 1) {
      // Off-screen or behind: fall back to the world-space bearing
      // relative to the camera yaw.
      const bearing = Math.atan2(dx, dz);
      const rel = bearing - (g.player.camYaw + Math.PI);
      sx = Math.sin(rel);
      sy = -Math.cos(rel);
    }
    const len = Math.hypot(sx, sy) || 1;
    sx /= len;
    sy /= len;
    const char = Math.abs(sx) > Math.abs(sy) * 1.4
      ? (sx > 0 ? '▶' : '◀')
      : (sy < 0 ? '▲' : '▼');
    a.textContent = `${char} ${Math.round(d)}m`;
    a.style.display = 'block';
    a.style.left = `${50 + sx * 38}%`;
    a.style.top = `${50 - sy * 38}%`;
  }

  drawMinimap(now) {
    if (now - this._lastMinimap < 150) return;
    this._lastMinimap = now;
    const g = this.game;
    const ctx = this.minimapCtx;
    const S = 220;
    const px = g.playerCar ? g.playerCar.x : g.player.x;
    const pz = g.playerCar ? g.playerCar.z : g.player.z;
    const range = 110; // half-window in metres: local zoom around the player
    const toMap = (x, z) => [
      ((x - px) / (range * 2) + 0.5) * S,
      ((z - pz) / (range * 2) + 0.5) * S,
    ];
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    // Circular clip.
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#15121c';
    ctx.fillRect(0, 0, S, S);
    // Blocks.
    ctx.fillStyle = '#2c2836';
    for (let i = 0; i < CITY.blocks; i++) {
      for (let j = 0; j < CITY.blocks; j++) {
        const cx = -CITY.span + CITY.pitch / 2 + i * CITY.pitch;
        const cz = -CITY.span + CITY.pitch / 2 + j * CITY.pitch;
        const [mx, mz] = toMap(cx, cz);
        ctx.fillRect(mx - 23, mz - 23, 46, 46);
      }
    }
    // Roads, thick so the grid reads at this zoom.
    ctx.strokeStyle = '#4a4552';
    ctx.lineWidth = 13;
    for (let i = 0; i < CITY.roadCount; i++) {
      const r = -CITY.span + i * CITY.pitch;
      const [ax] = toMap(r, 0);
      const [, bz] = toMap(0, r);
      ctx.beginPath(); ctx.moveTo(ax, -10); ctx.lineTo(ax, S + 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, bz); ctx.lineTo(S + 10, bz); ctx.stroke();
    }
    // Mission marker.
    const mp = g.missions.markerPos ? g.missions.markerPos() : null;
    if (mp && g.missions.active) {
      const [mx, mz] = toMap(mp.x, mp.z);
      ctx.fillStyle = '#ffc833';
      ctx.beginPath(); ctx.arc(mx, mz, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff2c8';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, mz, 10, 0, Math.PI * 2); ctx.stroke();
    }
    // Traffic dots.
    ctx.fillStyle = '#9a9aa5';
    for (const c of g.traffic.cars) {
      const [mx, mz] = toMap(c.x, c.z);
      ctx.fillRect(mx - 2, mz - 2, 4, 4);
    }
    // Police: flashing red/blue.
    const flash = Math.floor(now / 300) % 2 === 0;
    ctx.fillStyle = flash ? '#ff3333' : '#3388ff';
    for (const c of g.police.cruisers) {
      const [mx, mz] = toMap(c.x, c.z);
      ctx.beginPath(); ctx.arc(mx, mz, 4, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow, rotated to heading. Map x is right, map y is +z (down),
    // and the arrow is drawn pointing up, so rotate by PI - heading.
    const heading = g.playerCar ? g.playerCar.heading : g.player.heading;
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(Math.PI - heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(-6, 7); ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    // Rim.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); ctx.stroke();
  }

  showScreen(name) {
    for (const s of ['menu', 'pause', 'busted', 'wasted']) {
      this.el[s].style.display = s === name ? 'flex' : 'none';
    }
  }

  refreshMenu(hasSave) {
    this.el['btn-continue'].style.display = hasSave ? 'inline-block' : 'none';
  }

  setPauseStats(text) {
    this.el['pause-stats'].textContent = text;
  }

  setBustedText(text) {
    this.el['busted-text'].textContent = text;
  }

  setWastedText(text) {
    this.el['wasted-text'].textContent = text;
  }
}
