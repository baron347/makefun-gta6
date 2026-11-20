// NEON HARBOR — the DOM HUD: cash, health, wanted stars, mission
// banner, toast line, speedometer, crosshair, damage vignette, and the
// circular minimap. The minimap is LOCAL-ZOOM: it shows the streets
// around the player (a ~120 m window), never the whole empty city, with
// thick road lines, the player arrow, traffic dots and the mission
// marker. Menu / pause / busted / wasted screens live here too.

import { CITY, ROADS } from './config.js';

function el(id) {
  return document.getElementById(id);
}

export class HUD {
  constructor() {
    this.minimap = el('minimap');
    this.mm = this.minimap ? this.minimap.getContext('2d') : null;
    this.lastMapWall = 0;
    this.toastTimer = 0;
  }

  show(id) {
    const n = el(id);
    if (n) n.classList.remove('hidden');
  }

  hide(id) {
    const n = el(id);
    if (n) n.classList.add('hidden');
  }

  setCash(money) {
    const n = el('cash');
    if (n) n.textContent = '$' + Math.floor(money).toLocaleString('en-US');
  }

  setHealth(h) {
    const bar = el('health-bar');
    const num = el('health-num');
    if (bar) {
      bar.style.width = Math.max(0, Math.min(100, h)) + '%';
      bar.style.background = h > 50 ? '#37d67a' : h > 25 ? '#ffc861' : '#ff3b30';
    }
    if (num) num.textContent = Math.ceil(Math.max(0, h));
  }

  setStars(wanted) {
    const n = el('stars');
    if (!n) return;
    let html = '';
    for (let i = 0; i < 5; i += 1) {
      html += '<span class="star' + (i < wanted ? ' lit' : '') + '">★</span>';
    }
    n.innerHTML = html;
  }

  setMission(title, obj, timerText, urgent) {
    const t = el('mission-title');
    const o = el('mission-obj');
    const tm = el('mission-timer');
    if (t) t.textContent = title;
    if (o) o.textContent = obj;
    if (tm) {
      if (timerText) {
        tm.textContent = timerText;
        tm.classList.remove('hidden');
        tm.classList.toggle('urgent', !!urgent);
      } else {
        tm.classList.add('hidden');
      }
    }
  }

  toast(text, seconds) {
    const n = el('toast');
    if (!n) return;
    n.textContent = text;
    n.classList.remove('hidden');
    this.toastTimer = seconds || 3;
  }

  tickToast(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.hide('toast');
    }
  }

  setSpeed(mph, inCar) {
    const n = el('speed');
    if (!n) return;
    if (inCar) {
      n.textContent = Math.round(Math.abs(mph)) + ' mph';
      n.classList.remove('hidden');
    } else {
      n.classList.add('hidden');
    }
  }

  setCrosshair(show) {
    const n = el('crosshair');
    if (n) n.classList.toggle('hidden', !show);
  }

  setVignette(amount) {
    const n = el('vignette');
    if (n) n.style.opacity = String(Math.max(0, Math.min(1, amount)));
  }

  setHint(text) {
    const n = el('hint');
    if (n) n.textContent = text;
  }

  setEdgeArrow(text) {
    const n = el('edge-arrow');
    if (!n) return;
    if (text) {
      n.textContent = text;
      n.classList.remove('hidden');
    } else {
      n.classList.add('hidden');
    }
  }

  // Local-zoom minimap: a 130 m window centered on the player, drawn on
  // a 220 px circle. Roads are thick lines, the player is a big arrow,
  // traffic is dots, the mission marker is a gold diamond.
  drawMinimap(t, px, pz, heading, traffic, marker, heliOn) {
    if (!this.mm) return;
    // Throttle on WALL time, not game time: headless renders at ~1 fps,
    // so a game-time throttle can starve the minimap to zero draws
    // before a screenshot freezes the world.
    const now = performance.now();
    if (now - this.lastMapWall < 120) return;
    this.lastMapWall = now;
    const c = this.mm;
    const S = 220;
    const R = S / 2;
    const view = 130; // metres across the whole circle
    const scale = S / view;
    const toMap = (x, z) => [R + (x - px) * scale, R + (z - pz) * scale];
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath();
    c.arc(R, R, R - 1, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = '#241d33';
    c.fillRect(0, 0, S, S);
    // Roads in view.
    c.strokeStyle = '#5a5268';
    c.lineWidth = 7;
    for (const r of ROADS) {
      const [x1, y1] = toMap(r, pz - view / 2);
      const [x2, y2] = toMap(r, pz + view / 2);
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      const [x3, y3] = toMap(px - view / 2, r);
      const [x4, y4] = toMap(px + view / 2, r);
      c.beginPath(); c.moveTo(x3, y3); c.lineTo(x4, y4); c.stroke();
    }
    // Buildings in view: small dark blocks between roads.
    c.fillStyle = '#3a2f4a';
    for (let i = 0; i < CITY.blocks; i += 1) {
      for (let j = 0; j < CITY.blocks; j += 1) {
        const bx = -CITY.half + i * CITY.pitch + CITY.pitch / 2;
        const bz = -CITY.half + j * CITY.pitch + CITY.pitch / 2;
        const [mx, my] = toMap(bx, bz);
        if (mx < -20 || mx > S + 20 || my < -20 || my > S + 20) continue;
        const w = (CITY.pitch - CITY.roadWidth) * scale;
        c.fillRect(mx - w / 2, my - w / 2, w, w);
      }
    }
    // Traffic dots.
    c.fillStyle = '#ffd23e';
    for (const car of traffic) {
      const [mx, my] = toMap(car.x, car.z);
      if (mx < 0 || mx > S || my < 0 || my > S) continue;
      c.beginPath(); c.arc(mx, my, 3, 0, Math.PI * 2); c.fill();
    }
    // Mission marker: gold diamond + ring.
    if (marker) {
      const [mx, my] = toMap(marker.x, marker.z);
      if (mx >= 0 && mx <= S && my >= 0 && my <= S) {
        c.fillStyle = '#ffc861';
        c.beginPath();
        c.moveTo(mx, my - 9); c.lineTo(mx + 7, my); c.lineTo(mx, my + 9); c.lineTo(mx - 7, my);
        c.closePath(); c.fill();
        c.strokeStyle = '#ffc861';
        c.lineWidth = 2;
        c.beginPath(); c.arc(mx, my, 13, 0, Math.PI * 2); c.stroke();
      } else {
        // Off-screen: gold arrow on the rim pointing at it.
        const ang = Math.atan2(my - R, mx - R);
        const ax = R + Math.cos(ang) * (R - 14);
        const ay = R + Math.sin(ang) * (R - 14);
        c.fillStyle = '#ffc861';
        c.save();
        c.translate(ax, ay);
        c.rotate(ang + Math.PI / 2);
        c.beginPath(); c.moveTo(0, -8); c.lineTo(6, 6); c.lineTo(-6, 6); c.closePath(); c.fill();
        c.restore();
      }
    }
    // Helicopter blip.
    if (heliOn) {
      c.fillStyle = '#ff4a4a';
      c.beginPath(); c.arc(R, R - 34, 4, 0, Math.PI * 2); c.fill();
    }
    // Player arrow, big and centered.
    c.save();
    c.translate(R, R);
    c.rotate(Math.PI - heading);
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#111111';
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 8); c.lineTo(0, 4); c.lineTo(-8, 8); c.closePath();
    c.fill(); c.stroke();
    c.restore();
    c.restore();
    // Rim.
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.lineWidth = 2;
    c.beginPath(); c.arc(R, R, R - 1, 0, Math.PI * 2); c.stroke();
  }
}
