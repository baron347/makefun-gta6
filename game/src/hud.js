// NEON HARBOR — the DOM HUD: cash, health, wanted stars, mission
// banner, toast line, speedometer, crosshair, damage vignette, the
// circular minimap (redrawn every 150 ms), the edge arrow that points
// at the mission marker, and the menu / pause / busted / wasted screens.

import { clamp } from './config.js';

export function createHUD(G) {
  const $ = (id) => document.getElementById(id);
  const el = {
    menu: $('menu'),
    pause: $('pause'),
    busted: $('busted'),
    wasted: $('wasted'),
    cash: $('cash'),
    healthBar: $('health-bar'),
    healthNum: $('health-num'),
    stars: $('stars'),
    missionTitle: $('mission-title'),
    missionObj: $('mission-obj'),
    missionTimer: $('mission-timer'),
    toast: $('toast'),
    speed: $('speed'),
    hint: $('hint'),
    crosshair: $('crosshair'),
    vignette: $('vignette'),
    edgeArrow: $('edge-arrow'),
    minimap: $('minimap'),
    pauseStats: $('pause-stats'),
    menuContinue: $('btn-continue'),
  };
  const mm = el.minimap.getContext('2d');
  let mmT = 1; // Draw on the very first update (the cover shot freezes after one).
  let toastT = 0;
  let flashT = 0;

  function show(id) {
    for (const k of ['menu', 'pause', 'busted', 'wasted']) {
      el[k].classList.toggle('hidden', k !== id);
    }
  }

  function hideAllScreens() {
    for (const k of ['menu', 'pause', 'busted', 'wasted']) el[k].classList.add('hidden');
  }

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.remove('hidden');
    toastT = 5;
  }

  function fmtTime(s) {
    const t = Math.max(0, Math.ceil(s));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }

  // Octant arrow (relative to the camera) + distance to the marker.
  function edgeArrow(px, pz, camYaw, mx, mz) {
    const dx = mx - px;
    const dz = mz - pz;
    const d = Math.hypot(dx, dz);
    if (d < 25) {
      el.edgeArrow.classList.add('hidden');
      return;
    }
    // Bearing of the marker in camera space: 0 = straight ahead.
    const worldBearing = Math.atan2(dx, dz);
    const camForward = -camYaw;
    let rel = worldBearing - camForward;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const q = Math.round(rel / (Math.PI / 2));
    const arrow = q === 0 ? '▲' : q === 1 ? '▶' : q === -1 ? '◀' : '▼';
    el.edgeArrow.textContent = `${arrow} ${Math.round(d)}m`;
    el.edgeArrow.classList.remove('hidden');
  }

  // Local-zoom minimap: a 300 m window around the player, not the whole
  // 600 m city — so the streets, the player arrow and nearby dots are
  // big enough to read, and the map never looks empty.
  function drawMinimap() {
    const S = 220;
    const R = 150;
    const scale = S / (R * 2);
    const px = G.playerCar ? G.playerCar.x : G.player.x;
    const pz = G.playerCar ? G.playerCar.z : G.player.z;
    const toMapX = (v) => (v - px + R) * scale;
    const toMapZ = (v) => (v - pz + R) * scale;
    mm.clearRect(0, 0, S, S);
    mm.save();
    mm.beginPath();
    mm.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    mm.clip();
    mm.fillStyle = '#241f33';
    mm.fillRect(0, 0, S, S);
    // Blocks in view.
    mm.fillStyle = '#4a4358';
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        const bx = -300 + i * 60 + 10;
        const bz = -300 + j * 60 + 10;
        mm.fillRect(toMapX(bx), toMapZ(bz), 40 * scale, 40 * scale);
      }
    }
    // Roads in view, thick.
    mm.strokeStyle = '#17141f';
    mm.lineWidth = 14 * scale;
    for (let i = 0; i <= 9; i++) {
      const r = -300 + i * 60;
      const rx = toMapX(r);
      if (rx >= -10 && rx <= S + 10) {
        mm.beginPath();
        mm.moveTo(rx, 0);
        mm.lineTo(rx, S);
        mm.stroke();
      }
      const rz = toMapZ(r);
      if (rz >= -10 && rz <= S + 10) {
        mm.beginPath();
        mm.moveTo(0, rz);
        mm.lineTo(S, rz);
        mm.stroke();
      }
    }
    // Mission marker.
    const marker = G.missions.markerPos();
    if (marker) {
      const pulse = 7 + Math.sin(performance.now() / 300) * 2;
      mm.fillStyle = '#ffc861';
      mm.beginPath();
      mm.arc(toMapX(marker.x), toMapZ(marker.z), pulse, 0, Math.PI * 2);
      mm.fill();
      mm.strokeStyle = 'rgba(255,200,97,0.6)';
      mm.lineWidth = 2;
      mm.beginPath();
      mm.arc(toMapX(marker.x), toMapZ(marker.z), pulse + 5, 0, Math.PI * 2);
      mm.stroke();
    }
    // Traffic dots.
    mm.fillStyle = '#9a9aa8';
    for (const c of G.traffic.cars) {
      mm.fillRect(toMapX(c.x) - 2.5, toMapZ(c.z) - 2.5, 5, 5);
    }
    // Roadblocks: solid red squares.
    mm.fillStyle = '#ff2a2a';
    for (const c of (G.police.roadblocks || [])) {
      mm.fillRect(toMapX(c.x) - 3.5, toMapZ(c.z) - 3.5, 7, 7);
    }
    // Police: flashing red/blue.
    flashT += 0.15;
    mm.fillStyle = Math.floor(flashT) % 2 === 0 ? '#ff2a2a' : '#2a6aff';
    for (const c of G.police.cruisers) {
      mm.beginPath();
      mm.arc(toMapX(c.x), toMapZ(c.z), 5, 0, Math.PI * 2);
      mm.fill();
    }
    // Player arrow, centred, rotated to heading.
    const heading = G.playerCar ? G.playerCar.heading : G.player.heading;
    mm.save();
    mm.translate(S / 2, S / 2);
    mm.rotate(Math.atan2(Math.sin(heading), -Math.cos(heading)) + Math.PI);
    mm.fillStyle = '#ffffff';
    mm.beginPath();
    mm.moveTo(0, -10);
    mm.lineTo(7, 8);
    mm.lineTo(-7, 8);
    mm.closePath();
    mm.fill();
    mm.restore();
    mm.restore();
    // Ring around the minimap.
    mm.strokeStyle = 'rgba(255,255,255,0.35)';
    mm.lineWidth = 2;
    mm.beginPath();
    mm.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
    mm.stroke();
  }

  function update(dt) {
    if (toastT > 0) {
      toastT -= dt;
      if (toastT <= 0) el.toast.classList.add('hidden');
    }
    el.cash.textContent = `$${Math.floor(G.money)}`;
    const hp = clamp(Math.round(G.player.health), 0, 100);
    el.healthBar.style.width = `${hp}%`;
    el.healthBar.style.background = hp > 50 ? '#37d67a' : hp > 25 ? '#ffb02a' : '#ff3b30';
    el.healthNum.textContent = hp;
    let stars = '';
    for (let i = 1; i <= 5; i++) {
      stars += `<span class="star ${i <= G.wanted ? 'lit' : ''}">★</span>`;
    }
    el.stars.innerHTML = stars;
    const obj = G.missions.objectiveText();
    el.missionTitle.textContent = obj.title;
    el.missionObj.textContent = obj.text;
    if (obj.timer !== null && obj.timer !== undefined) {
      el.missionTimer.textContent = fmtTime(obj.timer);
      el.missionTimer.classList.toggle('urgent', obj.timer < 30);
      el.missionTimer.classList.remove('hidden');
    } else {
      el.missionTimer.classList.add('hidden');
    }
    // Speedometer (driving only).
    if (G.playerCar) {
      el.speed.textContent = `${Math.round(Math.abs(G.playerCar.speed) * 3.6)} km/h`;
      el.speed.classList.remove('hidden');
    } else {
      el.speed.classList.add('hidden');
    }
    el.crosshair.classList.toggle('hidden', !!G.playerCar || G.state !== 'playing');
    el.hint.textContent = G.playerCar
      ? 'WASD drive · Space handbrake · E exit car · N job · P pause · M mute'
      : 'WASD walk · Shift run · Space jump · Click shoot · E steal car · N job · P pause · M mute';
    // Damage vignette when recently hit or low on health.
    const sinceHit = performance.now() / 1000 - G.lastDamageAt;
    const vig = G.player.health < 35 ? 0.55 : sinceHit < 0.6 ? 0.7 : 0;
    el.vignette.style.opacity = vig;
    // Edge arrow to the marker.
    const marker = G.missions.markerPos();
    if (marker && G.state === 'playing') {
      const px = G.playerCar ? G.playerCar.x : G.player.x;
      const pz = G.playerCar ? G.playerCar.z : G.player.z;
      edgeArrow(px, pz, G.player.camYaw, marker.x, marker.z);
    } else {
      el.edgeArrow.classList.add('hidden');
    }
    // Minimap on a timer.
    mmT += dt;
    if (mmT > 0.15) {
      mmT = 0;
      drawMinimap();
    }
  }

  function showPauseStats() {
    el.pauseStats.textContent =
      `Cash $${Math.floor(G.money)}  ·  Jobs done ${G.missions.completed.length}  ·  ` +
      `Next: ${G.missions.index < 6 ? `Job ${G.missions.index + 1}` : 'Courier runs'}  ·  Wanted ${G.wanted}★`;
  }

  function setContinueVisible(visible) {
    el.menuContinue.classList.toggle('hidden', !visible);
  }

  return {
    el, update, toast, show, hideAllScreens, showPauseStats, setContinueVisible, drawMinimap,
  };
}
