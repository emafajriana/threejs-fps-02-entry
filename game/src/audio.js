// audio.js — every sound in Kestrel Foundry is synthesized with WebAudio at
// the moment it is needed: filtered noise bursts for gunfire, square blips
// for the Charge, a soft two-tone for round wins. No audio files exist.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  noise(dur, filterFreq, gain, type = 'lowpass', sweepTo = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, (dur * this.ctx.sampleRate) | 0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  tone(freq, dur, gain, type = 'square', slideTo = null, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  shot(kind) {
    if (kind === 'sniper') { this.noise(0.28, 900, 0.55, 'lowpass', 120); this.tone(120, 0.2, 0.3, 'sawtooth', 40); }
    else if (kind === 'smg') { this.noise(0.09, 2400, 0.3, 'bandpass'); }
    else if (kind === 'pistol') { this.noise(0.12, 1800, 0.34, 'lowpass', 300); }
    else { this.noise(0.16, 1400, 0.42, 'lowpass', 200); }
  }

  distantShot() { this.noise(0.14, 500, 0.13, 'lowpass', 120); }
  hit() { this.tone(1900, 0.05, 0.12, 'square'); }
  kill() { this.tone(1300, 0.07, 0.14, 'square'); this.tone(1950, 0.09, 0.12, 'square', null, 0.06); }
  hurt() { this.noise(0.1, 700, 0.25); this.tone(160, 0.12, 0.2, 'sawtooth', 90); }
  reload() { this.tone(500, 0.05, 0.1, 'square'); this.tone(340, 0.05, 0.1, 'square', null, 0.14); this.tone(620, 0.05, 0.12, 'square', null, 0.3); }
  dryFire() { this.tone(900, 0.04, 0.1, 'square'); }
  buy() { this.tone(880, 0.06, 0.12, 'sine'); this.tone(1320, 0.08, 0.12, 'sine', null, 0.06); }
  denied() { this.tone(220, 0.12, 0.14, 'square', 160); }
  plantBeep() { this.tone(1560, 0.07, 0.16, 'square'); }
  planted() { this.tone(1560, 0.07, 0.16, 'square'); this.tone(1560, 0.07, 0.16, 'square', null, 0.12); this.tone(2090, 0.12, 0.16, 'square', null, 0.24); }
  defused() { this.tone(2090, 0.08, 0.14, 'square'); this.tone(1560, 0.14, 0.14, 'square', null, 0.1); }
  explosion() { this.noise(1.4, 300, 0.9, 'lowpass', 40); this.tone(60, 1.1, 0.5, 'sine', 28); }
  roundWin() { this.tone(660, 0.12, 0.13, 'triangle'); this.tone(880, 0.18, 0.13, 'triangle', null, 0.11); }
  roundLose() { this.tone(440, 0.12, 0.13, 'triangle'); this.tone(330, 0.2, 0.13, 'triangle', null, 0.11); }
  step() { this.noise(0.05, 400, 0.05); }
}
