import "./ui/styles.css";
import { Store } from "./engine/config";
import { Engine } from "./engine/renderer";
import { buildUI } from "./ui/controls";
import { MessageReveal } from "./ui/message";
import { Exporter } from "./ui/exporter";
import { AudioReactive } from "./engine/audio";

const canvas = document.getElementById("scene") as HTMLCanvasElement;
const store = new Store();

// A shared "#cfg=..." link wins over the locally saved settings on load.
const sharedCfg = new URLSearchParams(location.hash.slice(1)).get("cfg");
if (sharedCfg) store.importFromString(sharedCfg);

const engine = new Engine(canvas, store);

// Simple toast used by the UI for feedback.
let toastTimer = 0;
const toastEl = document.createElement("div");
toastEl.className = "toast";
document.getElementById("app")!.appendChild(toastEl);
function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 1600);
}

const message = new MessageReveal(store);
// One-shot "decode" on load, during the cinematic intro — telegraphs that the
// rain is programmable/personal. Skipped if a looping message is already on.
setTimeout(() => message.flash(store.get().message || "WAKE UP"), 900);
const exporter = new Exporter(engine, toast);
const audio = new AudioReactive();

buildUI(store, {
  toast,
  openExport: () => exporter.open(),
  audioMic: async () => {
    try { await audio.enableMic(); toast("🎤 Mikrofon aktiv"); }
    catch { toast("Mikrofon-Zugriff verweigert"); }
  },
  audioFile: async (f) => {
    try { await audio.enableFile(f); toast("♪ Musik läuft"); }
    catch { toast("Datei konnte nicht geladen werden"); }
  },
  audioOff: () => { audio.disable(); engine.audioLevels = null; toast("Audio aus"); },
  audioActive: () => audio.active,
});

window.addEventListener("resize", () => engine.resize());

function loop() {
  engine.audioLevels = audio.levels();
  engine.frame();
  requestAnimationFrame(loop);
}
loop();

// Dev-only inspection handle (stripped from production builds by the guard).
if (import.meta.env.DEV) (window as any).__mx = { engine, store, message };
