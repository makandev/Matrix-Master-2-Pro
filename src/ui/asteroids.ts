// Asteroids ("Meteoriten") in the Matrix rain — with the signature twist:
// BULLET TIME (hold Shift to slow the world, like Neo). Plus a persistent
// highscore, an AGENT boss every few waves, code power-ups and a combo meter.
// Green vector style, procedural Web-Audio SFX, toggled on demand.

interface Ship { x: number; y: number; a: number; vx: number; vy: number; alive: boolean; respawn: number; blink: number; shield: number; triple: number; rapid: number; }
interface Bullet { x: number; y: number; vx: number; vy: number; life: number; }
interface Rock { x: number; y: number; vx: number; vy: number; r: number; size: number; shape: number[]; spin: number; rot: number; }
interface Boss { x: number; y: number; vx: number; vy: number; hp: number; maxHp: number; fireCd: number; flash: number; rot: number; }
type PowType = "shield" | "triple" | "rapid" | "life";
interface Powerup { x: number; y: number; vx: number; vy: number; life: number; type: PowType; }

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const BEST_KEY = "matrixng.asteroids.best";
const POW_LABEL: Record<PowType, string> = { shield: "S", triple: "T", rapid: "R", life: "♥" };

export class AsteroidsGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private keys = { left: false, right: false, up: false, fire: false, slow: false };
  private ship!: Ship;
  private bullets: Bullet[] = [];
  private enemyBullets: Bullet[] = [];
  private rocks: Rock[] = [];
  private powerups: Powerup[] = [];
  private boss: Boss | null = null;
  private wave = 0;
  private score = 0;
  private lives = 3;
  private over = false;
  private best = 0;
  private newRecord = false;
  private fireCd = 0;
  private thrustCd = 0;
  // combo
  private combo = 0;
  private comboTimer = 0;
  // bullet time
  private bt = 1; // meter 0..1
  private btActive = false;
  private ac?: AudioContext;
  private touch!: HTMLDivElement;
  private isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window || navigator.maxTouchPoints > 0;
  running = false;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "game-canvas";
    document.getElementById("app")!.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    this.best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
    window.addEventListener("keydown", this.onKey, { capture: true });
    window.addEventListener("keyup", this.onKey, { capture: true });
    window.addEventListener("resize", () => this.resize());
    this.buildTouch();
  }

  // On-screen controls for phones — drive the same key flags as the keyboard.
  private buildTouch() {
    const t = document.createElement("div");
    t.className = "game-touch";
    t.innerHTML = `
      <button class="gt-btn gt-left" aria-label="links">◀</button>
      <button class="gt-btn gt-right" aria-label="rechts">▶</button>
      <button class="gt-btn gt-thrust" aria-label="Schub">▲</button>
      <button class="gt-btn gt-fire" aria-label="feuern">✦</button>
      <button class="gt-btn gt-slow" aria-label="Zeitlupe">🕶</button>
      <button class="gt-btn gt-exit" aria-label="beenden">✕</button>`;
    document.getElementById("app")!.appendChild(t);
    this.touch = t;
    const bind = (sel: string, key: keyof typeof this.keys) => {
      const b = t.querySelector(sel) as HTMLElement;
      const on = (e: Event) => { e.preventDefault(); this.keys[key] = true; };
      const off = (e: Event) => { e.preventDefault(); this.keys[key] = false; };
      b.addEventListener("pointerdown", on);
      b.addEventListener("pointerup", off);
      b.addEventListener("pointerleave", off);
      b.addEventListener("pointercancel", off);
    };
    bind(".gt-left", "left");
    bind(".gt-right", "right");
    bind(".gt-thrust", "up");
    bind(".gt-slow", "slow");
    // Fire doubles as "restart" on the game-over screen (no Enter key on phones).
    const fire = t.querySelector(".gt-fire") as HTMLElement;
    fire.addEventListener("pointerdown", (e) => { e.preventDefault(); this.over ? this.start() : (this.keys.fire = true); });
    fire.addEventListener("pointerup", (e) => { e.preventDefault(); this.keys.fire = false; });
    fire.addEventListener("pointerleave", () => (this.keys.fire = false));
    (t.querySelector(".gt-exit") as HTMLElement).addEventListener("pointerdown", (e) => { e.preventDefault(); this.stop(); });
  }

  toggle() { this.running ? this.stop() : this.start(); }

  start() {
    if (this.running) {
      if (this.over) this.reset(); // restart from the game-over screen (loop already runs)
      return;
    }
    this.running = true;
    this.resize();
    this.canvas.classList.add("on");
    if (this.isTouch) this.touch.classList.add("on");
    document.getElementById("app")!.classList.add("gaming");
    this.reset();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private reset() {
    this.score = 0; this.lives = 3; this.over = false; this.newRecord = false;
    this.wave = 0; this.combo = 0; this.comboTimer = 0; this.bt = 1; this.btActive = false;
    this.bullets = []; this.enemyBullets = []; this.rocks = []; this.powerups = []; this.boss = null;
    this.popups = []; this.bossDefeatedFlash = 0;
    this.ship = { x: this.w / 2, y: this.h / 2, a: -Math.PI / 2, vx: 0, vy: 0, alive: true, respawn: 0, blink: 2, shield: 0, triple: 0, rapid: 0 };
    this.nextWave();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.canvas.classList.remove("on");
    this.touch.classList.remove("on");
    document.getElementById("app")!.classList.remove("gaming");
    this.keys = { left: false, right: false, up: false, fire: false, slow: false };
  }

  private get w() { return this.canvas.width / (window.devicePixelRatio > 2 ? 2 : window.devicePixelRatio || 1); }
  private get h() { return this.canvas.height / (window.devicePixelRatio > 2 ? 2 : window.devicePixelRatio || 1); }

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.running) return;
    const k = e.key.toLowerCase();
    if (k === "escape") { e.preventDefault(); e.stopImmediatePropagation(); this.stop(); return; }
    if (k === "enter" && this.over) { e.preventDefault(); e.stopImmediatePropagation(); this.start(); return; }
    const map: Record<string, keyof typeof this.keys> = {
      arrowleft: "left", a: "left", arrowright: "right", d: "right",
      arrowup: "up", w: "up", " ": "fire", shift: "slow",
    };
    if (k in map) { this.keys[map[k]] = e.type === "keydown"; e.preventDefault(); e.stopImmediatePropagation(); }
  };

  private nextWave() {
    this.wave++;
    if (this.wave % 5 === 0) { this.spawnBoss(); return; }
    const n = 3 + Math.floor(this.wave / 2);
    for (let i = 0; i < n; i++) {
      const edge = Math.random() < 0.5;
      this.rocks.push(this.makeRock(edge ? 0 : this.w, rand(0, this.h), 3));
    }
  }
  private makeRock(x: number, y: number, size: number): Rock {
    const r = size * 16;
    const shape = Array.from({ length: 10 }, () => rand(0.75, 1.15));
    const sp = (4 - size) * 0.4;
    return { x, y, vx: rand(-40, 40) * sp, vy: rand(-40, 40) * sp, r, size, shape, spin: rand(-1, 1), rot: 0 };
  }
  private spawnBoss() {
    this.boss = { x: this.w / 2, y: 90, vx: 70, vy: 0, hp: 10 + this.wave, maxHp: 10 + this.wave, fireCd: 1.5, flash: 0, rot: 0 };
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
    // bullet time meter
    this.btActive = this.keys.slow && this.bt > 0.02 && this.ship.alive;
    this.bt = Math.max(0, Math.min(1, this.bt + (this.btActive ? -dt / 3.2 : dt / 7)));
    const ts = this.btActive ? 0.38 : 1; // world time-scale
    const wdt = dt * ts;

    if (this.comboTimer > 0 && (this.comboTimer -= dt) <= 0) this.combo = 0;

    const s = this.ship;
    if (s.alive) {
      if (this.keys.left) s.a -= 3.4 * dt;   // aim stays crisp (real time)
      if (this.keys.right) s.a += 3.4 * dt;
      if (this.keys.up) {
        s.vx += Math.cos(s.a) * 220 * wdt;
        s.vy += Math.sin(s.a) * 220 * wdt;
        if ((this.thrustCd -= dt) <= 0) { this.sfxThrust(); this.thrustCd = 0.08; }
      }
      s.vx *= 0.99; s.vy *= 0.99;
      s.x += s.vx * wdt; s.y += s.vy * wdt; this.wrap(s);
      s.blink = Math.max(0, s.blink - dt);
      s.shield = Math.max(0, s.shield - dt);
      s.triple = Math.max(0, s.triple - dt);
      s.rapid = Math.max(0, s.rapid - dt);
      this.fireCd -= dt;
      if (this.keys.fire && this.fireCd <= 0) { this.shoot(); this.fireCd = s.rapid > 0 ? 0.08 : 0.18; }
    } else if ((s.respawn -= dt) <= 0) {
      s.x = this.w / 2; s.y = this.h / 2; s.vx = s.vy = 0; s.a = -Math.PI / 2; s.alive = true; s.blink = 2;
    }

    for (const b of this.bullets) { b.x += b.vx * wdt; b.y += b.vy * wdt; b.life -= wdt; this.wrap(b); }
    this.bullets = this.bullets.filter((b) => b.life > 0);
    for (const b of this.enemyBullets) { b.x += b.vx * wdt; b.y += b.vy * wdt; b.life -= wdt; this.wrap(b); }
    this.enemyBullets = this.enemyBullets.filter((b) => b.life > 0);
    for (const r of this.rocks) { r.x += r.vx * wdt; r.y += r.vy * wdt; r.rot += r.spin * wdt; this.wrap(r); }
    for (const p of this.powerups) { p.x += p.vx * wdt; p.y += p.vy * wdt; p.life -= dt; this.wrap(p); }
    this.powerups = this.powerups.filter((p) => p.life > 0);

    // bullet vs rock
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      for (let j = this.bullets.length - 1; j >= 0; j--) {
        const b = this.bullets[j];
        if ((b.x - r.x) ** 2 + (b.y - r.y) ** 2 < r.r * r.r) {
          this.bullets.splice(j, 1); this.rocks.splice(i, 1);
          this.addScore((4 - r.size) * 20, r.x, r.y);
          this.sfxBoom(r.size);
          if (r.size > 1) this.rocks.push(this.makeRock(r.x, r.y, r.size - 1), this.makeRock(r.x, r.y, r.size - 1));
          else if (Math.random() < 0.12) this.dropPowerup(r.x, r.y);
          break;
        }
      }
    }
    // bullet vs boss
    if (this.boss) {
      const bo = this.boss;
      bo.rot += wdt; bo.flash = Math.max(0, bo.flash - dt);
      bo.x += bo.vx * wdt; if (bo.x < 70 || bo.x > this.w - 70) bo.vx *= -1;
      bo.y = 90 + Math.sin(this.last / 700) * 40;
      if ((bo.fireCd -= wdt) <= 0) { this.bossFire(); bo.fireCd = 1.4; }
      for (let j = this.bullets.length - 1; j >= 0; j--) {
        const b = this.bullets[j];
        if ((b.x - bo.x) ** 2 + (b.y - bo.y) ** 2 < 46 * 46) {
          this.bullets.splice(j, 1); bo.hp--; bo.flash = 0.12; this.sfxHit();
          if (bo.hp <= 0) { this.defeatBoss(); break; }
        }
      }
    }
    // enemy bullet vs ship
    if (s.alive && s.blink <= 0 && s.shield <= 0) {
      for (let j = this.enemyBullets.length - 1; j >= 0; j--) {
        const b = this.enemyBullets[j];
        if ((b.x - s.x) ** 2 + (b.y - s.y) ** 2 < 100) { this.enemyBullets.splice(j, 1); this.hitShip(); break; }
      }
    }
    // ship vs rock
    if (s.alive && s.blink <= 0 && s.shield <= 0) {
      for (const r of this.rocks) {
        if ((s.x - r.x) ** 2 + (s.y - r.y) ** 2 < (r.r + 9) ** 2) { this.hitShip(); break; }
      }
      if (this.boss && (s.x - this.boss.x) ** 2 + (s.y - this.boss.y) ** 2 < 52 * 52) this.hitShip();
    }
    // powerup pickup
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      if ((s.x - p.x) ** 2 + (s.y - p.y) ** 2 < 400) { this.grab(p.type); this.powerups.splice(i, 1); }
    }

    if (this.rocks.length === 0 && !this.boss) this.nextWave();
  }

  private shoot() {
    const s = this.ship;
    const mk = (off: number) => this.bullets.push({
      x: s.x + Math.cos(s.a + off) * 14, y: s.y + Math.sin(s.a + off) * 14,
      vx: Math.cos(s.a + off) * 460 + s.vx, vy: Math.sin(s.a + off) * 460 + s.vy, life: 1.1,
    });
    if (s.triple > 0) { mk(-0.22); mk(0); mk(0.22); } else mk(0);
    this.sfxShoot();
  }
  private bossFire() {
    const bo = this.boss!; const s = this.ship;
    const a = Math.atan2(s.y - bo.y, s.x - bo.x);
    for (const off of [-0.18, 0, 0.18]) {
      this.enemyBullets.push({ x: bo.x, y: bo.y, vx: Math.cos(a + off) * 240, vy: Math.sin(a + off) * 240, life: 3 });
    }
    this.sfxEnemy();
  }
  private defeatBoss() {
    const bo = this.boss!;
    this.addScore(500, bo.x, bo.y);
    for (let i = 0; i < 3; i++) this.dropPowerup(bo.x + rand(-30, 30), bo.y + rand(-30, 30));
    this.boss = null;
    this.sfxBoom(3); this.sfxBoom(2);
    this.bossDefeatedFlash = 2.5;
  }
  private bossDefeatedFlash = 0;

  private hitShip() {
    const s = this.ship;
    s.alive = false; s.respawn = 1.5; this.combo = 0; this.sfxBoom(3);
    if (--this.lives <= 0) this.gameOver();
  }
  private gameOver() {
    this.over = true;
    if (this.score > this.best) { this.best = this.score; this.newRecord = true; try { localStorage.setItem(BEST_KEY, String(this.best)); } catch { /* */ } }
  }
  private addScore(base: number, x: number, y: number) {
    this.combo++; this.comboTimer = 2.5;
    const mult = Math.min(5, 1 + Math.floor(this.combo / 3));
    this.score += base * mult;
    this.popups.push({ x, y, t: 0.8, txt: mult > 1 ? `+${base * mult} x${mult}` : `+${base}` });
  }
  private popups: { x: number; y: number; t: number; txt: string }[] = [];

  private dropPowerup(x: number, y: number) {
    const types: PowType[] = ["shield", "triple", "rapid", "life"];
    const type = types[(Math.random() * types.length) | 0];
    this.powerups.push({ x, y, vx: rand(-20, 20), vy: rand(-20, 20), life: 9, type });
  }
  private grab(type: PowType) {
    const s = this.ship;
    if (type === "shield") s.shield = 6;
    else if (type === "triple") s.triple = 9;
    else if (type === "rapid") s.rapid = 9;
    else this.lives++;
    this.sfxPower();
  }

  private render() {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    // bullet-time tint
    if (this.btActive) {
      c.fillStyle = "rgba(10,40,20,0.28)"; c.fillRect(0, 0, this.w, this.h);
    }
    if (this.bossDefeatedFlash > 0) this.bossDefeatedFlash -= 0.016;
    c.save();
    c.strokeStyle = "#22ff66"; c.fillStyle = "#22ff66"; c.lineWidth = 1.6;
    c.shadowColor = "#22ff66"; c.shadowBlur = 8;

    for (const r of this.rocks) {
      c.save(); c.translate(r.x, r.y); c.rotate(r.rot); c.beginPath();
      for (let k = 0; k <= r.shape.length; k++) {
        const ang = (k % r.shape.length) / r.shape.length * TAU;
        const rr = r.r * r.shape[k % r.shape.length];
        k === 0 ? c.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr) : c.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
      }
      c.closePath(); c.stroke(); c.restore();
    }
    for (const b of this.bullets) { c.beginPath(); c.arc(b.x, b.y, 2, 0, TAU); c.fill(); }
    // enemy bullets (red)
    c.save(); c.strokeStyle = "#ff3b3b"; c.fillStyle = "#ff5555"; c.shadowColor = "#ff3b3b";
    for (const b of this.enemyBullets) { c.beginPath(); c.arc(b.x, b.y, 3, 0, TAU); c.fill(); }
    c.restore();
    // powerups
    for (const p of this.powerups) {
      c.save(); c.translate(p.x, p.y);
      c.strokeStyle = "#eafff2"; c.beginPath(); c.arc(0, 0, 12, 0, TAU); c.stroke();
      c.fillStyle = "#eafff2"; c.font = "bold 14px monospace"; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText(POW_LABEL[p.type], 0, 1); c.restore();
    }
    c.textAlign = "left"; c.textBaseline = "alphabetic";
    // boss
    if (this.boss) this.drawBoss(c, this.boss);
    // ship
    const s = this.ship;
    if (s.alive && (s.blink <= 0 || Math.floor(s.blink * 10) % 2 === 0)) {
      c.save(); c.translate(s.x, s.y); c.rotate(s.a);
      c.beginPath(); c.moveTo(15, 0); c.lineTo(-11, -9); c.lineTo(-6, 0); c.lineTo(-11, 9); c.closePath(); c.stroke();
      if (this.keys.up) { c.beginPath(); c.moveTo(-6, -4); c.lineTo(-15, 0); c.lineTo(-6, 4); c.stroke(); }
      if (s.shield > 0) { c.strokeStyle = "rgba(120,220,255,0.8)"; c.beginPath(); c.arc(0, 0, 20, 0, TAU); c.stroke(); }
      c.restore();
    }
    // score popups
    c.shadowBlur = 0; c.font = "bold 13px 'Cascadia Code', monospace"; c.textAlign = "center";
    for (const p of this.popups) { c.globalAlpha = Math.max(0, p.t); c.fillStyle = "#eafff2"; c.fillText(p.txt, p.x, p.y); p.y -= 0.6; p.t -= 0.016; }
    c.globalAlpha = 1; c.textAlign = "left";
    this.popups = this.popups.filter((p) => p.t > 0);

    this.drawHUD(c);
    c.restore();
  }

  private drawBoss(c: CanvasRenderingContext2D, bo: Boss) {
    c.save(); c.translate(bo.x, bo.y);
    const hurt = bo.flash > 0;
    c.strokeStyle = hurt ? "#ff5555" : "#39ff88"; c.shadowColor = c.strokeStyle; c.shadowBlur = 14; c.lineWidth = 2.4;
    c.save(); c.rotate(bo.rot * 0.4);
    c.beginPath();
    for (let k = 0; k <= 6; k++) { const a = (k % 6) / 6 * TAU; const rr = k % 2 ? 30 : 46; k === 0 ? c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    c.closePath(); c.stroke(); c.restore();
    // "eyes" (agent shades)
    c.fillStyle = hurt ? "#ff5555" : "#eafff2"; c.shadowBlur = 6;
    c.fillRect(-16, -6, 12, 5); c.fillRect(4, -6, 12, 5);
    c.restore();
    // hp bar
    c.save(); c.shadowBlur = 0; const bw = 160;
    c.fillStyle = "rgba(0,0,0,0.5)"; c.fillRect(this.w / 2 - bw / 2, 14, bw, 8);
    c.fillStyle = "#ff4444"; c.fillRect(this.w / 2 - bw / 2, 14, bw * (bo.hp / bo.maxHp), 8);
    c.fillStyle = "#eafff2"; c.font = "bold 12px 'Cascadia Code', monospace"; c.textAlign = "center";
    c.fillText("A G E N T", this.w / 2, 40); c.textAlign = "left"; c.restore();
  }

  private drawHUD(c: CanvasRenderingContext2D) {
    c.shadowBlur = 0;
    c.font = "bold 20px 'Cascadia Code', monospace"; c.fillStyle = "#eafff2";
    c.fillText("SCORE " + this.score, 24, 36);
    c.font = "13px 'Cascadia Code', monospace"; c.fillStyle = "rgba(180,220,190,0.75)";
    c.fillText("BEST " + this.best, 24, 56);
    c.fillStyle = "#22ff66"; c.font = "bold 20px 'Cascadia Code', monospace";
    c.fillText("♥".repeat(Math.max(0, this.lives)), 24, 82);
    const mult = Math.min(5, 1 + Math.floor(this.combo / 3));
    if (mult > 1) { c.fillStyle = "#eafff2"; c.font = "bold 22px 'Cascadia Code', monospace"; c.fillText("x" + mult, 24, 110); }
    // bullet-time meter
    const bw = 140, bx = this.w - bw - 24, by = 28;
    c.fillStyle = "rgba(0,0,0,0.4)"; c.fillRect(bx, by, bw, 8);
    c.fillStyle = this.btActive ? "#7cf" : "#39ff88"; c.fillRect(bx, by, bw * this.bt, 8);
    c.font = "11px 'Cascadia Code', monospace"; c.fillStyle = "rgba(180,220,190,0.8)";
    c.fillText("BULLET TIME (Shift)", bx, by - 6);
    // footer
    c.fillStyle = "rgba(180,220,190,0.55)"; c.font = "12px 'Cascadia Code', monospace";
    c.fillText("← → drehen · ↑ Schub · Space feuern · Shift Zeitlupe · Esc beenden", 24, this.h - 20);
    if (this.bossDefeatedFlash > 0) {
      c.textAlign = "center"; c.fillStyle = "#eafff2"; c.font = "bold 30px 'Cascadia Code', monospace";
      c.globalAlpha = Math.min(1, this.bossDefeatedFlash); c.fillText("YOU ARE THE ONE", this.w / 2, this.h / 2 - 60);
      c.globalAlpha = 1; c.textAlign = "left";
    }
    if (this.over) {
      c.textAlign = "center";
      c.fillStyle = this.newRecord ? "#eafff2" : "#22ff66"; c.font = "bold 54px 'Cascadia Code', monospace";
      c.fillText(this.newRecord ? "NEW RECORD!" : "GAME OVER", this.w / 2, this.h / 2 - 10);
      c.fillStyle = "#eafff2"; c.font = "20px 'Cascadia Code', monospace";
      c.fillText(`Score ${this.score} · Best ${this.best} · Enter = nochmal · Esc = zurück`, this.w / 2, this.h / 2 + 34);
      c.textAlign = "left";
    }
  }

  // ---- procedural SFX ----
  private audio() { return (this.ac ??= new AudioContext()); }
  private blip(freq: number, dur: number, type: OscillatorType, gain: number, sweepTo?: number) {
    const ac = this.audio(); const t = ac.currentTime;
    const o = ac.createOscillator(); const g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo ?? freq * 0.4), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur);
  }
  private sfxShoot() { this.blip(880, 0.12, "square", 0.07); }
  private sfxThrust() { this.blip(90, 0.09, "sawtooth", 0.045); }
  private sfxEnemy() { this.blip(300, 0.14, "square", 0.05, 120); }
  private sfxHit() { this.blip(500, 0.06, "square", 0.06, 700); }
  private sfxPower() { this.blip(500, 0.1, "sine", 0.09, 1000); }
  private sfxBoom(size: number) {
    const ac = this.audio(); const t = ac.currentTime; const dur = 0.25 + size * 0.08;
    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ac.createBufferSource(); src.buffer = buf;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 300 + size * 300;
    const g = ac.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(lp); lp.connect(g); g.connect(ac.destination); src.start(t); src.stop(t + dur);
  }
}
