// Central reactive state for the Matrix engine.
// Both the renderer and the control UI read/write through this store, so a
// change from a slider instantly drives the shader uniforms.

export type GlyphSet = "katakana" | "matrix" | "latin" | "digits" | "binary" | "code" | "custom";

export interface Theme {
  id: string;
  name: string;
  // Core colours are linear-ish RGB in 0..1, tuned to look good through bloom.
  head: [number, number, number]; // brightest leading glyph
  trail: [number, number, number]; // body of the stream
  glow: [number, number, number]; // bloom tint
  background: [number, number, number];
  // Optional signature effects that lift a theme beyond a recolour.
  mode?: "thermal" | "holo"; // shader colouring model (undefined = 2-colour)
  scanlines?: boolean; // CRT scanline overlay
}

export const THEMES: Theme[] = [
  {
    id: "classic",
    name: "Classic Green",
    head: [0.82, 1.0, 0.85],       // cool green-white, not warm
    trail: [0.06, 0.9, 0.18],      // saturated green, less blue = no mint/teal
    glow: [0.2, 1.0, 0.4],
    background: [0.0, 0.02, 0.01],  // faint green fog, not pure black
  },
  {
    id: "ice",
    name: "Ice Blue",
    head: [0.85, 0.97, 1.0],
    trail: [0.2, 0.7, 1.0],
    glow: [0.3, 0.7, 1.0],
    background: [0.0, 0.01, 0.02],
  },
  {
    id: "amber",
    name: "Amber Terminal",
    head: [1.0, 0.95, 0.75],
    trail: [1.0, 0.6, 0.1],
    glow: [1.0, 0.55, 0.1],
    background: [0.02, 0.008, 0.0],
  },
  {
    id: "redalert",
    name: "Red Alert",
    head: [1.0, 0.85, 0.8],
    trail: [1.0, 0.15, 0.2],
    glow: [1.0, 0.1, 0.15],
    background: [0.02, 0.0, 0.0],
  },
  {
    id: "ghost",
    name: "Ghost (Purple)",
    head: [0.95, 0.9, 1.0],
    trail: [0.6, 0.3, 1.0],
    glow: [0.55, 0.25, 1.0],
    background: [0.008, 0.0, 0.018],
  },
  {
    id: "mono",
    name: "Mono White",
    head: [1.0, 1.0, 1.0],
    trail: [0.7, 0.75, 0.8],
    glow: [0.8, 0.85, 0.95],
    background: [0.004, 0.004, 0.006],
  },
  // --- Flagship signature themes (more than a recolour) ---
  {
    id: "crt",
    name: "CRT Phosphor",
    head: [0.8, 1.0, 0.85],
    trail: [0.15, 1.0, 0.4],
    glow: [0.2, 1.0, 0.45],
    background: [0.0, 0.02, 0.008],
    scanlines: true,
  },
  {
    id: "thermal",
    name: "Thermal",
    head: [1.0, 0.98, 0.9],
    trail: [0.55, 0.12, 0.6],
    glow: [1.0, 0.4, 0.15],
    background: [0.015, 0.0, 0.02],
    mode: "thermal",
  },
  {
    id: "holo",
    name: "Holographic",
    head: [0.9, 1.0, 1.0],
    trail: [0.2, 0.9, 1.0],
    glow: [0.4, 0.8, 1.0],
    background: [0.0, 0.008, 0.02],
    mode: "holo",
  },
  {
    id: "gold",
    name: "Gold Cipher",
    head: [1.0, 0.97, 0.82],
    trail: [1.0, 0.72, 0.2],
    glow: [1.0, 0.65, 0.12],
    background: [0.02, 0.013, 0.0],
  },
  {
    id: "synth",
    name: "Synthwave",
    head: [1.0, 0.9, 1.0],
    trail: [1.0, 0.42, 0.83],
    glow: [1.0, 0.3, 0.8],
    background: [0.02, 0.0, 0.03],
  },
];

export interface Config {
  themeId: string;
  glyphSet: GlyphSet;
  customText: string; // used when glyphSet === "custom"

  message: string; // readable text that periodically forms in the rain
  messageEnabled: boolean;

  direction: "down" | "up" | "left" | "right";

  density: number; // number of columns (200..2000)
  fallSpeed: number; // world units / sec
  glyphSize: number; // world units per glyph cell
  trailLength: number; // how many cells the fading tail spans

  depth: number; // how deep the 3D volume extends (z)
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;

  flicker: number; // 0..1 per-glyph brightness noise
  scrambleRate: number; // how often glyphs mutate (Hz)
  waveX: number; // 0..1 horizontal ripple amount
  waveY: number; // 0..1 vertical ripple amount
  quotesEnabled: boolean; // periodically flash atmospheric quotes
  audioReactive: boolean; // whether the rain reacts to audio
  audioIntensity: number; // 0..1 strength of the audio reaction
  cameraDrift: number; // automatic camera sway amount
  mouseParallax: number; // how much the mouse tilts the view
  brightness: number; // global exposure

