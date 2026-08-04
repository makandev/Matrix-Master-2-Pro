// A playable Asteroids ("Meteoriten") mini-game overlaid on the rain, green
// vector style, with procedural Web-Audio SFX. Toggled on demand; while running
// it captures the arrow/space keys (so they don't steer the rain).

interface Ship { x: number; y: number; a: number; vx: number; vy: number; alive: boolean; respawn: number; blink: number; }
interface Bullet { x: number; y: number; vx: number; vy: number; life: number; }
interface Rock { x: number; y: number; vx: number; vy: number; r: number; size: number; shape: number[]; spin: number; rot: number; }

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class AsteroidsGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private keys = { left: false, right: false, up: false, fire: false };
  private ship!: Ship;
  private bullets: Bullet[] = [];
  private rocks: Rock[] = [];
  private score = 0;
  private lives = 3;
  private over = false;
  private fireCd = 0;
  private thrustCd = 0;
  private ac?: AudioContext;
  running = false;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "game-canvas";
    document.getElementById("app")!.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    window.addEventListener("keydown", this.onKey, { capture: true });
    window.addEventListener("keyup", this.onKey, { capture: true });
    window.addEventListener("resize", () => this.resize());
  }

  toggle() { this.running ? this.stop() : this.start(); }

  start() {
    if (this.running) return;
    this.running = true;
    this.resize();
    this.canvas.classList.add("on");
    this.score = 0; this.lives = 3; this.over = false;
    this.bullets = []; this.rocks = [];
    this.ship = { x: this.w / 2, y: this.h / 2, a: -Math.PI / 2, vx: 0, vy: 0, alive: true, respawn: 0, blink: 0 };
    this.spawnWave(4);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.canvas.classList.remove("on");
    this.keys = { left: false, right: false, up: false, fire: false };
  }

  private get w() { return this.canvas.width / (window.devicePixelRatio || 1); }
  private get h() { return this.canvas.height / (window.devicePixelRatio || 1); }

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.running) return;
    const k = e.key.toLowerCase();
    const map: Record<string, keyof typeof this.keys> = {
      arrowleft: "left", a: "left", arrowright: "right", d: "right",
      arrowup: "up", w: "up", " ": "fire",
    };
    if (k === "escape") { e.preventDefault(); e.stopImmediatePropagation(); this.stop(); return; }
    if (k in map) {
      this.keys[map[k]] = e.type === "keydown";
      e.preventDefault();
      e.stopImmediatePropagation(); // don't let the rain shortcuts see it
      if (k === "enter") this.over && this.start();
    }
    if (k === "enter" && this.over) { e.preventDefault(); e.stopImmediatePropagation(); this.start(); }
  };

  private spawnWave(n: number) {
    for (let i = 0; i < n; i++) {
      const edge = Math.random() < 0.5;
      this.rocks.push(this.makeRock(edge ? 0 : this.w, rand(0, this.h), 3));
    }
  }
  private makeRock(x: number, y: number, size: number): Rock {
    const r = size * 16;
    const shape = Array.from({ length: 10 }, () => rand(0.75, 1.15));
    return { x, y, vx: rand(-40, 40) * (4 - size) * 0.4, vy: rand(-40, 40) * (4 - size) * 0.4, r, size, shape, spin: rand(-1, 1), rot: 0 };
  }

  private frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.over) this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  };

  private wrap(o: { x: number; y: number }) {
    if (o.x < 0) o.x += this.w; if (o.x > this.w) o.x -= this.w;
    if (o.y < 0) o.y += this.h; if (o.y > this.h) o.y -= this.h;
  }

  private update(dt: number) {
    const s = this.ship;
    // ship control
    if (s.alive) {
      if (this.keys.left) s.a -= 3.4 * dt;
      if (this.keys.right) s.a += 3.4 * dt;
      if (this.keys.up) {
        s.vx += Math.cos(s.a) * 220 * dt;
        s.vy += Math.sin(s.a) * 220 * dt;
        if ((this.thrustCd -= dt) <= 0) { this.sfxThrust(); this.thrustCd = 0.08; }
      }
      s.vx *= 0.99; s.vy *= 0.99;
      s.x += s.vx * dt; s.y += s.vy * dt; this.wrap(s);
      s.blink = Math.max(0, s.blink - dt);
      this.fireCd -= dt;
      if (this.keys.fire && this.fireCd <= 0) {
        this.bullets.push({ x: s.x + Math.cos(s.a) * 14, y: s.y + Math.sin(s.a) * 14, vx: Math.cos(s.a) * 460 + s.vx, vy: Math.sin(s.a) * 460 + s.vy, life: 1.1 });
        this.fireCd = 0.18; this.sfxShoot();
      }
    } else if ((s.respawn -= dt) <= 0) {
      s.x = this.w / 2; s.y = this.h / 2; s.vx = s.vy = 0; s.a = -Math.PI / 2; s.alive = true; s.blink = 2;
    }
    // bullets
    for (const b of this.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; this.wrap(b); }
    this.bullets = this.bullets.filter((b) => b.life > 0);
    // rocks
    for (const r of this.rocks) { r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.spin * dt; this.wrap(r); }
    // collisions: bullet-rock
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      for (let j = this.bullets.length - 1; j >= 0; j--) {
        const b = this.bullets[j];
        if ((b.x - r.x) ** 2 + (b.y - r.y) ** 2 < r.r * r.r) {
          this.bullets.splice(j, 1);
          this.rocks.splice(i, 1);
          this.score += (4 - r.size) * 20;
          this.sfxBoom(r.size);
          if (r.size > 1) { this.rocks.push(this.makeRock(r.x, r.y, r.size - 1), this.makeRock(r.x, r.y, r.size - 1)); }
          break;
        }
      }
    }
    // ship-rock
    if (s.alive && s.blink <= 0) {
      for (const r of this.rocks) {
        if ((s.x - r.x) ** 2 + (s.y - r.y) ** 2 < (r.r + 9) ** 2) {
          s.alive = false; s.respawn = 1.5; this.sfxBoom(3);
          if (--this.lives <= 0) { this.over = true; }
          break;
        }
      }
    }
    if (this.rocks.length === 0) this.spawnWave(4 + Math.floor(this.score / 400));
  }

  private render() {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    c.save();
    c.strokeStyle = "#22ff66"; c.fillStyle = "#22ff66"; c.lineWidth = 1.6;
    c.shadowColor = "#22ff66"; c.shadowBlur = 8;
    // rocks
    for (const r of this.rocks) {
      c.save(); c.translate(r.x, r.y); c.rotate(r.rot); c.beginPath();
      for (let k = 0; k <= r.shape.length; k++) {
        const ang = (k % r.shape.length) / r.shape.length * TAU;
        const rr = r.r * r.shape[k % r.shape.length];
        const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
        k === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
      }
      c.closePath(); c.stroke(); c.restore();
    }
    // bullets
    for (const b of this.bullets) { c.beginPath(); c.arc(b.x, b.y, 2, 0, TAU); c.fill(); }
    // ship
    const s = this.ship;
    if (s.alive && (s.blink <= 0 || Math.floor(s.blink * 10) % 2 === 0)) {
      c.save(); c.translate(s.x, s.y); c.rotate(s.a); c.beginPath();
      c.moveTo(15, 0); c.lineTo(-11, -9); c.lineTo(-6, 0); c.lineTo(-11, 9); c.closePath(); c.stroke();
      if (this.keys.up) { c.beginPath(); c.moveTo(-6, -4); c.lineTo(-15, 0); c.lineTo(-6, 4); c.stroke(); }
      c.restore();
    }
    // HUD
    c.shadowBlur = 0; c.font = "bold 20px 'Cascadia Code', monospace"; c.fillStyle = "#eafff2";
    c.fillText("SCORE " + this.score, 24, 36);
    c.fillText("◄ " .repeat(Math.max(0, this.lives)), 24, 62);
    c.font = "13px 'Cascadia Code', monospace"; c.fillStyle = "rgba(180,220,190,0.6)";
    c.fillText("← → drehen · ↑ Schub · Leertaste feuern · Esc beenden", 24, this.h - 22);
    if (this.over) {
      c.textAlign = "center"; c.fillStyle = "#22ff66"; c.font = "bold 54px 'Cascadia Code', monospace";
      c.fillText("GAME OVER", this.w / 2, this.h / 2 - 10);
      c.fillStyle = "#eafff2"; c.font = "20px 'Cascadia Code', monospace";
      c.fillText("Score " + this.score + " · Enter = nochmal · Esc = zurück", this.w / 2, this.h / 2 + 34);
      c.textAlign = "left";
    }
    c.restore();
  }

  // ---- procedural SFX ----
  private audio() { return (this.ac ??= new AudioContext()); }
  private blip(freq: number, dur: number, type: OscillatorType, gain: number) {
    const ac = this.audio(); const t = ac.currentTime;
    const o = ac.createOscillator(); const g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.4), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur);
  }
  private sfxShoot() { this.blip(880, 0.12, "square", 0.08); }
  private sfxThrust() { this.blip(90, 0.09, "sawtooth", 0.05); }
  private sfxBoom(size: number) {
    const ac = this.audio(); const t = ac.currentTime; const dur = 0.25 + size * 0.08;
    const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ac.createBufferSource(); src.buffer = buf;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 300 + size * 300;
    const g = ac.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(lp); lp.connect(g); g.connect(ac.destination); src.start(t); src.stop(t + dur);
  }
}
