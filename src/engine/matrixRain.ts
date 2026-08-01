import * as THREE from "three";
import { Store } from "./config";
import { buildAtlas, glyphsFor, mirrorFor, type GlyphAtlas } from "./glyphAtlas";

// The volumetric rain. Every glyph cell is one instance of a unit quad. All the
// animation — falling heads, fading trails, glyph scrambling, depth fade — runs
// in the shader; the CPU only advances a single time uniform each frame.

const VERT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uRows;
  uniform float uGlyphSize;
  uniform float uFallCells;     // cells per second
  uniform float uTrail;
  uniform float uFlicker;
  uniform float uScramble;      // glyph mutations per second
  uniform float uGlyphCount;
  uniform float uAtlasCols;
  uniform float uAtlasRows;
  uniform float uHalfFlow;   // half the travel extent, in world units
  uniform vec2 uFlowVec;     // unit travel direction of the rain
  uniform vec2 uCrossVec;    // unit perpendicular (column spread) direction
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uBrightness;
  uniform float uWaveX;     // horizontal ripple amount (world units)
  uniform float uWaveY;     // vertical ripple amount

  attribute float aCross;   // column position along the cross axis
  attribute float aColZ;
  attribute float aRow;
  attribute float aSeed;    // 0..1 per column
  attribute float aSpeed;   // per-column speed multiplier
  attribute float aDim;     // per-column brightness multiplier

  varying vec2 vUv;
  varying vec2 vTile;       // atlas tile origin (col,row)
  varying float vBright;
  varying float vHead;      // 0..1 how "head-like" this cell is
  varying float vDepth;     // 0..1 depth fade
  varying float vHeat;      // 0..1 raw stream intensity (drives thermal/holo ramps)

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }

  void main() {
    vUv = uv;

    // Falling head position for this column, in cell units, wrapped to [0,uRows).
    float hp = uTime * uFallCells * aSpeed + aSeed * uRows * 2.0;
    float d = mod(hp - aRow, uRows);   // distance below the head
    float age = floor(d);              // discrete per-glyph step (not a smooth ramp)

    // Brightness fades with the cell's OWN age since the head lit it (reads as
    // "fading in place", not a segment sliding down). Soft (1-t)^1.6 curve to a
    // faint persistent green floor so the sheet never fully clears to black.
    float head = smoothstep(2.5, 0.0, d);
    float t = age / max(uTrail, 1.0);
    float body = pow(clamp(1.0 - t, 0.0, 1.0), 1.6);
    float floorGreen = 0.06 * smoothstep(2.0, 0.0, t);
    float bright = max(body, floorGreen);
    vHeat = clamp(body + head * 0.6, 0.0, 1.0);

    // Low-frequency per-cell flicker (subtle, never flickers the whole column).
    float fseed = hash(vec3(aCross * 0.13, aRow, floor(uTime * 6.0) + aSeed * 91.0));
    bright *= 1.0 - uFlicker * fseed;
    bright *= aDim;
    bright *= uBrightness;

    vBright = bright;
    vHead = head;

    // Glyph index: the HEAD scrambles fast, trail glyphs lock in and only
    // mutate rarely — so a character fades in place instead of flickering.
    float tick = floor(uTime * uScramble * (0.12 + head * head * 3.0) + aSeed * 57.0);
    float idx = floor(hash(vec3(aCross * 0.07 + aColZ * 0.031, aRow * 1.7, tick)) * uGlyphCount);
    idx = clamp(idx, 0.0, uGlyphCount - 1.0);
    float tileX = mod(idx, uAtlasCols);
    float tileY = floor(idx / uAtlasCols);
    vTile = vec2(tileX, tileY);

    // World position: lay the cell out along the chosen flow/cross axes so the
    // rain can travel in any of the 4 directions. The quad offset stays in
    // screen XY so glyphs always render upright, whatever the flow direction.
    vec2 cell2d = aCross * uCrossVec + uFlowVec * (aRow * uGlyphSize - uHalfFlow);
    // Optional wave/turbulence ripple (logic-wire parity).
    cell2d.x += sin(cell2d.y * 0.12 + uTime * 0.9) * uWaveX;
    cell2d.y += sin(cell2d.x * 0.12 + uTime * 1.2) * uWaveY;
    vec3 cellPos = vec3(cell2d, aColZ);
    float scale = uGlyphSize * (1.0 + head * 0.45);
    vec3 worldPos = cellPos + vec3(position.x, position.y, 0.0) * scale;

    vec4 mv = modelViewMatrix * vec4(worldPos, 1.0);
    float dist = -mv.z;
    vDepth = 1.0 - clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);

    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D uAtlas;
  uniform float uAtlasCols;
  uniform float uAtlasRows;
  uniform vec3 uHeadColor;
  uniform vec3 uTrailColor;
  uniform float uColorMode;   // 0 = normal, 1 = thermal, 2 = holographic

  varying vec2 vUv;
  varying vec2 vTile;
  varying float vBright;
  varying float vHead;
  varying float vDepth;
  varying float vHeat;

  // Thermal LUT: cool violet -> magenta -> orange -> white-hot.
  vec3 thermal(float x) {
    vec3 c = mix(vec3(0.14, 0.0, 0.34), vec3(0.9, 0.1, 0.42), smoothstep(0.0, 0.4, x));
    c = mix(c, vec3(1.0, 0.55, 0.1), smoothstep(0.38, 0.72, x));
    c = mix(c, vec3(1.0, 0.98, 0.85), smoothstep(0.72, 1.0, x));
    return c;
  }

  void main() {
    if (vBright < 0.0016) discard;   // let the long tail fade gently, not hard-cut

    vec2 atlasUv = vec2(
      (vTile.x + vUv.x) / uAtlasCols,
      (vTile.y + (1.0 - vUv.y)) / uAtlasRows
    );
    float mask = texture2D(uAtlas, atlasUv).r;
    if (mask < 0.02) discard;

    vec3 col;
    if (uColorMode > 1.5) {
      // Holographic: hue glides cyan -> violet with depth (fake iridescence),
      // heads flash near-white.
      col = mix(vec3(0.15, 0.95, 1.0), vec3(0.55, 0.3, 1.0), 1.0 - vDepth);
      col = mix(col, vec3(0.95, 1.0, 1.0), vHead);
    } else if (uColorMode > 0.5) {
      // Thermal: the trail itself is the gradient.
      col = thermal(vHeat);
    } else {
      // Three-band leader: body green -> hot green -> cool green-white head.
      vec3 headCol = mix(uHeadColor, vec3(0.85, 1.0, 0.9), 0.4);   // cool, not warm
      vec3 hot = vec3(0.35, 1.0, 0.45);
      col = mix(uTrailColor, hot, smoothstep(0.0, 0.5, vHead));
      col = mix(col, headCol, pow(vHead, 2.2));
      col += headCol * pow(vHead, 5.0) * 0.5;   // white-hot core for bloom
    }

    // Depth desaturation is CAPPED (max ~15%) so the green stays vivid across
    // the whole field — depth is carried by size/fog, not by draining colour.
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(luma), col, mix(0.85, 1.0, vDepth));

    float depthA = 0.6 + 0.4 * vDepth;   // far columns stay present
    float a = mask * vBright * depthA;
    gl_FragColor = vec4(col, a);
  }
