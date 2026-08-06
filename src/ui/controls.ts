import { Store, THEMES, PRESETS, DEFAULT_CONFIG, presetPatch, type Config, type GlyphSet } from "../engine/config";
import { MOODS } from "../engine/synth";

export interface UIHooks {
  toast: (msg: string) => void;
  openExport: () => void;
  audioMic: () => Promise<void> | void;
  audioFile: (f: File) => Promise<void> | void;
  audioSynth: (mood: string) => void;
  audioOff: () => void;
  audioActive: () => boolean;
  toggleGame: () => void;
  isGameActive: () => boolean;
}

interface Binder { update: () => void; }

const GLYPH_SETS: { id: GlyphSet; label: string }[] = [
  { id: "matrix", label: "Matrix" },
  { id: "katakana", label: "カナ" },
  { id: "latin", label: "ABC" },
  { id: "digits", label: "123" },
  { id: "binary", label: "01" },
  { id: "code", label: "&lt;/&gt;" },
  { id: "custom", label: "Text" },
];

const SLIDERS: { key: keyof Config; label: string; min: number; max: number; step: number; fmt?: (v: number) => string }[] = [
  { key: "density", label: "Dichte (Spalten)", min: 200, max: 2000, step: 10, fmt: (v) => v.toFixed(0) },
  { key: "fallSpeed", label: "Fallgeschwindigkeit", min: 2, max: 30, step: 0.5 },
  { key: "glyphSize", label: "Glyph-Größe", min: 0.35, max: 1.1, step: 0.01 },
  { key: "trailLength", label: "Schweif-Länge", min: 6, max: 40, step: 1, fmt: (v) => v.toFixed(0) },
  { key: "scrambleRate", label: "Scramble-Tempo", min: 0, max: 20, step: 0.5 },
];
const SLIDERS_DEPTH: typeof SLIDERS = [
  { key: "depth", label: "Tiefe", min: 30, max: 180, step: 5, fmt: (v) => v.toFixed(0) },
  { key: "cameraDrift", label: "Kamera-Drift", min: 0, max: 2, step: 0.05 },
  { key: "mouseParallax", label: "Maus-Parallax", min: 0, max: 1.5, step: 0.05 },
];
const WAVE_SLIDERS: typeof SLIDERS = [
  { key: "waveX", label: "Welle horizontal", min: 0, max: 1, step: 0.02 },
  { key: "waveY", label: "Welle vertikal", min: 0, max: 1, step: 0.02 },
];
const SLIDERS_LOOK: typeof SLIDERS = [
  { key: "bloomStrength", label: "Glow-Stärke", min: 0, max: 2, step: 0.05 },
  { key: "bloomRadius", label: "Glow-Radius", min: 0, max: 1.2, step: 0.05 },
  { key: "bloomThreshold", label: "Glow-Schwelle", min: 0, max: 1, step: 0.02 },
  { key: "brightness", label: "Helligkeit", min: 0.3, max: 2, step: 0.05 },
  { key: "flicker", label: "Flackern", min: 0, max: 0.6, step: 0.02 },
];

const ICONS: Record<string, string> = {
  panel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="14" y1="4" x2="14" y2="20"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l11 7-11 7z"/></svg>',
  full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8 7l1.5-3h5L16 7"/></svg>',
  cmd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></svg>',
  game: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7 4v6l-7 4-7-4V7z" transform="rotate(0 12 12)"/><path d="M12 3v18M5 7l14 6"/></svg>',
};

const SHORTCUTS: [string, string][] = [
  ["Leertaste", "Pause / Weiter"],
  ["Tab", "Panel ein/aus"],
  ["F  ·  F11", "Vollbild"],
  ["←  ↑  ↓  →", "Rain-Richtung"],
  ["R", "Zufälliger Look"],
  ["P", "Export / Download"],
  ["C", "Teilbaren Link kopieren"],
  ["Strg + K", "Befehls-Palette"],
  ["G", "Asteroids-Spiel"],
  ["?", "Diese Hilfe"],
];

