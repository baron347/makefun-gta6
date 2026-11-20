// NEON HARBOR — six story jobs for Mama Lou plus repeatable courier
// runs. The marker is a gold beam + spinning diamond + ground ring;
// reaching it (or losing the heat, tailing the gold car, or grabbing the
// loot) pays out and autosaves. Timers fail the job; N starts the next
// one. The game object owns money / wanted / toasts; this module only
// owns job state.

import { MISSIONS, COURIER, snapToRoad, dist2 } from './config.js';
import { Car } from './vehicles.js';

const T = window.THREE;

const TAIL_RANGE = 26;
const TAIL_LOSE = 48;
const TAIL_HOLD = 20;
const TAIL_FAIL = 8;

function makeMarker() {
  const g = new T.Group();
  const beam = new T.Mesh(
    new T.CylinderGeometry(1.1, 1.1, 42, 12, 1, true),
    new T.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 21;
  const diamond = new T.Mesh(
    new T.OctahedronGeometry(1.5),
    new T.MeshBasicMaterial({ color: 0xffd23e }),
  );
  diamond.position.y = 7;
  const ring = new T.Mesh(
    new T.RingGeometry(2.2, 3.0, 32),
    new T.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0.85, side: T.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  g.add(beam); g.add(diamond); g.add(ring);
  g.userData.diamond = diamond;
  g.userData.ring = ring;
  g.visible = false;
  return g;
}

export class Missions {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.index = 0;
    this.completed = 0;
    this.active = null;
    this.marker = makeMarker();
    this.scene.add(this.marker);
    this.tailCar = null;
  }

  startNext() {
    if (this.active) return false;
    const def = this.index < MISSIONS.length ? MISSIONS[this.index] : COURIER;
    this.start(def);
    return true;
  }

  start(def) {
    const g = this.game;
    const j = {
      def,
      timer: def.time || 0,
      stopIdx: 0,
      tailT: 0,
      loseT: 0,
      grabT: 0,
      stage: 'go',
      targetCar: null,
      pos: null,
    };
    if (def.type === 'pickup' || def.type === 'delivery') {
      j.pos = snapToRoad(def.target[0], def.target[1]);
    } else if (def.type === 'drops' || def.type === 'courier') {
      j.pos = snapToRoad(def.targets[0][0], def.targets[0][1]);
    } else if (def.type === 'score') {
      j.pos = snapToRoad(def.bank[0], def.bank[1]);
    } else if (def.type === 'tail') {
      // The gold target car cruises the grid ahead of the player.
      const car = new Car('sport', 0xffd23e);
      const px = g.player.x;
      const pz = g.player.z;
      car.place(px + 30, pz + 10, Math.PI / 2);
      car.speed = 11;
      this.scene.add(car.mesh);
      this.tailCar = car;
      j.targetCar = car;
      j.pos = { x: car.x, z: car.z };
    }
    if (def.startWanted) g.setWanted(def.startWanted, true);
    this.active = j;
    this.showMarker();
    g.hud.setMission(def.title, def.intro, j.timer > 0 ? this.fmtTime(j.timer) : '', false);
    g.hud.toast(def.title + ' — ' + def.intro, 4);
    g.audio.blip(660, 0.12, 0.3);
    return j;
  }

  fmtTime(s) {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return m + ':' + String(r).padStart(2, '0');
  }

  markerPos() {
    if (!this.active) return null;
    if (this.active.def.type === 'tail' && this.active.targetCar) {
      return { x: this.active.targetCar.x, z: this.active.targetCar.z };
    }
    return this.active.pos;
  }

  showMarker() {
    const p = this.markerPos();
    if (!p) { this.marker.visible = false; return; }
    this.marker.position.set(p.x, 0, p.z);
    this.marker.visible = true;
  }

  hideMarker() {
    this.marker.visible = false;
  }

  advanceStop() {
    const j = this.active;
    const def = j.def;
    j.stopIdx += 1;
    if (j.stopIdx >= def.targets.length) {
      this.complete();
      return;
    }
    j.pos = snapToRoad(def.targets[j.stopIdx][0], def.targets[j.stopIdx][1]);
    this.showMarker();
    this.game.hud.toast('Drop ' + (j.stopIdx + 1) + ' of ' + def.targets.length, 2.5);
  }

  complete() {
    const j = this.active;
    const g = this.game;
    g.money += j.def.reward;
    this.completed += 1;
    this.index += 1;
    this.clearTailCar();
    this.active = null;
    this.hideMarker();
    g.hud.setCash(g.money);
    g.hud.setMission('NEON HARBOR', 'Press N to start the next job.', '', false);
    g.hud.toast('Job complete! +$' + j.def.reward, 4);
    g.audio.jingle(true);
    g.save();
  }

  fail(reason) {
    const j = this.active;
    const g = this.game;
    this.clearTailCar();
    this.active = null;
    this.hideMarker();
    g.hud.setMission('NEON HARBOR', 'Press N to start the next job.', '', false);
    g.hud.toast('Job failed — ' + reason, 4);
    g.audio.jingle(false);
  }

  clearTailCar() {
    if (this.tailCar) {
      this.scene.remove(this.tailCar.mesh);
      this.tailCar = null;
    }
  }

  // Called every frame while a job is active. px/pz = player position,
  // inCar, eHeld = the E key is down this frame.
  update(dt, px, pz, inCar, eHeld) {
    const j = this.active;
    if (!j) return;
    const g = this.game;
    // Marker animation.
    if (this.marker.visible) {
      this.marker.userData.diamond.rotation.y += dt * 2.5;
      this.marker.userData.diamond.position.y = 7 + Math.sin(performance.now() / 350) * 0.6;
    }
    if (j.timer > 0) {
      j.timer -= dt;
      if (j.timer <= 0) {
        this.fail('out of time');
        return;
      }
      g.hud.setMission(j.def.title, j.def.intro, this.fmtTime(j.timer), j.timer < 30);
    }
    const d = this.markerPos() ? dist2(px, pz, this.markerPos().x, this.markerPos().z) : 9999;

    if (j.def.type === 'tail') {
      const car = j.targetCar;
      // Gold car cruises the grid: straight, turn at intersections.
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      if (Math.abs(car.x) > 280 || Math.abs(car.z) > 280) car.heading += Math.PI;
      if (Math.random() < 0.4 * dt) car.heading += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
      car.sync();
      j.pos = { x: car.x, z: car.z };
      this.showMarker();
      const dd = dist2(px, pz, car.x, car.z);
      if (dd < TAIL_RANGE) {
        j.tailT += dt;
        j.loseT = 0;
      } else if (dd > TAIL_LOSE) {
        j.loseT += dt;
        if (j.loseT > TAIL_FAIL) { this.fail('lost the target'); return; }
      }
      g.hud.setMission(j.def.title, 'Stay within ' + TAIL_RANGE + ' m — ' + Math.floor(j.tailT) + 's / ' + TAIL_HOLD + 's', j.timer > 0 ? this.fmtTime(j.timer) : '', false);
      if (j.tailT >= TAIL_HOLD) { this.complete(); return; }
      return;
    }

    if (j.def.type === 'heat') {
      if (g.wanted === 0) { this.complete(); return; }
      g.hud.setMission(j.def.title, 'Lose the cops — wanted ' + g.wanted + '★', '', false);
      return;
    }

    if (j.def.type === 'score') {
      if (j.stage === 'go') {
        if (d < 7) {
          if (eHeld) {
            j.grabT += dt;
            g.hud.setMission(j.def.title, 'Grabbing the loot… ' + Math.ceil(4 - j.grabT) + 's (hold E)', '', false);
            if (j.grabT >= 4) {
              j.stage = 'escape';
              j.pos = snapToRoad(j.def.hideout[0], j.def.hideout[1]);
              this.showMarker();
              g.setWanted(3, true);
              g.hud.toast('Loot grabbed! Reach the hideout.', 3);
            }
          } else {
            g.hud.setMission(j.def.title, 'Hold E at the bank to grab the loot.', '', false);
          }
        }
        return;
      }
      if (d < 7) { this.complete(); return; }
      return;
    }

    // pickup / delivery / drops / courier: reach the marker.
    if (d < 7) {
      if (j.def.type === 'drops' || j.def.type === 'courier') this.advanceStop();
      else this.complete();
    }
  }
}
