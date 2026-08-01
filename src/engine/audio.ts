export interface AudioLevels {
  bass: number;
  mid: number;
  treble: number;
  level: number;
}

// Web-Audio FFT tap. Feeds normalised frequency-band levels to the renderer so
// the rain can pulse to a microphone or a loaded music file. All client-side.
export class AudioReactive {
  private ctx?: AudioContext;
  private analyser?: AnalyserNode;
  private data?: Uint8Array<ArrayBuffer>;
  private audioEl?: HTMLAudioElement;
  private stream?: MediaStream;
  active = false;
  source: "none" | "mic" | "file" = "none";

  private ensure() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.82;
    this.data = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
  }

  async enableMic() {
    this.ensure();
    this.reset();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.ctx!.createMediaStreamSource(this.stream).connect(this.analyser!);
    await this.ctx!.resume();
    this.active = true;
    this.source = "mic";
  }

  // Play a user-picked audio file and analyse it (also routed to the speakers).
  async enableFile(file: File) {
    this.ensure();
    this.reset();
    this.audioEl = new Audio(URL.createObjectURL(file));
    this.audioEl.loop = true;
    const src = this.ctx!.createMediaElementSource(this.audioEl);
    src.connect(this.analyser!);
    this.analyser!.connect(this.ctx!.destination); // so it's audible
    await this.ctx!.resume();
    await this.audioEl.play();
    this.active = true;
    this.source = "file";
  }

  disable() {
    this.reset();
    this.active = false;
    this.source = "none";
  }

  private reset() {
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl = undefined;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = undefined;
    }
    try {
      this.analyser?.disconnect();
    } catch {
      /* no-op */
    }
  }

  levels(): AudioLevels | null {
    if (!this.active || !this.analyser || !this.data) return null;
    this.analyser.getByteFrequencyData(this.data);
    const n = this.data.length;
    const band = (a: number, b: number) => {
      let s = 0;
      for (let i = a; i < b; i++) s += this.data![i];
      return s / Math.max(1, (b - a) * 255);
    };
    const bass = band(1, Math.floor(n * 0.08));
    const mid = band(Math.floor(n * 0.08), Math.floor(n * 0.35));
    const treble = band(Math.floor(n * 0.35), Math.floor(n * 0.8));
    const level = Math.min(1, (bass * 1.3 + mid + treble * 0.7) / 3);
    return { bass, mid, treble, level };
  }
}
