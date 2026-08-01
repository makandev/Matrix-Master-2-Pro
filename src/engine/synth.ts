// Original generative "dark cyberpunk" music, synthesised live in Web Audio.
// No files, no licensing risk. Its master output is fed to the analyser so the
// rain reacts to the music the engine itself makes.

export type MoodId = "construct" | "cyberstorm" | "ghost" | "redalert";

interface Mood {
  id: MoodId;
  name: string;
  bpm: number;
  root: number; // root frequency (Hz)
  scale: number[]; // semitone offsets (dark modes)
  droneType: OscillatorType;
  droneGain: number;
  filterBase: number;
  kickGain: number;
  hatGain: number;
  arpGain: number;
  arpDensity: number; // 0..1 chance an arp step fires
}

export const MOODS: Record<MoodId, Mood> = {
  construct: {
    id: "construct", name: "Deep Construct", bpm: 82, root: 55, // A1
    scale: [0, 2, 3, 5, 7, 8, 10], // aeolian (natural minor)
    droneType: "sawtooth", droneGain: 0.18, filterBase: 240,
    kickGain: 0.0, hatGain: 0.05, arpGain: 0.16, arpDensity: 0.4,
  },
  cyberstorm: {
    id: "cyberstorm", name: "Cyber Storm", bpm: 132, root: 49, // G1
    scale: [0, 1, 3, 5, 6, 8, 10], // locrian-ish, tense
    droneType: "sawtooth", droneGain: 0.14, filterBase: 420,
    kickGain: 0.9, hatGain: 0.18, arpGain: 0.2, arpDensity: 0.7,
  },
  ghost: {
    id: "ghost", name: "Ghost Signal", bpm: 70, root: 65.4, // C2
    scale: [0, 3, 5, 7, 10], // minor pentatonic, eerie
    droneType: "triangle", droneGain: 0.2, filterBase: 320,
    kickGain: 0.0, hatGain: 0.03, arpGain: 0.14, arpDensity: 0.3,
  },
  redalert: {
    id: "redalert", name: "Red Alert", bpm: 108, root: 58.3, // A#1
    scale: [0, 1, 4, 5, 7, 8, 11], // harmonic-minor tension
    droneType: "square", droneGain: 0.12, filterBase: 380,
    kickGain: 0.7, hatGain: 0.12, arpGain: 0.22, arpDensity: 0.6,
  },
};

export class GenerativeSynth {
  private master: GainNode;
  private noiseBuf: AudioBuffer;
  private mood: Mood = MOODS.construct;
  private timer = 0;
  private step = 0;
  private nextTime = 0;
  private drone: OscillatorNode[] = [];
  private droneNodes: AudioNode[] = [];
  running = false;

  constructor(private ctx: AudioContext, output: AudioNode) {
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(output);

    // one second of white noise reused for hats/textures
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  start(moodId: MoodId) {
    this.mood = MOODS[moodId];
    if (this.running) {
      this.rebuildDrone();
      return;
    }
    this.running = true;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.linearRampToValueAtTime(0.7, t + 2.5); // slow fade-in
    this.rebuildDrone();
    this.nextTime = t + 0.1;
    this.step = 0;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  setMood(moodId: MoodId) {
    this.mood = MOODS[moodId];
    if (this.running) this.rebuildDrone();
  }

  stop() {
    this.running = false;
    clearInterval(this.timer);
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + 0.6);
    this.teardownDrone();
  }

  // ---- evolving drone bed ----
  private rebuildDrone() {
    this.teardownDrone();
    const m = this.mood;
    const g = this.ctx.createGain();
    g.gain.value = m.droneGain;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = m.filterBase;
    lp.Q.value = 6;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoAmt = this.ctx.createGain();
    lfoAmt.gain.value = m.filterBase * 0.7;
    lfo.connect(lfoAmt);
    lfoAmt.connect(lp.frequency);
    lfo.start();
    const freqs = [m.root, m.root * 1.5, m.root * 2.01, m.root * 3.0];
    this.drone = freqs.map((f) => {
      const o = this.ctx.createOscillator();
      o.type = m.droneType;
      o.frequency.value = f;
      o.connect(lp);
      o.start();
      return o;
    });
    lp.connect(g);
    g.connect(this.master);
    this.droneNodes = [g, lp, lfo, lfoAmt];
  }

  private teardownDrone() {
    this.drone.forEach((o) => { try { o.stop(); o.disconnect(); } catch { /* */ } });
    this.drone = [];
    this.droneNodes.forEach((n) => { try { (n as OscillatorNode).stop?.(); } catch { /* */ } try { n.disconnect(); } catch { /* */ } });
    this.droneNodes = [];
  }

  // ---- step sequencer (lookahead scheduling) ----
  private schedule() {
    const stepDur = 60 / this.mood.bpm / 4; // 16th note
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 16;
    }
  }

  private playStep(step: number, time: number) {
    const m = this.mood;
    if (m.kickGain > 0 && step % 4 === 0) this.kick(time, m.kickGain);
    if (m.hatGain > 0 && step % 2 === 1) this.hat(time, m.hatGain);
    if (m.arpGain > 0 && Math.random() < m.arpDensity) {
      const semi = m.scale[(Math.random() * m.scale.length) | 0] + (Math.random() < 0.3 ? 12 : 0);
      const f = m.root * 4 * Math.pow(2, semi / 12);
      this.pluck(time, f, m.arpGain);
    }
  }

  private kick(time: number, gain: number) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(130, time);
    o.frequency.exponentialRampToValueAtTime(45, time + 0.13);
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    o.connect(g); g.connect(this.master);
    o.start(time); o.stop(time + 0.22);
  }

  private hat(time: number, gain: number) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    s.connect(hp); hp.connect(g); g.connect(this.master);
    s.start(time); s.stop(time + 0.06);
  }

  private pluck(time: number, freq: number, gain: number) {
    const o = this.ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = freq;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = freq * 2; bp.Q.value = 4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
    o.connect(bp); bp.connect(g); g.connect(this.master);
    o.start(time); o.stop(time + 0.4);
  }
}
