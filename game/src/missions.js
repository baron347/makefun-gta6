// NEON HARBOR — five story jobs for Mama Lou plus repeatable courier
// runs. The marker is a gold beam + spinning diamond + ground ring;
// reaching it (or losing the heat, or grabbing the loot) pays out and
// autosaves. Timers fail the job; N starts the next one.

import { MISSIONS, COURIER, snapToRoad, randomRoadPoint, dist2, mulberry32 } from './config.js';

export function createMissions(scene, G) {
  const rng = mulberry32(99);

  // Marker visuals: a translucent gold beam, a spinning octahedron and
  // a flat ground ring, all moved to the current target.
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffc861, transparent: true, opacity: 0.22, depthWrite: false,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true), beamMat);
  beam.position.y = 30;
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.4),
    new THREE.MeshStandardMaterial({ color: 0xffc861, emissive: 0xaa7711, emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.6 }),
  );
  diamond.position.y = 8;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3, 4.2, 32),
    new THREE.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  const markerGroup = new THREE.Group();
  markerGroup.add(beam);
  markerGroup.add(diamond);
  markerGroup.add(ring);
  markerGroup.visible = false;
  scene.add(markerGroup);

  const M = {
    index: 0,
    completed: [],
    active: null,
    spinT: 0,
  };

  function targetOf(def, stage) {
    if (def.type === 'drops') return snapToRoad(...def.targets[stage]);
    if (def.type === 'score') {
      return stage === 0 ? snapToRoad(...def.bank) : snapToRoad(...def.hideout);
    }
    if (def.type === 'courier') return snapToRoad(def.tx, def.tz);
    return snapToRoad(...def.target);
  }

  function startJob(def) {
    const job = {
      def,
      stage: 0,
      timer: def.time ?? null,
      holdT: 0,
      target: targetOf(def, 0),
    };
    if (def.startWanted) G.setWanted(def.startWanted);
    M.active = job;
    markerGroup.visible = true;
    moveMarker(job.target);
    G.hud.toast(`${def.title} — ${def.intro}`);
    G.audio.blip();
  }

  function startNext() {
    if (M.active) return false;
    if (M.index < MISSIONS.length) {
      startJob(MISSIONS[M.index]);
      return true;
    }
    return startCourier();
  }

  function startCourier() {
    if (M.active) return false;
    const p = randomRoadPoint(rng);
    const def = { ...COURIER, tx: p.x, tz: p.z };
    startJob(def);
    return true;
  }

  function moveMarker(t) {
    markerGroup.position.set(t.x, 0, t.z);
  }

  function markerPos() {
    return M.active ? { x: M.active.target.x, z: M.active.target.z } : null;
  }

  function playerPos() {
    return G.playerCar ? { x: G.playerCar.x, z: G.playerCar.z } : { x: G.player.x, z: G.player.z };
  }

  function complete() {
    const job = M.active;
    if (!job) return;
    G.money += job.def.reward;
    M.completed.push(job.def.id);
    if (job.def.type !== 'courier') M.index++;
    M.active = null;
    markerGroup.visible = false;
    G.hud.toast(`Job complete — +$${job.def.reward}`);
    G.audio.jingle();
    G.saveGame();
  }

  function fail(reason) {
    const job = M.active;
    if (!job) return;
    M.active = null;
    markerGroup.visible = false;
    G.hud.toast(`${job.def.title} failed — ${reason} Press N to retry.`);
    G.audio.failSting();
  }

  function update(dt) {
    M.spinT += dt;
    diamond.rotation.y = M.spinT * 1.6;
    diamond.position.y = 8 + Math.sin(M.spinT * 2) * 0.8;
    if (!M.active) return;
    const job = M.active;
    const p = playerPos();
    if (job.timer !== null) {
      job.timer -= dt;
      if (job.timer <= 0) {
        fail('Time ran out.');
        return;
      }
    }
    const def = job.def;
    if (def.type === 'heat') {
      // Complete the moment the wanted level hits zero.
      if (G.wanted === 0) complete();
      return;
    }
    if (def.type === 'score' && job.stage === 0) {
      // Stage 1: hold E within 5 m of the bank to grab the loot.
      const d = dist2(p.x, p.z, job.target.x, job.target.z);
      if (d < 5 && (G.keys.KeyE || G.keys.eHold)) {
        job.holdT += dt;
        if (job.holdT > 1.5) {
          job.stage = 1;
          job.timer = def.time;
          job.target = targetOf(def, 1);
          moveMarker(job.target);
          G.setWanted(3);
          G.hud.toast('Loot grabbed! Lose the cops and reach the hideout.');
          G.audio.jingle();
        }
      } else {
        job.holdT = Math.max(0, job.holdT - dt);
      }
      return;
    }
    // Reach-the-marker jobs (pickup, delivery, drops, score stage 2, courier).
    const d = dist2(p.x, p.z, job.target.x, job.target.z);
    if (d < 8) {
      if (def.type === 'drops' && job.stage < def.targets.length - 1) {
        job.stage++;
        job.target = targetOf(def, job.stage);
        moveMarker(job.target);
        G.hud.toast(`Drop ${job.stage} of ${def.targets.length} done — next marker.`);
        G.audio.blip();
        return;
      }
      complete();
    }
  }

  function objectiveText() {
    if (!M.active) {
      const next = M.index < MISSIONS.length ? MISSIONS[M.index] : COURIER;
      return {
        title: M.index < MISSIONS.length ? 'Next job' : 'Courier runs',
        text: `Press N — ${next.title} ($${next.reward})`,
        timer: null,
      };
    }
    const job = M.active;
    const def = job.def;
    let text = def.intro;
    if (def.type === 'drops') text = `Drop ${job.stage + 1} of ${def.targets.length} — reach the gold marker.`;
    if (def.type === 'heat') text = 'Lose every star to finish the job.';
    if (def.type === 'score' && job.stage === 0) {
      text = 'Hold E at the bank (gold marker) to grab the loot.';
    }
    if (def.type === 'score' && job.stage === 1) text = 'Reach the hideout before the clock runs out.';
    return {
      title: `${def.title}  ·  $${def.reward}`,
      text,
      timer: job.timer,
    };
  }

  // Return the live object (not a copy): the playtests read
  // missions.index / .active / .completed straight off it.
  M.startNext = startNext;
  M.startCourier = startCourier;
  M.update = update;
  M.markerPos = markerPos;
  M.objectiveText = objectiveText;
  return M;
}
