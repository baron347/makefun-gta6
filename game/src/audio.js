// NEON HARBOR — all sound is synthesized with WebAudio. No audio files,
// no network: an engine hum, a police siren, gunshots, crash thuds, UI
// blips, mission jingles and a bassline loop with TWO patterns that
// alternates every 8 bars. Wanted level drives the intensity: the music
// gets faster and louder and a siren layer fades in. Everything is a
// no-op until init() runs from a user gesture (the Start button).

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.musicGain = null;
    this.sirenGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.wanted = 0;
    this.bar = 0;
    this.step = 0;
    this.nextNoteT = 0;
    this.pattern = 0;
    // Two bassline patterns (MIDI notes), 16 steps each. Pattern B is
    // busier and a touch darker — it takes over when the heat is on.
    this.patterns = [
      [40, 0, 40, 0, 43, 0, 40, 0, 45, 0, 43, 0, 40, 0, 38, 0],
      [40, 40, 0, 43, 0, 45, 43, 0, 40, 0, 38, 38, 0, 43, 45, 47],
    ];
    this.bassFilter = null;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.22;
    this.bassFilter = this.ctx.createBiquadFilter();
    this.bassFilter.type = 'lowpass';
    this.bassFilter.frequency.value = 500;
    this.bassFilter.connect(this.musicGain);
    this.musicGain.connect(this.master);
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenGain.connect(this.master);
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.master);
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engFilter = this.ctx.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.frequency.value = 300;
    this.engineOsc.connect(engFilter);
    engFilter.connect(this.engineGain);
    this.engineOsc.start();
    this.nextNoteT = this.ctx.currentTime + 0.1;
    this.startSiren();
  }

  midi(n) {
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  setWanted(w) {
    this.wanted = w;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Intensity: music louder + brighter, siren fades in from 1 star.
    this.musicGain.gain.setTargetAtTime(0.22 + w * 0.045, t, 0.4);
    this.bassFilter.frequency.setTargetAtTime(500 + w * 320, t, 0.4);
    this.sirenGain.gain.setTargetAtTime(w >= 1 ? 0.05 + w * 0.02 : 0, t, 0.5);
  }

  setEngine(running, speedNorm) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(running ? 0.05 + speedNorm * 0.07 : 0, t, 0.15);
    this.engineOsc.frequency.setTargetAtTime(55 + speedNorm * 90, t, 0.1);
  }

  startSiren() {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 700;
    const lfo = this.ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 0.9;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(this.sirenGain);
    osc.start();
    lfo.start();
  }

  // One bass note. Called from update() on the scheduler.
  bassNote(midiNote, dur) {
    if (!this.ctx || midiNote === 0) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = this.midi(midiNote);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.bassFilter);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  update() {
    if (!this.ctx) return;
    // Step the 16-step bassline at 132 BPM; pattern flips every 8 bars
    // and also flips to the busier pattern while wanted >= 3.
    const stepDur = 60 / 132 / 4;
    while (this.nextNoteT < this.ctx.currentTime + 0.12) {
      const pat = this.wanted >= 3 ? 1 : this.pattern;
      const note = this.patterns[pat][this.step];
      this.bassNote(note, stepDur * 0.9);
      this.step = (this.step + 1) % 16;
      if (this.step === 0) {
        this.bar += 1;
        if (this.bar % 8 === 0) this.pattern = 1 - this.pattern;
      }
      this.nextNoteT += stepDur;
    }
  }

  blip(freq = 660, dur = 0.08, vol = 0.25) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  shot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 0.14;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.5;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 900;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  // Crash: a low thud that gets LOUDER with impact speed.
  crash(strength) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const vol = Math.min(0.9, 0.25 + strength * 0.05);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.32);
    const dur = 0.2;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) * 0.7;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g2 = this.ctx.createGain();
    g2.gain.value = vol * 0.8;
    src.connect(g2); g2.connect(this.master);
    src.start(t);
  }

  jingle(win) {
    if (!this.ctx) return;
    const notes = win ? [523, 659, 784, 1047] : [392, 330, 262];
    notes.forEach((f, i) => {
      setTimeout(() => this.blip(f, 0.18, 0.3), i * 110);
    });
  }
}
