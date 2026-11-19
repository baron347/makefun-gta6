// NEON HARBOR — all sound is synthesized with WebAudio. No audio files,
// no network: engine hum, police siren, gunshots, UI blips, mission
// jingles and a lazy bassline loop. Everything is a no-op until init()
// runs from a user gesture (the Start button).

export function createAudio() {
  const A = {
    ctx: null,
    master: null,
    muted: false,
    musicOn: false,
    engineOsc: null,
    engineGain: null,
    engineFilter: null,
    sirenOsc: null,
    sirenGain: null,
    sirenOn: false,
    musicTimer: null,
    musicStep: 0,
    nextNoteAt: 0,
    intensity: 0, // wanted level 0–5: drives music density + siren volume.
  };

  // Bassline roots: Am – F – C – G, one bar per second. Pattern B
  // (Am – G – F – E) runs every fourth bar so the loop does not drone.
  const ROOTS = [110.0, 87.31, 130.81, 98.0];
  const ROOTS_B = [110.0, 98.0, 87.31, 82.41];
  const JINGLE = [523.25, 659.25, 783.99, 1046.5];

  function ensure() {
    if (A.ctx) return true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      A.ctx = new Ctx();
      A.master = A.ctx.createGain();
      A.master.gain.value = A.muted ? 0 : 0.5;
      A.master.connect(A.ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds = 0.5) {
    const len = Math.max(1, Math.floor(A.ctx.sampleRate * seconds));
    const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = null) {
    if (!A.ctx) return;
    const t0 = A.ctx.currentTime + when;
    const osc = A.ctx.createOscillator();
    const g = A.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(A.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, vol, filterFreq, type = 'lowpass', when = 0) {
    if (!A.ctx) return;
    const t0 = A.ctx.currentTime + when;
    const src = A.ctx.createBufferSource();
    src.buffer = noiseBuffer(dur + 0.05);
    const f = A.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(A.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // Called from the Start button (a real user gesture).
  function init() {
    if (!ensure()) return;
    if (A.ctx.state === 'suspended') A.ctx.resume().catch(() => {});
    // Engine: a sawtooth through a lowpass whose pitch follows speed.
    A.engineOsc = A.ctx.createOscillator();
    A.engineOsc.type = 'sawtooth';
    A.engineOsc.frequency.value = 55;
    A.engineFilter = A.ctx.createBiquadFilter();
    A.engineFilter.type = 'lowpass';
    A.engineFilter.frequency.value = 320;
    A.engineGain = A.ctx.createGain();
    A.engineGain.gain.value = 0;
    A.engineOsc.connect(A.engineFilter);
    A.engineFilter.connect(A.engineGain);
    A.engineGain.connect(A.master);
    A.engineOsc.start();
    // Siren: a triangle that wails between two pitches.
    A.sirenOsc = A.ctx.createOscillator();
    A.sirenOsc.type = 'triangle';
    A.sirenOsc.frequency.value = 750;
    A.sirenGain = A.ctx.createGain();
    A.sirenGain.gain.value = 0;
    A.sirenOsc.connect(A.sirenGain);
    A.sirenGain.connect(A.master);
    A.sirenOsc.start();
    startMusic();
  }

  function startMusic() {
    if (A.musicTimer || !A.ctx) return;
    A.musicOn = true;
    A.musicStep = 0;
    A.nextNoteAt = A.ctx.currentTime + 0.1;
    A.musicTimer = setInterval(() => {
      if (!A.ctx || A.ctx.state !== 'running') return;
      while (A.nextNoteAt < A.ctx.currentTime + 0.25) {
        const bar = Math.floor(A.musicStep / 4);
        const roots = bar % 4 === 3 ? ROOTS_B : ROOTS;
        const root = roots[bar % ROOTS.length];
        const beat = A.musicStep % 4;
        const when = Math.max(0, A.nextNoteAt - A.ctx.currentTime);
        // Bass note on the beat.
        tone(root, 0.9, 'triangle', 0.16, when);
        // A soft hat tick on the off-beat.
        if (beat % 2 === 1) noiseBurst(0.05, 0.05, 6000, 'highpass', when);
        // A fifth above the root on bar starts, for a little colour.
        if (beat === 0) tone(root * 1.5, 0.5, 'sine', 0.05, when);
        // High heat: double-time bass + a hat on every beat.
        if (A.intensity >= 3) {
          tone(root * 2, 0.3, 'triangle', 0.06, when + 0.5);
          if (beat % 2 === 0) noiseBurst(0.05, 0.06, 6000, 'highpass', when);
        }
        A.musicStep++;
        A.nextNoteAt += 1;
      }
    }, 120);
  }

  function setMuted(m) {
    A.muted = m;
    if (A.master && A.ctx) A.master.gain.setValueAtTime(m ? 0 : 0.5, A.ctx.currentTime);
  }

  // speed01: 0 = idling/stopped, 1 = top speed.
  function engine(speed01, driving) {
    if (!A.ctx || !A.engineOsc) return;
    const t = A.ctx.currentTime;
    const target = driving ? 0.045 + speed01 * 0.05 : 0;
    A.engineGain.gain.setTargetAtTime(target, t, 0.08);
    A.engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, t, 0.08);
    A.engineFilter.frequency.setTargetAtTime(300 + speed01 * 900, t, 0.08);
  }

  function siren(on, dt) {
    if (!A.ctx || !A.sirenOsc) return;
    A.sirenOn = on;
    const t = A.ctx.currentTime;
    A.sirenGain.gain.setTargetAtTime(on ? 0.035 + A.intensity * 0.006 : 0, t, 0.1);
    if (on) {
      // Wail: sweep 650 <-> 950 Hz on a ~1.6 s cycle.
      const phase = (performance.now() / 1600) % 1;
      const f = phase < 0.5 ? 650 + (phase * 2) * 300 : 950 - ((phase - 0.5) * 2) * 300;
      A.sirenOsc.frequency.setTargetAtTime(f, t, 0.05);
    }
  }

  function gunshot() {
    noiseBurst(0.12, 0.5, 1800);
    tone(160, 0.1, 'square', 0.2, 0, 60);
  }

  function thud(strength = 1) {
    noiseBurst(0.15, Math.min(0.8, 0.35 * strength), 300);
  }

  function blip() {
    tone(880, 0.09, 'sine', 0.15);
  }

  function click() {
    tone(1200, 0.05, 'square', 0.08);
  }

  function jingle() {
    JINGLE.forEach((f, i) => tone(f, 0.28, 'triangle', 0.18, i * 0.11));
  }

  function failSting() {
    tone(220, 0.35, 'sawtooth', 0.14, 0, 175);
    tone(175, 0.5, 'sawtooth', 0.14, 0.3, 110);
  }

  function bustedSting() {
    tone(392, 0.3, 'triangle', 0.16, 0);
    tone(311, 0.3, 'triangle', 0.16, 0.3);
    tone(233, 0.6, 'triangle', 0.16, 0.6);
  }

  function setIntensity(n) {
    A.intensity = Math.max(0, Math.min(5, Math.round(n || 0)));
  }

  return { init, setMuted, setIntensity, engine, siren, gunshot, thud, blip, click, jingle, failSting, bustedSting };
}