`;

export class MatrixRain {
  readonly group = new THREE.Group();
  private material: THREE.ShaderMaterial;
  private mesh?: THREE.InstancedMesh;
  private geom?: THREE.InstancedBufferGeometry;
  private atlas: GlyphAtlas;
  private rows = 90;
  private aspect = 1.7;

  constructor(private store: Store) {
    const glyphs = glyphsFor(store.get().glyphSet, store.get().customText);
    this.atlas = buildAtlas(glyphs, 96, mirrorFor(store.get().glyphSet));

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      // NormalBlending keeps the background truly black: dim trail cells have
      // low alpha and let the black show through, instead of additively piling
      // up into a green haze like AdditiveBlending did.
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uRows: { value: this.rows },
        uGlyphSize: { value: 0.62 },
        uFallCells: { value: 14 },
        uTrail: { value: 22 },
        uFlicker: { value: 0.18 },
        uScramble: { value: 7 },
        uGlyphCount: { value: this.atlas.count },
        uAtlasCols: { value: this.atlas.cols },
        uAtlasRows: { value: this.atlas.rows },
        uHalfFlow: { value: 0 },
        uFlowVec: { value: new THREE.Vector2(0, -1) },
        uCrossVec: { value: new THREE.Vector2(1, 0) },
        uFogNear: { value: 6 },
        uFogFar: { value: 120 },
        uBrightness: { value: 1 },
        uWaveX: { value: 0 },
        uWaveY: { value: 0 },
        uAtlas: { value: this.atlas.texture },
        uHeadColor: { value: new THREE.Color(1, 1, 1) },
        uTrailColor: { value: new THREE.Color(0, 1, 0.3) },
        uColorMode: { value: 0 },
      },
    });

    this.applyConfig();
  }

  // Rebuild the glyph atlas (when the glyph set / custom text changes).
  rebuildAtlas() {
    const c = this.store.get();
    this.atlas.texture.dispose();
    this.atlas = buildAtlas(glyphsFor(c.glyphSet, c.customText), 96, mirrorFor(c.glyphSet));
    this.material.uniforms.uAtlas.value = this.atlas.texture;
    this.material.uniforms.uGlyphCount.value = this.atlas.count;
    this.material.uniforms.uAtlasCols.value = this.atlas.cols;
    this.material.uniforms.uAtlasRows.value = this.atlas.rows;
  }

  // (Re)generate the instanced field. Called on start, density change, resize.
  rebuild(aspect: number) {
    this.aspect = aspect;
    const c = this.store.get();
    const glyphSize = c.glyphSize;

    // Size the volume so columns fill the frustum out to `depth`.
    const maxDist = c.depth + 18;
    const vFov = (55 * Math.PI) / 180;
    const worldH = 2 * Math.tan(vFov / 2) * maxDist;
    const worldW = worldH * aspect;

    // Orient the field along the chosen direction: rain travels along the
    // "flow" axis, columns spread along the perpendicular "cross" axis.
    const horizontal = c.direction === "left" || c.direction === "right";
    const flowExtent = horizontal ? worldW : worldH;
    const crossExtent = horizontal ? worldH : worldW;
    this.rows = Math.max(40, Math.ceil((flowExtent * 1.15) / glyphSize));
    const crossHalf = crossExtent * 0.62;

    const flow =
      c.direction === "down" ? [0, -1] :
      c.direction === "up" ? [0, 1] :
      c.direction === "right" ? [1, 0] : [-1, 0];
    const cross = horizontal ? [0, 1] : [1, 0];

    const numCols = Math.max(50, Math.round(c.density));
    const total = numCols * this.rows;

    const aCross = new Float32Array(total);
    const aColZ = new Float32Array(total);
    const aRow = new Float32Array(total);
    const aSeed = new Float32Array(total);
    const aSpeed = new Float32Array(total);
    const aDim = new Float32Array(total);

    let i = 0;
    for (let col = 0; col < numCols; col++) {
      const crossPos = (Math.random() * 2 - 1) * crossHalf;
      // Bias columns toward the camera so the near field stays dense.
      const z = -Math.pow(Math.random(), 1.5) * c.depth;
      const seed = Math.random();
      // ~3% of columns "surge": brighter, heavier, faster — breaks the monotony.
      const surge = Math.random() < 0.03;
      const speed = surge ? 1.7 + Math.random() * 0.8 : 0.5 + Math.random() * 1.0;
      const dim = surge ? 1.25 : 0.4 + Math.random() * 0.5;
      for (let r = 0; r < this.rows; r++) {
        aCross[i] = crossPos;
        aColZ[i] = z;
        aRow[i] = r;
        aSeed[i] = seed;
        aSpeed[i] = speed;
        aDim[i] = dim;
        i++;
      }
    }

    const base = new THREE.PlaneGeometry(1, 1);
    const geom = new THREE.InstancedBufferGeometry();
    geom.index = base.index;
    geom.attributes.position = base.attributes.position;
    geom.attributes.uv = base.attributes.uv;
    geom.instanceCount = total;
    geom.setAttribute("aCross", new THREE.InstancedBufferAttribute(aCross, 1));
    geom.setAttribute("aColZ", new THREE.InstancedBufferAttribute(aColZ, 1));
    geom.setAttribute("aRow", new THREE.InstancedBufferAttribute(aRow, 1));
    geom.setAttribute("aSeed", new THREE.InstancedBufferAttribute(aSeed, 1));
    geom.setAttribute("aSpeed", new THREE.InstancedBufferAttribute(aSpeed, 1));
    geom.setAttribute("aDim", new THREE.InstancedBufferAttribute(aDim, 1));
    // Huge bounding sphere so the field is never frustum-culled.
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -c.depth / 2), maxDist * 2);

    if (this.mesh) {
      this.group.remove(this.mesh);
      this.geom?.dispose();
    }
    const mesh = new THREE.Mesh(geom, this.material) as unknown as THREE.InstancedMesh;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.mesh = mesh;
    this.geom = geom;

    this.material.uniforms.uRows.value = this.rows;
    this.material.uniforms.uHalfFlow.value = (this.rows * glyphSize) / 2;
    this.material.uniforms.uFlowVec.value.set(flow[0], flow[1]);
    this.material.uniforms.uCrossVec.value.set(cross[0], cross[1]);
    this.material.uniforms.uGlyphSize.value = glyphSize;
    this.material.uniforms.uFogFar.value = maxDist;
  }

  // Push current config into shader uniforms (cheap, every relevant UI change).
  applyConfig() {
    const c = this.store.get();
    const t = this.store.theme();
    const u = this.material.uniforms;
    u.uFallCells.value = c.fallSpeed / c.glyphSize;
    u.uTrail.value = c.trailLength;
    u.uFlicker.value = c.flicker;
    u.uScramble.value = c.scrambleRate;
    u.uBrightness.value = c.brightness;
    u.uWaveX.value = c.waveX * 6.0;
    u.uWaveY.value = c.waveY * 6.0;
    u.uHeadColor.value.setRGB(t.head[0], t.head[1], t.head[2]);
    u.uTrailColor.value.setRGB(t.trail[0], t.trail[1], t.trail[2]);
    u.uColorMode.value = t.mode === "thermal" ? 1 : t.mode === "holo" ? 2 : 0;
  }

  // Audio-reactive pulse: bass drives fall speed, overall level lifts brightness.
  setPulse(bass: number, level: number) {
    const c = this.store.get();
    this.material.uniforms.uFallCells.value = (c.fallSpeed / c.glyphSize) * (1 + bass * 0.7);
    this.material.uniforms.uBrightness.value = c.brightness * (1 + level * 0.35);
  }

  update(elapsed: number) {
    if (!this.store.get().paused) {
      this.material.uniforms.uTime.value = elapsed;
    }
  }

  dispose() {
    this.geom?.dispose();
    this.material.dispose();
    this.atlas.texture.dispose();
  }
}
