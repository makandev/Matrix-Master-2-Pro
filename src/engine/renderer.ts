import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { Store } from "./config";
import { MatrixRain } from "./matrixRain";
import type { AudioLevels } from "./audio";

// Owns the WebGL context, the bloom pipeline and the camera motion. The rain
// field lives inside; this class wires it to the screen.
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly rain: MatrixRain;

  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private clock = new THREE.Clock();
  private mouse = new THREE.Vector2(0, 0);
  private mouseTarget = new THREE.Vector2(0, 0);
  private rebuildTimer = 0;
  // Cinematic intro: dolly from deep in the volume to the resting pose. Any
  // deliberate input skips it. Shows off the 3D depth a flat clone can't.
  private introActive = true;
  private readonly introDur = 5;
  // Set from the audio engine each frame (or null when audio-reactive is off).
  audioLevels: AudioLevels | null = null;
  private wasAudio = false;

  constructor(private canvas: HTMLCanvasElement, private store: Store) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true, // lets the UI grab clean screenshots
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 1000);
    this.camera.position.set(0, 0, 14);

    this.rain = new MatrixRain(store);
    this.scene.add(this.rain.group);

    // Post-processing: scene -> bloom -> output (tone map + color space).
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
      store.get().bloomStrength,
      store.get().bloomRadius,
      store.get().bloomThreshold
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // Respect users who prefer reduced motion: skip the cinematic dolly.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      this.introActive = false;
    }

    this.applyBackground();
    this.resize();
    this.rain.rebuild(aspect);

    window.addEventListener("pointermove", this.onPointerMove);
    const skipIntro = () => (this.introActive = false);
    window.addEventListener("pointerdown", skipIntro, { once: true });
    window.addEventListener("keydown", skipIntro, { once: true });
    window.addEventListener("wheel", skipIntro, { once: true });

    // React to config changes.
    store.subscribe((_c, changed) => {
      if (changed === "glyphSet" || changed === "customText") this.rain.rebuildAtlas();
      if (
        changed === "density" || changed === "depth" || changed === "glyphSize" ||
        changed === "direction" || changed === "*"
      ) {
        this.scheduleRebuild();
      }
      if (changed === "themeId" || changed === "*") this.applyBackground();
      this.rain.applyConfig();
      const c = store.get();
      this.bloom.strength = c.bloomStrength;
      this.bloom.radius = c.bloomRadius;
      this.bloom.threshold = c.bloomThreshold;
    });
  }

  // Rebuilding the instanced field allocates large arrays, so coalesce the
  // rapid-fire changes from dragging a slider into one rebuild.
  private scheduleRebuild() {
    clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => this.rain.rebuild(this.camera.aspect), 70);
  }

  private onPointerMove = (e: PointerEvent) => {
    this.mouseTarget.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      (e.clientY / window.innerHeight) * 2 - 1
    );
  };

  private applyBackground() {
    const t = this.store.theme();
    const c = new THREE.Color().setRGB(t.background[0], t.background[1], t.background[2]);
    this.renderer.setClearColor(c, 1);
    this.scene.background = c;
    document.getElementById("scanlines")?.classList.toggle("on", !!t.scanlines);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
    this.rain.rebuild(this.camera.aspect);
  }

  frame() {
    const dt = this.clock.getDelta();
    const t = this.clock.elapsedTime;
    const cfg = this.store.get();

    this.mouse.lerp(this.mouseTarget, Math.min(1, dt * 4));
    const drift = cfg.cameraDrift;
    const par = cfg.mouseParallax;
    const TAU = Math.PI * 2;

    if (this.introActive && t < this.introDur) {
      // Ease a dolly from deep back (whole volume visible) to the resting z.
      const p = t / this.introDur;
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      this.camera.position.set(Math.sin(t * 0.25) * 1.6 * (1 - e), 0, 52 - (52 - 14) * e);
      this.camera.lookAt(0, 0, -cfg.depth * 0.25 * e);
    } else {
      this.introActive = false;
      // Smooth mouse + automatic drift for parallax depth. Layered sines on
      // non-integer periods so the float never visibly loops, plus a slow Z
      // "breathing" dolly — reads as floating, not panning.
      this.camera.position.x =
        (Math.sin((t / 23) * TAU) * 1.2 + Math.sin((t / 51) * TAU) * 0.6) * drift + this.mouse.x * 3.0 * par;
      this.camera.position.y =
        (Math.cos((t / 37) * TAU) * 0.9 + Math.sin((t / 29) * TAU) * 0.4) * drift - this.mouse.y * 2.0 * par;
      this.camera.position.z = 14 + Math.sin((t / 41) * TAU) * 1.4 * drift;
      this.camera.lookAt(0, this.mouse.y * 1.5 * par, -cfg.depth * 0.25);
    }

    // Audio-reactive modulation; self-restores config values when audio ends.
    if (this.audioLevels) {
      this.bloom.strength = cfg.bloomStrength * (1 + this.audioLevels.level * 0.8);
      this.rain.setPulse(this.audioLevels.bass, this.audioLevels.level);
      this.wasAudio = true;
    } else if (this.wasAudio) {
      this.bloom.strength = cfg.bloomStrength;
      this.rain.applyConfig();
      this.wasAudio = false;
    }

    this.rain.update(t);
    this.composer.render();
  }

  // Point every render target at an exact pixel size (no devicePixelRatio
  // multiply) so exports are the true target resolution, never upscaled.
  private setExactSize(w: number, h: number) {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
    this.rain.rebuild(this.camera.aspect);
  }

  // Render one crisp frame at `width`x`height`. supersample>1 renders larger
  // then box-downscales for extra anti-aliasing (the "not pixelated" trick).
  async captureStill(
    width: number,
    height: number,
    opts: { supersample?: number; type?: string; quality?: number } = {}
  ): Promise<Blob | null> {
    const { type = "image/png", quality = 0.96 } = opts;
    // Keep the internal render buffer within a safe GPU size.
    const maxPixels = 8192 * 8192;
    let ss = Math.max(1, Math.min(opts.supersample ?? 1, 4));
    while (ss > 1 && width * height * ss * ss > maxPixels) ss -= 1;
    const rw = Math.round(width * ss);
    const rh = Math.round(height * ss);

    const prevRatio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.setExactSize(rw, rh);
    this.composer.render();

    let blob: Blob | null;
    if (ss > 1) {
      const out = document.createElement("canvas");
      out.width = width;
      out.height = height;
      const ctx = out.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(this.canvas, 0, 0, rw, rh, 0, 0, width, height);
      blob = await new Promise((r) => out.toBlob(r, type, quality));
    } else {
      blob = await new Promise((r) => this.canvas.toBlob(r, type, quality));
    }

    this.renderer.setPixelRatio(prevRatio);
    this.resize(); // restore to the live display size
    return blob;
  }

  // Record a high-bitrate WebM at exactly `width`x`height`.
  async captureVideo(
    width: number,
    height: number,
    seconds = 8,
    fps = 60,
    onTick?: (p: number) => void
  ): Promise<Blob> {
    const prevRatio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.setExactSize(width, height);

    const stream = this.canvas.captureStream(fps);
    const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 24_000_000 });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((res) => (rec.onstop = () => res()));

    rec.start();
    const start = performance.now();
    await new Promise<void>((res) => {
      const tick = () => {
        const p = Math.min(1, (performance.now() - start) / (seconds * 1000));
        onTick?.(p);
        if (p >= 1) res();
        else setTimeout(tick, 120);
      };
      tick();
    });
    rec.stop();
    await stopped;

    this.renderer.setPixelRatio(prevRatio);
    this.resize();
    return new Blob(chunks, { type: "video/webm" });
  }

  dispose() {
    window.removeEventListener("pointermove", this.onPointerMove);
    this.rain.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
