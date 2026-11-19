// NEON HARBOR — six story jobs for Mama Lou plus repeatable courier
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
    if (def.type === 'drops' || def.type === 'courier') return snapToRoad(...def.targets[stage]);
    if (def.type === 'score') {
      return stage === 0 ? snapToRoad(...def.bank) : snapToRoad(...def.hideout);
    }
    if (def.type === 'tail') return { x: 0, z: 0 };
    return snapToRoad(...def.target);
  }

  function restoreTail(job) {
    const t = job && job.targetCar;
    if (!t) return;
    t.isTail = false;
    if (t.origColor !== undefined) t.mesh.userData.bodyMat.color.setHex(t.origColor);
  }

  function startJob(def) {
    const job = {
      def,
      stage: 0,
      timer: def.time ?? null,
      holdT: 0,
      tailT: 0,
      loseT: 0,
      target: targetOf(def, 0),
      targetCar: null,
    };
    if (def.startWanted) G.setWanted(def.startWanted);
    if (def.type === 'tail') {
      // Pick a moving traffic car, repaint it gold: that is the target.
      const c = G.traffic.cars.find((t) => Math.abs(t.speed) > 2) || G.traffic.cars[0];
      if (c) {
        c.origColor = c.mesh.userData.bodyMat.color.getHex();
        c.mesh.userData.bodyMat.color.setHex(0xe0a83c);
        c.isTail = true;
        job.targetCar = c;
        job.target = { x: c.x, z: c.z };
      }
    }
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
    // Multi-stop courier: 2–3 drops across town, one clock.
    const stops = 2 + Math.floor(rng() * 2);
    const targets = [];
    for (let i = 0; i < stops; i++) {
      const p = randomRoadPoint(rng);
      targets.push([p.x, p.z]);
    }
    const def = { ...COURIER, targets, time: 150 };
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
    restoreTail(job);
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
    restoreTail(job);
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
    if (def.type === 'tail') {
      // Follow the gold car: stay within 30 m for 20 s total; lose
      // sight of it (over 45 m) for 8 s and the job fails.
      const t = job.targetCar;
      if (!t) {
        fail('The target is gone.');
        return;
      }
      job.target = { x: t.x, z: t.z };
      moveMarker(job.target);
      const d = dist2(p.x, p.z, t.x, t.z);
      if (d < 30) {
        job.tailT += dt;
        job.loseT = 0;
      } else {
        job.loseT += dt;
        if (job.loseT > 8) {
          fail('You lost the target.');
          return;
        }
      }
      if (job.tailT >= 20) complete();
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
      if ((def.type === 'drops' || def.type === 'courier') && job.stage < def.targets.length - 1) {
        job.stage++;
        job.target = targetOf(def, job.stage);
        moveMarker(job.target);
        G.hud.toast(`Stop ${job.stage} of ${def.targets.length} done — next marker.`);
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
    if (def.type === 'courier') text = `Stop ${job.stage + 1} of ${def.targets.length} — reach the gold marker.`;
    if (def.type === 'tail') text = `Tail the gold car — stay within 30 m (${Math.floor(job.tailT)}/20 s).`;
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
