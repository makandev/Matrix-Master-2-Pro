import { Store } from "../engine/config";

// The glyph pool the characters cycle through while "decoding".
const SCRAMBLE =
  "ｦｱｳｴｵｶｷｸｹｺｻｼｽｾﾀﾁﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const rnd = () => SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];

// Atmospheric, generic hacker/awakening lines — evoke the mood without copying
// specific trademarked film quotes (safer for a public site).
const QUOTES = [
  "WAKE UP", "FREE YOUR MIND", "THE SIGNAL IS REAL", "REALITY IS CODE",
  "FOLLOW THE SIGNAL", "SYSTEM ONLINE", "ACCESS GRANTED", "DECRYPTING…",
  "NOTHING IS RANDOM", "LOOK CLOSER", "THE CODE SEES YOU", "BREAK THE LOOP",
];

type Phase = "decode" | "hold" | "dissolve" | "wait";

// A DOM overlay that materialises the user's message out of scrambling glyphs,
// holds it, then dissolves it back into the rain — the classic "decode" effect.
// Lives above the canvas but below the control chrome, and never eats clicks.
export class MessageReveal {
  private el: HTMLDivElement;
  private chars: HTMLSpanElement[] = [];
  private raf = 0;
  private phase: Phase = "decode";
  private phaseStart = 0;
  private text = "";
  private quoteTimer = 0;

  // Timings (ms).
  private readonly stagger = 75; // delay between characters locking
  private readonly settle = 450; // lead-in before the first char locks
  private readonly hold = 3600; // how long the readable text stays
  private readonly dissolve = 1100;
  private readonly wait = 4200; // gap before the next reveal (loop)

  constructor(private store: Store) {
    this.el = document.createElement("div");
    this.el.className = "message-overlay";
    document.getElementById("app")!.appendChild(this.el);

    store.subscribe((_c, changed) => {
      if (changed === "message" || changed === "messageEnabled" || changed === "*") {
        this.rebuild();
      }
      if (changed === "quotesEnabled" || changed === "*") this.setupQuotes();
    });
    this.rebuild();
    this.setupQuotes();
  }

  // Periodically flash a random atmospheric quote (unless a fixed message loop
  // is already running). flash() is guarded, so this can't fight a user message.
  private setupQuotes() {
    clearInterval(this.quoteTimer);
    if (!this.store.get().quotesEnabled) return;
    this.quoteTimer = window.setInterval(() => {
      if (!this.store.get().messageEnabled) {
        this.flash(QUOTES[(Math.random() * QUOTES.length) | 0]);
      }
    }, 14000);
  }

  private rebuild() {
    this.start(this.store.get().messageEnabled ? this.store.get().message : "");
  }

  // One-shot decode of `text`, independent of the toggle — used for the intro.
  // Skipped if a looping message is already active so it can't fight it.
  flash(text: string) {
    if (!this.store.get().messageEnabled) this.start(text);
  }

  private start(text: string) {
    cancelAnimationFrame(this.raf);
    this.text = text.trim();
    this.el.innerHTML = "";
    this.el.classList.remove("dissolving");
    this.chars = [];

    if (!this.text) {
      this.el.style.opacity = "0";
      return;
    }

    for (let i = 0; i < this.text.length; i++) {
      const ch = this.text[i];
      const span = document.createElement("span");
      const space = ch === " ";
      span.className = space ? "mc space" : "mc";
      span.textContent = space ? " " : rnd();
      span.style.transitionDelay = `${i * 35}ms`;
      this.el.appendChild(span);
      this.chars.push(span);
    }

    this.el.style.opacity = "1";
    this.phase = "decode";
    this.phaseStart = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private loop = () => {
    const now = performance.now();
    const t = now - this.phaseStart;

    switch (this.phase) {
      case "decode": {
        let allLocked = true;
        for (let i = 0; i < this.chars.length; i++) {
          const span = this.chars[i];
          if (span.classList.contains("space")) continue;
          const lockAt = i * this.stagger + this.settle;
          if (t >= lockAt) {
            if (!span.classList.contains("locked")) {
              span.classList.add("locked");
              span.textContent = this.text[i];
            }
          } else {
            allLocked = false;
            if (Math.random() < 0.55) span.textContent = rnd();
          }
        }
        if (allLocked) {
          this.phase = "hold";
          this.phaseStart = now;
        }
        break;
      }
      case "hold":
        if (t > this.hold) {
          this.el.classList.add("dissolving");
          this.phase = "dissolve";
          this.phaseStart = now;
        }
        break;
      case "dissolve":
        if (t > this.dissolve) {
          this.el.classList.remove("dissolving");
          // Loop only while still enabled with a message.
          if (this.store.get().messageEnabled && this.text) {
            this.phase = "wait";
            this.phaseStart = now;
          } else {
            this.el.style.opacity = "0";
            return;
          }
        }
        break;
      case "wait":
        if (t > this.wait) {
          this.rebuild();
          return;
        }
        break;
    }

    this.raf = requestAnimationFrame(this.loop);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.el.remove();
  }
}
