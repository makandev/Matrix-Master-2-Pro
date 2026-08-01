import * as THREE from "three";
import type { GlyphSet } from "./config";

// Half-width katakana — the glyphs the film's title sequence actually used.
const KATAKANA = "ﾊﾋﾆｾｽｹｼﾅﾉﾎｱｳｴｵｶｷｸｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ".split("");
const DIGITS = "0123456789".split("");
const LATIN = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const SYMBOLS = "@#$%&*+=<>?/\\|:;".split("");
const BINARY = "01".split("");
// Syntax-token soup for the "code compiling" aesthetic.
const CODE = "{}[]()<>/\\=+-*;:.,|&%$#@!?".split("").concat("01".split(""), "ifelsefnconst=>".split(""));
// "matrix" mixes katakana with mirrored latin/digits/symbols like the movie.
const MATRIX_MIX = [...KATAKANA, ...DIGITS, ...SYMBOLS, ..."ﾘﾚｦｱｳｵﾝ".split("")];

// The film's glyphs are horizontally MIRRORED half-width katakana — that
// reversed form is the instant "this is The Matrix" signal. We mirror our own
// system katakana at atlas-bake time, so no third-party font is redistributed.
export function mirrorFor(set: GlyphSet): boolean {
  return set === "matrix" || set === "katakana";
}

export function glyphsFor(set: GlyphSet, custom: string): string[] {
  switch (set) {
    case "katakana": return KATAKANA;
    case "digits": return DIGITS;
    case "binary": return BINARY;
    case "code": return CODE;
    case "latin": return [...LATIN, ...DIGITS];
    case "custom": {
      const chars = Array.from(custom).filter((c) => c.trim().length > 0);
      return chars.length ? chars : ["0", "1"];
    }
    case "matrix":
    default: return MATRIX_MIX;
  }
}

export interface GlyphAtlas {
  texture: THREE.Texture;
  count: number; // number of glyphs
  cols: number; // tiles per row in the atlas
  rows: number;
  tile: number; // pixel size of one tile
}

// Renders the glyph set into a square-ish texture atlas of tiles. High-res
// cells + a transparent gutter + mipmaps keep glyphs razor-sharp at 4K/5K
// export and shimmer-free when scaled down in the distance. `mirror` flips each
// glyph horizontally for the authentic reversed-katakana film look.
export function buildAtlas(glyphs: string[], tile = 96, mirror = false): GlyphAtlas {
  const count = glyphs.length;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  const canvas = document.createElement("canvas");
  canvas.width = cols * tile;
  canvas.height = rows * tile;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // ~66% of the cell → ~17% padding per side so mipmaps can't bleed neighbours.
  ctx.font = `${Math.floor(tile * 0.66)}px "MS Gothic", "Yu Gothic", "Consolas", monospace`;

  for (let i = 0; i < count; i++) {
    const cx = (i % cols) * tile + tile / 2;
    const cy = Math.floor(i / cols) * tile + tile / 2;
    ctx.save();
    ctx.translate(cx, cy);
    if (mirror) ctx.scale(-1, 1);
    ctx.fillText(glyphs[i], 0, 0);
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.flipY = false; // shader maps tile rows top-to-bottom directly
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return { texture, count, cols, rows, tile };
}
