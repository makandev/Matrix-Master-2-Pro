import { Engine } from "../engine/renderer";

interface Preset {
  label: string;
  w: number;
  h: number;
  video?: boolean; // suitable as a video default
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// Quality-first export modal: renders at true target resolution (never
// upscaled) with optional 2x supersampling, lossless PNG, and high-bitrate
// WebM — sized to whatever monitor the user actually has.
export class Exporter {
  private backdrop: HTMLDivElement;
  private busy = false;

  constructor(private engine: Engine, private toast: (m: string) => void) {
    let mw = Math.round(screen.width * devicePixelRatio);
    let mh = Math.round(screen.height * devicePixelRatio);
    // Guard against headless/odd environments reporting 0 — never offer 0×0.
    if (mw < 320 || mh < 320) {
      mw = Math.round(window.innerWidth * devicePixelRatio) || 1920;
      mh = Math.round(window.innerHeight * devicePixelRatio) || 1080;
    }

    const presets: Preset[] = [
      { label: `Mein Monitor · ${mw}×${mh}`, w: mw, h: mh },
      { label: "Full HD · 1920×1080", w: 1920, h: 1080, video: true },
      { label: "2K QHD · 2560×1440", w: 2560, h: 1440, video: true },
      { label: "4K UHD · 3840×2160", w: 3840, h: 2160 },
      { label: "5K · 5120×2880", w: 5120, h: 2880 },
      { label: "Ultrawide · 3440×1440", w: 3440, h: 1440 },
      { label: "Super-Ultrawide · 5120×1440", w: 5120, h: 1440 },
      { label: "Handy Hochkant · 1170×2532", w: 1170, h: 2532 },
    ];

    this.backdrop = document.createElement("div");
    this.backdrop.className = "export-backdrop";
    this.backdrop.innerHTML = `
      <div class="export-modal">
        <header>
          <span class="logo">◈ EXPORT</span>
          <button class="close" title="Schließen">✕</button>
        </header>
        <div class="ebody">
          <label class="efield">
            <span>Auflösung</span>
            <select class="res">
              ${presets.map((p, i) => `<option value="${i}">${p.label}</option>`).join("")}
            </select>
          </label>
          <div class="erow">
            <label class="efield">
              <span>Format (Bild)</span>
              <select class="fmt">
                <option value="image/png">PNG · verlustfrei (beste Qualität)</option>
                <option value="image/jpeg">JPG · kleiner</option>
              </select>
            </label>
            <label class="efield">
              <span>Schärfe</span>
              <select class="ss">
                <option value="2" selected>2× Supersampling (gestochen scharf)</option>
                <option value="1">1× (schneller)</option>
              </select>
            </label>
          </div>
          <label class="efield">
            <span>Video-Länge</span>
            <select class="dur">
              <option value="6">6 Sekunden</option>
              <option value="10" selected>10 Sekunden</option>
              <option value="15">15 Sekunden</option>
            </select>
          </label>
          <div class="ehint"></div>
          <div class="eactions">
            <button class="btn-img">⤓ Wallpaper (Bild)</button>
            <button class="btn-vid">⤓ Video (WebM)</button>
          </div>
          <div class="eprogress"><div class="bar"></div><span class="ptxt"></span></div>
        </div>
      </div>`;
    document.getElementById("app")!.appendChild(this.backdrop);

    const $ = (s: string) => this.backdrop.querySelector(s) as HTMLElement;
    const resSel = $(".res") as HTMLSelectElement;
    const fmtSel = $(".fmt") as HTMLSelectElement;
    const ssSel = $(".ss") as HTMLSelectElement;
    const durSel = $(".dur") as HTMLSelectElement;
    const hint = $(".ehint");
    const prog = $(".eprogress");
    const bar = $(".bar");
    const ptxt = $(".ptxt");

    const updateHint = () => {
      const p = presets[+resSel.value];
      const ss = +ssSel.value;
      hint.textContent =
        ss > 1
          ? `Rendert intern in ${p.w * ss}×${p.h * ss} und rechnet auf ${p.w}×${p.h} herunter → maximale Schärfe.`
          : `Rendert exakt in ${p.w}×${p.h}.`;
    };
    resSel.onchange = updateHint;
    ssSel.onchange = updateHint;
    updateHint();

    $(".close").onclick = () => this.close();
    this.backdrop.onclick = (e) => {
      if (e.target === this.backdrop && !this.busy) this.close();
    };

    const setBusy = (on: boolean, label = "") => {
      this.busy = on;
      prog.classList.toggle("show", on);
      bar.style.width = "0%";
      ptxt.textContent = label;
      ($(".btn-img") as HTMLButtonElement).disabled = on;
      ($(".btn-vid") as HTMLButtonElement).disabled = on;
    };

    $(".btn-img").onclick = async () => {
      if (this.busy) return;
      const p = presets[+resSel.value];
      const type = fmtSel.value;
      setBusy(true, "Rendere Bild …");
      // Let the DOM paint the busy state before the heavy render blocks.
      await new Promise((r) => setTimeout(r, 30));
      try {
        const blob = await this.engine.captureStill(p.w, p.h, { supersample: +ssSel.value, type });
        if (blob) {
          const ext = type === "image/png" ? "png" : "jpg";
          download(blob, `matrix-${p.w}x${p.h}-${Date.now()}.${ext}`);
          this.toast(`Wallpaper gespeichert · ${p.w}×${p.h}`);
          this.close();
        } else this.toast("Export fehlgeschlagen");
      } catch (err) {
        this.toast("Export fehlgeschlagen");
        console.error(err);
      } finally {
        setBusy(false);
      }
    };

    $(".btn-vid").onclick = async () => {
      if (this.busy) return;
      const p = presets[+resSel.value];
      const secs = +durSel.value;
      setBusy(true, "Nehme Video auf … 0%");
      await new Promise((r) => setTimeout(r, 30));
      try {
        const blob = await this.engine.captureVideo(p.w, p.h, secs, 60, (prg) => {
          bar.style.width = `${Math.round(prg * 100)}%`;
          ptxt.textContent = `Nehme Video auf … ${Math.round(prg * 100)}%`;
        });
        download(blob, `matrix-${p.w}x${p.h}-${Date.now()}.webm`);
        this.toast(`Video gespeichert · ${p.w}×${p.h}`);
        this.close();
      } catch (err) {
        this.toast("Video-Export fehlgeschlagen");
        console.error(err);
      } finally {
        setBusy(false);
      }
    };
  }

  open() {
    this.backdrop.classList.add("open");
  }
  close() {
    if (this.busy) return;
    this.backdrop.classList.remove("open");
  }
}
