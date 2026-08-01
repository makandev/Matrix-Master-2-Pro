# Matrix // Next-Gen — 3D Matrix Rain Generator

A free, next-generation **Matrix digital rain** generator rendered in real volumetric **3D** with GPU bloom — not a flat 2D clone. Pick from 11 themes, make the rain spell **your own message**, react it to music, and export a pixel-perfect **4K/5K wallpaper** or video for any monitor.

**▶ Live demo:** _(add your GitHub Pages URL here after deploy)_
**⤓ Windows app:** _(add release link — live wallpaper & screensaver)_

## Features

- **Volumetric 3D rain** — real depth, parallax, camera drift and UnrealBloom
- **11 themes** incl. CRT Phosphor (scanlines), Thermal (heat LUT), Holographic (iridescence), Gold, Synthwave
- **Authentic mirrored-katakana** film glyphs (own atlas — no third-party font shipped)
- **Make-your-own-message** decode reveal + **shareable config permalinks** (`#cfg=…`)
- **Audio-reactive** — microphone or your own music (100% on-device)
- **Reference-parity & beyond** — 4-way direction, wave/turbulence, atmospheric quote rotation, keyboard cheatsheet
- **Lossless export** — true-resolution PNG with 2× supersampling up to 5K / ultrawide / phone-portrait, plus high-bitrate WebM video
- **Free Windows app** (.NET + WebView2) — window, fullscreen, **live desktop wallpaper**, and **screensaver** (`.scr`)
- **Installable PWA**, mobile-friendly, `prefers-reduced-motion` aware

## Controls

Press **`?`** in the app for the full cheatsheet. Highlights: `Space` pause · `Tab` panel · `F`/`F11` fullscreen · `←↑↓→` direction · `R` randomize · `P` export · `C` copy link · `Ctrl+K` command palette · `i` info.

## Develop

```bash
npm install
npm run dev      # http://localhost:5199
npm run build    # → dist/
```

**Windows app:** `Start.bat` (all-in-one — builds the frontend + native app and launches it), or:

```bash
dotnet build desktop/MatrixNG.csproj -c Release
```

## Deploy (GitHub Pages)

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds and publishes `dist/` to GitHub Pages. Enable **Settings → Pages → Source: GitHub Actions** once. After deploy, replace the `REPLACE-WITH-YOUR-DOMAIN` placeholders in `index.html`, `robots.txt` and `sitemap.xml` with your real URL.

## Tech

Vite · TypeScript · Three.js (WebGL2) · Web Audio · .NET 10 + WebView2. Assets are original; no third-party fonts are redistributed.

---

_Keywords: matrix rain, matrix digital rain, matrix code rain, matrix rain generator, matrix wallpaper, matrix screensaver, matrix live wallpaper, matrix rain 4k._