  paused: boolean;
}

export const DEFAULT_CONFIG: Config = {
  themeId: "classic",
  glyphSet: "matrix",
  customText: "WAKE UP",

  message: "WAKE UP NEO",
  messageEnabled: false,

  direction: "down",

  density: 1100,
  fallSpeed: 9,
  glyphSize: 0.62,
  trailLength: 30,

  depth: 90,
  bloomStrength: 0.85,
  bloomRadius: 0.5,
  bloomThreshold: 0.5,   // heads (and hot band) only — crisp trails

  flicker: 0.1,
  scrambleRate: 7,
  waveX: 0,
  waveY: 0,
  quotesEnabled: false,
  audioReactive: true,
  audioIntensity: 1,
  cameraDrift: 0.5,
  mouseParallax: 0.5,
  brightness: 1.12,

  paused: false,
};

// Curated one-click "moods". Every preset here was rendered and visually
// checked before inclusion, so each one is a good-looking, distinct starting
// point. Ordered green → warm → hot → cool → exotic for a tidy chip row.
export const PRESETS: Record<string, Partial<Config>> = {
  "Cinematic": {
    themeId: "classic", glyphSet: "matrix", density: 650, fallSpeed: 7,
    bloomStrength: 1.05, bloomRadius: 0.6, trailLength: 26, cameraDrift: 0.6, flicker: 0.15,
  },
  "Downpour": {
    themeId: "classic", glyphSet: "matrix", density: 1300, fallSpeed: 16, trailLength: 14,
    glyphSize: 0.55, bloomStrength: 0.9, bloomThreshold: 0.35, brightness: 1.15, flicker: 0.15, depth: 80, scrambleRate: 9,
  },
  "Whisper": {
    themeId: "classic", glyphSet: "matrix", density: 430, fallSpeed: 4.5, trailLength: 34,
    glyphSize: 0.7, bloomStrength: 0.7, bloomThreshold: 0.3, brightness: 1.0, flicker: 0.06, depth: 110, cameraDrift: 0.35, scrambleRate: 4,
  },
  "Binary Storm": {
    themeId: "classic", glyphSet: "binary", density: 1200, fallSpeed: 18, trailLength: 16,
    glyphSize: 0.5, bloomStrength: 0.9, brightness: 1.15, scrambleRate: 12,
  },
  "Retro CRT": {
    themeId: "crt", glyphSet: "code", density: 600, fallSpeed: 8, trailLength: 20,
    glyphSize: 0.7, bloomStrength: 0.75, flicker: 0.12, scrambleRate: 5, depth: 70,
  },
  "Terminal": {
    themeId: "amber", glyphSet: "latin", density: 480, fallSpeed: 8,
    bloomStrength: 0.55, bloomRadius: 0.4, trailLength: 18, flicker: 0.1, scrambleRate: 4,
  },
  "Gold Vault": {
    themeId: "gold", glyphSet: "matrix", density: 640, fallSpeed: 7, trailLength: 24,
    glyphSize: 0.66, bloomStrength: 0.95, bloomThreshold: 0.35, flicker: 0.08, depth: 95, cameraDrift: 0.45, brightness: 1.1,
  },
  "Inferno": {
    themeId: "redalert", glyphSet: "digits", density: 1300, fallSpeed: 19, trailLength: 18,
    bloomStrength: 1.35, bloomRadius: 0.55, bloomThreshold: 0.26, flicker: 0.3, scrambleRate: 14, depth: 85, brightness: 1.45,
  },
  "Thermal": {
    themeId: "thermal", glyphSet: "digits", density: 900, fallSpeed: 10, trailLength: 20,
    bloomStrength: 1.0, bloomThreshold: 0.3, depth: 100, brightness: 1.1,
  },
  "Vaporwave": {
    themeId: "synth", glyphSet: "latin", density: 960, fallSpeed: 8, trailLength: 24,
    waveX: 0.3, waveY: 0.12, bloomStrength: 1.15, bloomRadius: 0.6, bloomThreshold: 0.3, brightness: 1.28, cameraDrift: 0.6,
  },
  "Deep Space": {
    themeId: "ghost", glyphSet: "matrix", density: 1150, fallSpeed: 5.5, trailLength: 30, depth: 120,
    cameraDrift: 0.45, mouseParallax: 0.85, bloomStrength: 1.15, bloomRadius: 0.6, bloomThreshold: 0.26, brightness: 1.4,
  },
  "Hologram": {
    themeId: "holo", glyphSet: "matrix", density: 1150, fallSpeed: 6.5, trailLength: 26, depth: 120,
    cameraDrift: 0.7, mouseParallax: 0.9, bloomStrength: 1.1, bloomThreshold: 0.26, brightness: 1.35,
  },
  "Glacier": {
    themeId: "ice", glyphSet: "katakana", density: 720, fallSpeed: 6, trailLength: 26,
    glyphSize: 0.78, depth: 130, bloomStrength: 1.0, bloomRadius: 0.6, cameraDrift: 0.5, mouseParallax: 0.7, brightness: 1.05,
  },
  "Overclock": {
    themeId: "ice", glyphSet: "matrix", density: 1400, fallSpeed: 22, trailLength: 16,
    bloomStrength: 1.25, bloomRadius: 0.5, flicker: 0.28, scrambleRate: 14, cameraDrift: 0.9, depth: 90,
  },
  "Zen": {
    themeId: "mono", glyphSet: "katakana", density: 520, fallSpeed: 4, trailLength: 30,
    glyphSize: 0.72, bloomStrength: 0.75, flicker: 0.05, depth: 110, cameraDrift: 0.3, brightness: 1.05,
  },
};