export function buildUI(store: Store, hooks: UIHooks): void {
  const binders: Binder[] = [];
  const root = document.getElementById("app")!;

  // ---- helpers ----
  const el = (tag: string, cls?: string, html?: string) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };
  const rgbHex = (c: [number, number, number]) =>
    "#" + c.map((v) => Math.round(Math.min(1, v) * 255).toString(16).padStart(2, "0")).join("");

  function applyAccent() {
    const t = store.theme();
    document.documentElement.style.setProperty("--accent", rgbHex(t.glow));
    document.documentElement.style.setProperty("--accent-dim", rgbHex(t.glow) + "88");
  }

  // ---- panel ----
  const panel = el("div", "panel chrome");
  panel.innerHTML = `
    <header>
      <span class="logo">◈ MATRIX//NG</span>
      <span class="sub">v0.1</span>
    </header>
    <div class="body"></div>`;
  const body = panel.querySelector(".body") as HTMLElement;

  const section = (title: string) => {
    const s = el("div", "section");
    s.appendChild(el("div", "title", title));
    body.appendChild(s);
    return s;
  };

  // Presets
  const secPre = section("Presets");
  const chips = el("div", "chips");
  for (const name of Object.keys(PRESETS)) {
    const c = el("button", "chip", name);
    c.onclick = () => { store.patch(presetPatch(name)); hooks.toast(`Preset · ${name}`); };
    chips.appendChild(c);
  }
  const resetChip = el("button", "chip", "↺ Reset");
  resetChip.onclick = () => { store.resetDefaults(); hooks.toast("Auf Standard zurückgesetzt"); };
  chips.appendChild(resetChip);
  secPre.appendChild(chips);

  // Theme swatches
  const secTheme = section("Farbwelt");
  const sw = el("div", "swatches");
  for (const t of THEMES) {
    const s = el("div", "swatch", `<span>${t.name}</span>`);
    s.style.color = rgbHex(t.glow);
    s.style.background = `linear-gradient(135deg, ${rgbHex(t.trail)}, ${rgbHex(t.head)})`;
    s.dataset.id = t.id;
    s.onclick = () => store.set("themeId", t.id);
    sw.appendChild(s);
  }
  secTheme.appendChild(sw);
  binders.push({ update: () => sw.querySelectorAll<HTMLElement>(".swatch").forEach((e) => e.classList.toggle("active", e.dataset.id === store.get().themeId)) });

  // Glyphs
  const secGlyph = section("Zeichen");
  const seg = el("div", "seg");
  for (const g of GLYPH_SETS) {
    const b = el("button", "", g.label);
    b.dataset.id = g.id;
    b.onclick = () => store.set("glyphSet", g.id);
    seg.appendChild(b);
  }
  secGlyph.appendChild(seg);
  const custom = el("textarea", "custom") as HTMLTextAreaElement;
  custom.placeholder = "Eigener Zeichensatz / Text …";
  custom.value = store.get().customText;
  custom.oninput = () => store.set("customText", custom.value);
  secGlyph.appendChild(custom);
  binders.push({
    update: () => {
      const cur = store.get().glyphSet;
      seg.querySelectorAll<HTMLElement>("button").forEach((e) => e.classList.toggle("active", e.dataset.id === cur));
      custom.style.display = cur === "custom" ? "block" : "none";
    },
  });

  // Slider group builder
  const sliderGroup = (title: string, defs: typeof SLIDERS) => {
    const sec = section(title);
    for (const def of defs) {
      const row = el("div", "row");
      const fmt = def.fmt ?? ((v: number) => v.toFixed(2));
      row.innerHTML = `<div class="label"><span>${def.label}</span><span class="val"></span></div>`;
      const input = el("input") as HTMLInputElement;
      input.type = "range";
      input.min = String(def.min); input.max = String(def.max); input.step = String(def.step);
      const valEl = row.querySelector(".val") as HTMLElement;
      const sync = () => {
        const v = store.get()[def.key] as number;
        input.value = String(v);
        valEl.textContent = fmt(v);
        const pct = ((v - def.min) / (def.max - def.min)) * 100;
        input.style.setProperty("--fill", pct + "%");
      };
      input.oninput = () => store.set(def.key, parseFloat(input.value) as any);
      row.appendChild(input);
      sec.appendChild(row);
      binders.push({ update: sync });
    }
  };
  // Message ("make your own Matrix message")
  const secMsg = section("Nachricht");
  const msgInput = el("input", "msg-input") as HTMLInputElement;
  msgInput.type = "text";
  msgInput.maxLength = 40;
  msgInput.placeholder = "Deine Nachricht …";
  msgInput.value = store.get().message;
  msgInput.oninput = () => store.set("message", msgInput.value);
  const msgToggle = el("button", "toggle-chip", "Im Regen anzeigen");
  msgToggle.onclick = () => store.set("messageEnabled", !store.get().messageEnabled);
  const quoteToggle = el("button", "toggle-chip", "Film-Zitate rotieren");
  quoteToggle.onclick = () => store.set("quotesEnabled", !store.get().quotesEnabled);
  secMsg.appendChild(msgInput);
  secMsg.appendChild(msgToggle);
  secMsg.appendChild(quoteToggle);
  binders.push({
    update: () => {
      if (document.activeElement !== msgInput) msgInput.value = store.get().message;
      msgToggle.classList.toggle("active", store.get().messageEnabled);
      msgToggle.textContent = store.get().messageEnabled ? "✓ Wird angezeigt" : "Im Regen anzeigen";
      quoteToggle.classList.toggle("active", store.get().quotesEnabled);
      quoteToggle.textContent = store.get().quotesEnabled ? "✓ Zitate aktiv" : "Film-Zitate rotieren";
    },
  });

  // Audio-reactive
  const secAudio = section("Audio-reaktiv");
  const micBtn = el("button", "toggle-chip", "🎤 Mikrofon");
  micBtn.onclick = () => hooks.audioMic();
  const fileLabel = el("label", "toggle-chip", "♪ Musik laden");
  const fileInput = el("input") as HTMLInputElement;
  fileInput.type = "file";
  fileInput.accept = "audio/*";
  fileInput.style.display = "none";
  fileInput.onchange = () => {
    if (fileInput.files && fileInput.files[0]) hooks.audioFile(fileInput.files[0]);
  };
  fileLabel.appendChild(fileInput);
  secAudio.appendChild(micBtn);
  secAudio.appendChild(fileLabel);
  // Built-in generative music moods (the rain reacts to them).
  const moodLabel = el("div", "sub-label", "Generative Musik");
  secAudio.appendChild(moodLabel);
  const moodChips = el("div", "chips");
  for (const m of Object.values(MOODS)) {
    const b = el("button", "chip", "♫ " + m.name);
    b.dataset.mood = m.id;
    b.onclick = () => hooks.audioSynth(m.id);
    moodChips.appendChild(b);
  }
  secAudio.appendChild(moodChips);

  // Rain-reaction toggle + strength (clearly visible on/off).
  secAudio.appendChild(el("div", "sub-label", "Regen reagiert auf Audio"));
  const reactToggle = el("button", "toggle-chip", "");
  reactToggle.onclick = () => store.set("audioReactive", !store.get().audioReactive);
  secAudio.appendChild(reactToggle);
  const intRow = el("div", "row");
  intRow.innerHTML = `<div class="label"><span>Reaktions-Stärke</span><span class="val"></span></div>`;
  const intInput = el("input") as HTMLInputElement;
  intInput.type = "range"; intInput.min = "0"; intInput.max = "1"; intInput.step = "0.05";
  intInput.oninput = () => store.set("audioIntensity", parseFloat(intInput.value));
  intRow.appendChild(intInput);
  secAudio.appendChild(intRow);
  binders.push({
    update: () => {
      const on = store.get().audioReactive;
      reactToggle.classList.toggle("active", on);
      reactToggle.textContent = on ? "✓ Regen reagiert" : "✕ Regen reagiert NICHT";
      const v = store.get().audioIntensity;
      intInput.value = String(v);
      (intRow.querySelector(".val") as HTMLElement).textContent = v.toFixed(2);
      intInput.style.setProperty("--fill", v * 100 + "%");
      intRow.style.opacity = on ? "1" : "0.4";
    },
  });

  const audioOffBtn = el("button", "toggle-chip", "⏹ Audio aus");
  audioOffBtn.onclick = () => hooks.audioOff();
  secAudio.appendChild(audioOffBtn);

  // Rain direction (4-way)
  const secDir = section("Richtung");
  const dirSeg = el("div", "seg");
  const DIRS: { id: Config["direction"]; label: string }[] = [
    { id: "down", label: "↓" }, { id: "up", label: "↑" },
    { id: "left", label: "←" }, { id: "right", label: "→" },
  ];
  for (const dir of DIRS) {
    const b = el("button", "", dir.label);
    b.dataset.id = dir.id;
    b.onclick = () => store.set("direction", dir.id);
    dirSeg.appendChild(b);
  }
  secDir.appendChild(dirSeg);
  binders.push({
    update: () => dirSeg.querySelectorAll<HTMLElement>("button").forEach((e) =>
      e.classList.toggle("active", e.dataset.id === store.get().direction)),
  });

  sliderGroup("Bewegung", SLIDERS);
  sliderGroup("Wellen", WAVE_SLIDERS);
  sliderGroup("Tiefe & Kamera", SLIDERS_DEPTH);
  sliderGroup("Glow & Look", SLIDERS_LOOK);

  root.appendChild(panel);

  // ---- dock ----
  const dock = el("div", "dock chrome");
  const mkBtn = (icon: string, title: string, onClick: () => void, id?: string) => {
    const b = el("button", "", ICONS[icon]);
    b.title = title;
    if (id) b.dataset.id = id;
    b.onclick = onClick;
    dock.appendChild(b);
    return b;
  };
  const panelBtn = mkBtn("panel", "Panel (Tab)", () => togglePanel(), "panel");
  const pauseBtn = mkBtn("pause", "Pause (Leertaste)", () => store.set("paused", !store.get().paused), "pause");
  dock.appendChild(el("div", "sep"));
  mkBtn("shuffle", "Zufall (R)", () => randomize());
  mkBtn("camera", "Export / Download (P)", () => hooks.openExport());
  mkBtn("link", "Link kopieren (C)", () => shareLink());
  mkBtn("cmd", "Befehle (Ctrl+K)", () => openPalette());
  mkBtn("help", "Tastenkürzel (?)", () => toggleCheat());
  mkBtn("game", "Asteroids spielen (G)", () => hooks.toggleGame());
  dock.appendChild(el("div", "sep"));
  mkBtn("full", "Vollbild (F)", () => toggleFullscreen());
  root.appendChild(dock);
  binders.push({
    update: () => {
      pauseBtn.innerHTML = store.get().paused ? ICONS.play : ICONS.pause;
      pauseBtn.classList.toggle("active", store.get().paused);
    },
  });

  // ---- command palette ----
  const pb = el("div", "palette-backdrop");
  pb.innerHTML = `<div class="palette"><input placeholder="Befehl suchen …" /><div class="results"></div></div>`;
  root.appendChild(pb);
  const pInput = pb.querySelector("input") as HTMLInputElement;
  const pResults = pb.querySelector(".results") as HTMLElement;

  type Cmd = { label: string; hint?: string; run: () => void };
  const commands: Cmd[] = [
    ...Object.keys(PRESETS).map((n) => ({ label: `Preset: ${n}`, hint: "preset", run: () => { store.patch(presetPatch(n)); hooks.toast(`Preset · ${n}`); } })),
    ...THEMES.map((t) => ({ label: `Farbwelt: ${t.name}`, hint: "theme", run: () => store.set("themeId", t.id) })),
    ...GLYPH_SETS.map((g) => ({ label: `Zeichen: ${g.label}`, hint: "glyphs", run: () => store.set("glyphSet", g.id) })),
    { label: "Pause / Weiter", hint: "space", run: () => store.set("paused", !store.get().paused) },
    { label: "Vollbild umschalten", hint: "F", run: () => toggleFullscreen() },
    { label: "Zufällig würfeln", hint: "R", run: () => randomize() },
    { label: "Export / Download (Bild & Video)", hint: "P", run: () => hooks.openExport() },
    { label: "Teilbaren Link kopieren", hint: "C", run: () => shareLink() },
    { label: "Nachricht ein/aus", run: () => store.set("messageEnabled", !store.get().messageEnabled) },
    { label: "Auf Standard zurücksetzen", run: () => store.resetDefaults() },
  ];
  let pSel = 0, pFiltered = commands;
  const renderPalette = () => {
    const q = pInput.value.toLowerCase();
    pFiltered = commands.filter((c) => c.label.toLowerCase().includes(q));
    pSel = Math.min(pSel, Math.max(0, pFiltered.length - 1));
    pResults.innerHTML = "";
    pFiltered.forEach((c, i) => {
      const item = el("div", "item" + (i === pSel ? " sel" : ""), `<span>${c.label}</span>${c.hint ? `<span class="hint">${c.hint}</span>` : ""}`);
      item.onmouseenter = () => { pSel = i; renderPalette(); };
      item.onclick = () => { c.run(); closePalette(); };
      pResults.appendChild(item);
    });
  };
  const openPalette = () => { pb.classList.add("open"); pInput.value = ""; pSel = 0; renderPalette(); pInput.focus(); };
  const closePalette = () => pb.classList.remove("open");
  pInput.oninput = () => { pSel = 0; renderPalette(); };
  pb.onclick = (e) => { if (e.target === pb) closePalette(); };
  pInput.onkeydown = (e) => {
    if (e.key === "ArrowDown") { pSel = Math.min(pSel + 1, pFiltered.length - 1); renderPalette(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { pSel = Math.max(pSel - 1, 0); renderPalette(); e.preventDefault(); }
    else if (e.key === "Enter") { pFiltered[pSel]?.run(); closePalette(); }
    else if (e.key === "Escape") closePalette();
  };

  // ---- actions ----
  let panelOpen = true;
  const togglePanel = () => {
    panelOpen = !panelOpen;
    panel.classList.toggle("closed", !panelOpen);
    panelBtn.classList.toggle("active", panelOpen);
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  const randomize = () => {
    const t = THEMES[Math.floor(Math.random() * THEMES.length)];
    const g = GLYPH_SETS[Math.floor(Math.random() * GLYPH_SETS.length)];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    store.patch({
      themeId: t.id, glyphSet: g.id,
      density: Math.round(rnd(400, 1400)), fallSpeed: rnd(5, 20),
      trailLength: Math.round(rnd(12, 34)), bloomStrength: rnd(0.6, 1.4),
      bloomRadius: rnd(0.35, 0.75), flicker: rnd(0.08, 0.35),
      depth: Math.round(rnd(60, 150)), scrambleRate: rnd(3, 14),
    });
    hooks.toast(`⚄ ${t.name} · ${g.label}`);
  };
  const shareLink = async () => {
    const url = location.origin + location.pathname + "#cfg=" + store.exportToString();
    try {
      await navigator.clipboard.writeText(url);
      hooks.toast("🔗 Link kopiert");
    } catch {
      // Clipboard may be blocked (e.g. non-secure context) — surface the URL.
      prompt("Diesen Link teilen:", url);
    }
  };

  // ---- cheatsheet ----
  const cheat = el("div", "cheatsheet chrome");
  cheat.innerHTML = `<div class="cheat-card">
      <div class="cheat-title">⌨ Tastenkürzel</div>
      <table>${SHORTCUTS.map(([k, d]) => `<tr><td class="k">${k}</td><td>${d}</td></tr>`).join("")}</table>
      <div class="cheat-hint">? oder Esc zum Schließen</div>
    </div>`;
  root.appendChild(cheat);
  const toggleCheat = () => cheat.classList.toggle("open");
  cheat.onclick = () => cheat.classList.remove("open");

  // ---- about / info (crawlable SEO panel that already lives in the HTML) ----
  const about = document.getElementById("about");
  const closeAbout = () => about?.classList.remove("open");
  about?.querySelector(".about-close")?.addEventListener("click", closeAbout);
  about?.addEventListener("click", (e) => { if (e.target === about) closeAbout(); });
  const toggleAbout = () => about?.classList.toggle("open");

  // ---- keyboard ----
  window.addEventListener("keydown", (e) => {
    if (pb.classList.contains("open")) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    if (hooks.isGameActive()) return; // game owns the keys while playing
    switch (e.key.toLowerCase()) {
      case "g": hooks.toggleGame(); break;
      case " ": e.preventDefault(); store.set("paused", !store.get().paused); break;
      case "f": toggleFullscreen(); break;
      case "f11": e.preventDefault(); toggleFullscreen(); break;
      case "tab": e.preventDefault(); togglePanel(); break;
      case "r": randomize(); break;
      case "p": hooks.openExport(); break;
      case "c": shareLink(); break;
      case "arrowdown": e.preventDefault(); store.set("direction", "down"); break;
      case "arrowup": e.preventDefault(); store.set("direction", "up"); break;
      case "arrowleft": e.preventDefault(); store.set("direction", "left"); break;
      case "arrowright": e.preventDefault(); store.set("direction", "right"); break;
      case ",": store.set("waveX", store.get().waveX > 0 ? 0 : 0.5); break;
      case ".": store.set("waveY", store.get().waveY > 0 ? 0 : 0.5); break;
      case "?": e.preventDefault(); toggleCheat(); break;
      case "i": toggleAbout(); break;
      case "escape": cheat.classList.remove("open"); closeAbout(); break;
      case "/": e.preventDefault(); openPalette(); break;
    }
  });

  // ---- idle auto-hide (immersive) ----
  let idleTimer = 0;
  const wake = () => {
    root.classList.remove("ui-hidden");
    document.body.style.cursor = "";
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (!panelOpen && !pb.classList.contains("open")) {
        root.classList.add("ui-hidden");
        document.body.style.cursor = "none";
      }
    }, 3000);
  };
  window.addEventListener("pointermove", wake);
  window.addEventListener("keydown", wake);
  wake();

  // ---- reflect store -> UI ----
  const refreshAll = () => { applyAccent(); binders.forEach((b) => b.update()); };
  store.subscribe(() => refreshAll());
  refreshAll();
}
