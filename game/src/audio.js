// NEON HARBOR — all sound is synthesized with WebAudio. No audio files.
// The context is created on the first user gesture (Start button) so the
// browser's autoplay rules are respected; every method is a no-op until
// then, which also keeps headless screenshot runs silent and error-free.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.musicRoots = [110, 87.31, 130.81, 98]; // Am F C G, one bar each
    this.musicSecondPattern = [220, 174.61, 261.63, 196]; // octave-up variant
    this.useSecondPattern = false;
    this.wantedLevel = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this._startEngine();
      this._startSiren();
      this._startMusic();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  setWanted(n) {
    this.wantedLevel = n;
    if (this.sirenGain) {
      this.sirenGain.gain.setTargetAtTime(
        n > 0 ? 0.045 + 0.012 * n : 0,
        this.ctx.currentTime,
        0.2,
      );
    }
  }

  // --- Continuous layers --------------------------------------------------
  _startEngine() {
    const c = this.ctx;
    this.engineOsc = c.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 50;
    this.engineFilter = c.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 500;
    this.engineGain = c.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  // speedNorm 0..1, driving true while the player is in a car.
  setEngine(speedNorm, driving) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + 0.09 * speedNorm : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(55 + 165 * speedNorm, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(400 + 1400 * speedNorm, t, 0.1);
  }

  _startSiren() {
    const c = this.ctx;
    this.sirenOsc = c.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 800;
    this.sirenLfo = c.createOscillator();
    this.sirenLfo.type = 'sine';
    this.sirenLfo.frequency.value = 0.55;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 150; // wail 650..950 Hz
    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = c.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  // --- One-shots ----------------------------------------------------------
  _noiseBuffer(seconds = 0.5) {
    const c = this.ctx;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _burst({ freq = 1200, type = 'bandpass', q = 1, dur = 0.15, vol = 0.3, slideTo = null }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuffer(dur + 0.05);
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) filter.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    filter.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  _tone({ freq = 440, type = 'sine', dur = 0.15, vol = 0.2, when = 0, slideTo = null }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  gunshot() {
    this._burst({ freq: 900, type: 'lowpass', dur: 0.18, vol: 0.5, slideTo: 150 });
    this._burst({ freq: 2500, type: 'highpass', dur: 0.06, vol: 0.25 });
  }

  thud(vol = 0.35) {
    this._burst({ freq: 220, type: 'lowpass', dur: 0.22, vol, slideTo: 60 });
  }

  crash(vol = 0.5) {
    // A hard impact: low thud plus a metallic-ish noise scrape.
    this._burst({ freq: 300, type: 'lowpass', dur: 0.35, vol, slideTo: 70 });
    this._burst({ freq: 1800, type: 'bandpass', q: 2, dur: 0.25, vol: vol * 0.5 });
  }

  blip() {
    this._tone({ freq: 880, type: 'sine', dur: 0.09, vol: 0.18, slideTo: 1320 });
  }

  click() {
    this._tone({ freq: 660, type: 'square', dur: 0.05, vol: 0.08 });
  }

  jingle() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this._tone({ freq: f, type: 'triangle', dur: 0.22, vol: 0.2, when: i * 0.11 }),
    );
  }

  failSting() {
    [392, 370, 349, 311].forEach((f, i) =>
      this._tone({ freq: f, type: 'sawtooth', dur: 0.3, vol: 0.12, when: i * 0.16 }),
    );
  }

  // --- Music: lazy bassline loop, Am-F-C-G, one bar per second ------------
  _startMusic() {
    const stepMs = 250; // 4 steps per bar
    const tick = () => {
      if (!this.ctx) return;
      const roots = this.useSecondPattern ? this.musicSecondPattern : this.musicRoots;
      const bar = Math.floor(this.musicStep / 4) % 4;
      const stepInBar = this.musicStep % 4;
      const root = roots[bar];
      // Bass on beats 0 and 2, fifth on beat 3.
      if (stepInBar === 0 || stepInBar === 2) {
        this._tone({ freq: root, type: 'triangle', dur: 0.24, vol: 0.11 });
      } else if (stepInBar === 3) {
        this._tone({ freq: root * 1.5, type: 'triangle', dur: 0.18, vol: 0.07 });
      }
      // Hat tick every step; louder and busier when the heat is on.
      const hatVol = this.wantedLevel > 0 ? 0.05 : 0.028;
      this._burst({ freq: 6000, type: 'highpass', dur: 0.03, vol: hatVol });
      if (this.wantedLevel >= 3 && stepInBar % 2 === 1) {
        this._tone({ freq: root * 2, type: 'square', dur: 0.08, vol: 0.03 });
      }
      this.musicStep++;
    };
    this.musicTimer = setInterval(tick, stepMs);
  }

  setMusicPattern(second) {
    this.useSecondPattern = second;
  }
}
