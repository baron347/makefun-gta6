// NEON HARBOR — missions: Danny "Dash" Reyes owes Mama Lou. Five story
// jobs plus a tail job, then repeatable courier runs. A gold beam marks
// the current objective; completing a job pays cash and autosaves.

import { MISSION_DEFS, STORY_COUNT, mulberry32 } from './config.js';
import { makeCar, repaintCar } from './vehicles.js';

const THREE = window.THREE;

export class Missions {
  constructor(scene, city, game) {
    this.scene = scene;
    this.city = city;
    this.game = game;
    this.rng = mulberry32(99);
    this.index = 0; // next story mission to start
    this.completed = []; // ids of finished jobs
    this.active = null;
    this.marker = this._buildMarker();
    this.marker.visible = false;
    scene.add(this.marker);
  }

  _buildMarker() {
    const group = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffc833, transparent: true, opacity: 0.28,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    beam.position.y = 30;
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.7),
      new THREE.MeshStandardMaterial({ color: 0xffc833, emissive: 0xaa7700, emissiveIntensity: 1.2 }),
    );
    diamond.position.y = 8;
    diamond.name = 'diamond';
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3, 4.2, 32),
      new THREE.MeshBasicMaterial({ color: 0xffc833, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    group.add(beam, diamond, ring);
    group.userData.diamond = diamond;
    return group;
  }

  _snap(p) {
    const n = this.city.nearestRoad(p.x, p.z);
    return { x: n.x, z: n.z };
  }

  _playerPos() {
    const g = this.game;
    if (g.playerCar) return { x: g.playerCar.x, z: g.playerCar.z };
    return { x: g.player.x, z: g.player.z };
  }

  startNext() {
    // If a job is already running (a test or the N key jumping ahead),
    // drop it first so the new job always starts cleanly.
    if (this.active) this._cleanupJob();
    const def = this.index < STORY_COUNT
      ? MISSION_DEFS[this.index]
      : MISSION_DEFS[STORY_COUNT];
    const jobDef = { ...def };
    const job = {
      def: jobDef,
      timer: def.time !== undefined ? def.time : null,
      tailT: 0,
      loseT: 0,
      targetCar: null,
      stage: 0,
      grabT: 0,
      dropIndex: 0,
      stopIndex: 0,
    };
    if (jobDef.type === 'courier') {
      jobDef.targets = [];
      for (let i = 0; i < jobDef.stops; i++) {
        jobDef.targets.push(this._snap(this.city.randomRoadPoint(this.rng)));
      }
    } else if (jobDef.target) {
      jobDef.target = this._snap(jobDef.target);
    } else if (jobDef.targets) {
      jobDef.targets = jobDef.targets.map((t) => this._snap(t));
    }
    if (jobDef.bank) jobDef.bank = this._snap(jobDef.bank);
    if (jobDef.hideout) jobDef.hideout = this._snap(jobDef.hideout);
    if (jobDef.startWanted !== undefined) this.game.setWanted(jobDef.startWanted);
    if (jobDef.type === 'tail') {
      const start = this._snap(this.city.randomRoadPoint(this.rng));
      const car = makeCar('sedan', 0xe0a83c, start.x, start.z, 0);
      car.speed = 10;
      car.axis = 'x';
      car.dir = 1;
      car.isTarget = true;
      job.targetCar = car;
      this.scene.add(car.mesh);
    }
    this.active = job;
    this._showMarker();
    this.game.toast(`${jobDef.title} — ${jobDef.text}`);
    return true;
  }

  // Where the player has to go right now, or null.
  markerPos() {
    const j = this.active;
    if (!j) return null;
    const d = j.def;
    switch (d.type) {
      case 'reach':
      case 'timed':
        return d.target;
      case 'drops':
        return d.targets[Math.min(j.dropIndex, d.targets.length - 1)];
      case 'heat':
        return null;
      case 'tail':
        return j.targetCar ? { x: j.targetCar.x, z: j.targetCar.z } : null;
      case 'score':
        return j.stage === 0 ? d.bank : d.hideout;
      case 'courier':
        return d.targets[Math.min(j.stopIndex, d.targets.length - 1)];
      default:
        return null;
    }
  }

  _showMarker() {
    const pos = this.markerPos();
    if (!pos) {
      this.marker.visible = false;
      return;
    }
    this.marker.visible = true;
    this.marker.position.set(pos.x, 0, pos.z);
  }

  hideMarker() {
    this.marker.visible = false;
  }

  update(dt) {
    const j = this.active;
    if (!j) return;
    // Spin the diamond.
    this.marker.userData.diamond.rotation.y += dt * 2.2;
    this.marker.userData.diamond.position.y = 8 + Math.sin(performance.now() * 0.002) * 0.6;
    const pos = this._playerPos();
    const d = j.def;
    if (j.timer !== null) {
      j.timer -= dt;
      if (j.timer <= 0) {
        this._fail('Out of time');
        return;
      }
    }
    switch (d.type) {
      case 'reach':
      case 'timed': {
        if (Math.hypot(pos.x - d.target.x, pos.z - d.target.z) < 8) this._complete();
        break;
      }
      case 'drops': {
        const t = d.targets[j.dropIndex];
        if (t && Math.hypot(pos.x - t.x, pos.z - t.z) < 8) {
          j.dropIndex++;
          this.game.audio.blip();
          this.game.toast(`Case ${j.dropIndex}/${d.targets.length} collected`);
          if (j.dropIndex >= d.targets.length) this._complete();
          else this._showMarker();
        }
        break;
      }
      case 'heat': {
        if (this.game.wanted === 0) this._complete();
        break;
      }
      case 'tail': {
        this._driveTarget(dt, j.targetCar);
        const td = Math.hypot(pos.x - j.targetCar.x, pos.z - j.targetCar.z);
        if (td < d.tailDist) {
          j.tailT += dt;
          j.loseT = 0;
        } else if (td > d.loseDist) {
          j.loseT += dt;
          if (j.loseT > d.loseTime) {
            this._fail('You lost the courier');
            return;
          }
        } else {
          j.loseT = Math.max(0, j.loseT - dt);
        }
        if (j.tailT >= d.tailTime) this._complete();
        break;
      }
      case 'score': {
        if (j.stage === 0) {
          const near = Math.hypot(pos.x - d.bank.x, pos.z - d.bank.z) < 5;
          if (near && this.game.input.action) {
            j.grabT += dt;
            if (j.grabT >= 2) {
              j.stage = 1;
              j.timer = d.time;
              this.game.setWanted(d.grabWanted);
              this.game.toast('Loot grabbed! Lose the cops and reach the hideout.');
              this.game.audio.blip();
              this._showMarker();
            }
          } else {
            j.grabT = 0;
          }
        } else if (Math.hypot(pos.x - d.hideout.x, pos.z - d.hideout.z) < 8) {
          this._complete();
        }
        break;
      }
      case 'courier': {
        const t = d.targets[j.stopIndex];
        if (t && Math.hypot(pos.x - t.x, pos.z - t.z) < 8) {
          j.stopIndex++;
          this.game.audio.blip();
          this.game.toast(`Stop ${j.stopIndex}/${d.targets.length} done`);
          if (j.stopIndex >= d.targets.length) this._complete();
          else this._showMarker();
        }
        break;
      }
      default:
        break;
    }
    // Keep the marker glued to a moving target (tail job).
    if (j.def.type === 'tail' && this.marker.visible) {
      const mp = this.markerPos();
      if (mp) this.marker.position.set(mp.x, 0, mp.z);
    }
  }

  // Simple road-following driver for the tail target: cruise along its
  // axis, turn at intersections at random.
  _driveTarget(dt, car) {
    if (!car) return;
    const near = this.city.nearestRoad(car.x, car.z);
    if (near.d < 1.2 && this.rng() < 0.35) {
      const choices = near.axis === 'z'
        ? [Math.PI / 2, -Math.PI / 2, car.heading + Math.PI]
        : [0, Math.PI, car.heading + Math.PI];
      car.heading = choices[Math.floor(this.rng() * choices.length)];
      if (near.axis === 'z') car.x = near.x;
      else car.z = near.z;
    }
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    car.x += fx * car.speed * dt;
    car.z += fz * car.speed * dt;
    if (!this.city.inBounds(car.x, car.z, 3)) {
      car.heading += Math.PI;
      car.x = Math.max(-297, Math.min(297, car.x));
      car.z = Math.max(-297, Math.min(297, car.z));
    }
    this.city.resolveCircleCars(car, 2.3);
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }

  _complete() {
    const j = this.active;
    if (!j) return;
    const d = j.def;
    this.game.addCash(d.reward);
    this.game.audio.jingle();
    this.game.toast(`+$${d.reward} — ${d.title} complete!`);
    this.completed.push(d.id);
    if (this.index < STORY_COUNT) this.index++;
    this._cleanupJob();
    this.game.saveGame();
  }

  _fail(reason) {
    const j = this.active;
    if (!j) return;
    this.game.audio.failSting();
    this.game.toast(`${j.def.title} failed — ${reason}. Press N to retry.`);
    this._cleanupJob();
  }

  _cleanupJob() {
    const j = this.active;
    if (j && j.targetCar) {
      this.scene.remove(j.targetCar.mesh);
    }
    this.active = null;
    this.hideMarker();
  }
}