// The visual fields a preset governs. Applying a preset resets these to their
// defaults first, so a preset always yields the exact look it was tuned for —
// regardless of whatever the user had dialled in beforehand.
const PRESET_KEYS: (keyof Config)[] = [
  "themeId", "glyphSet", "density", "fallSpeed", "glyphSize", "trailLength", "depth",
  "bloomStrength", "bloomRadius", "bloomThreshold", "flicker", "scrambleRate",
  "waveX", "waveY", "cameraDrift", "mouseParallax", "brightness",
];

// Build the full patch for a preset: default visuals overlaid with the preset's
// overrides. User prefs (message, audio, direction, glyph message…) are left as-is.
export function presetPatch(name: string): Partial<Config> {
  const base: Partial<Config> = {};
  for (const k of PRESET_KEYS) (base as any)[k] = DEFAULT_CONFIG[k];
  return { ...base, ...PRESETS[name] };
}

type Listener = (cfg: Config, changed: keyof Config | "*") => void;

const STORAGE_KEY = "matrixng.config.v1";

export class Store {
  private cfg: Config;
  private listeners = new Set<Listener>();
  private saveTimer = 0;

  constructor(initial: Config = DEFAULT_CONFIG) {
    // Start from defaults, then overlay any persisted settings the user chose
    // in a previous session (validated key-by-key so stale data can't corrupt).
    this.cfg = { ...initial, ...this.load() };
  }

  private load(): Partial<Config> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const saved = JSON.parse(raw);
      const out: Partial<Config> = {};
      for (const k of Object.keys(DEFAULT_CONFIG) as (keyof Config)[]) {
        if (k in saved && typeof saved[k] === typeof DEFAULT_CONFIG[k]) {
          (out as any)[k] = saved[k];
        }
      }
      return out;
    } catch {
      return {};
    }
  }

  private save() {
    // Debounced so dragging a slider doesn't hammer localStorage. 'paused' is
    // intentionally not persisted — the app should never start frozen.
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      try {
        const { paused, ...persist } = this.cfg;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(persist));
      } catch {
        /* storage unavailable (private mode / file://) — ignore */
      }
    }, 250);
  }

  // Encode the current look into a compact string for a shareable URL hash.
  exportToString(): string {
    const { paused, ...persist } = this.cfg;
    const json = JSON.stringify(persist);
    return btoa(unescape(encodeURIComponent(json))); // unicode-safe base64
  }

  // Apply a config previously produced by exportToString(). Returns success.
  importFromString(s: string): boolean {
    try {
      const json = decodeURIComponent(escape(atob(s)));
      const saved = JSON.parse(json);
      const patch: Partial<Config> = {};
      for (const k of Object.keys(DEFAULT_CONFIG) as (keyof Config)[]) {
        if (k !== "paused" && k in saved && typeof saved[k] === typeof DEFAULT_CONFIG[k]) {
          (patch as any)[k] = saved[k];
        }
      }
      if (Object.keys(patch).length) {
        this.patch(patch);
        return true;
      }
    } catch {
      /* malformed hash — ignore */
    }
    return false;
  }

  // Reset everything to defaults AND forget the saved settings.
  resetDefaults() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.cfg = { ...DEFAULT_CONFIG };
    this.emit("*");
  }

  get(): Config {
    return this.cfg;
  }

  set<K extends keyof Config>(key: K, value: Config[K]): void {
    if (this.cfg[key] === value) return;
    this.cfg[key] = value;
    this.emit(key);
    if (key !== "paused") this.save();
  }

  patch(partial: Partial<Config>): void {
    let any = false;
    for (const k in partial) {
      const key = k as keyof Config;
      if (this.cfg[key] !== partial[key]) {
        (this.cfg as any)[key] = partial[key];
        any = true;
      }
    }
    if (any) {
      this.emit("*");
      this.save();
    }
  }

  theme(): Theme {
    return THEMES.find((t) => t.id === this.cfg.themeId) ?? THEMES[0];
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(changed: keyof Config | "*") {
    for (const fn of this.listeners) fn(this.cfg, changed);
  }
}
