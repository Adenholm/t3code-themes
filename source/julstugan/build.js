// "Julstugan" — Christmas version of Pixelstugan: same cottage, plus a lit spruce, advent candles,
// a paper star, wreath, tomte, snowman and sled.
// Renders a 360x240 base image (PNG, no deps) + an animated pixel overlay SVG + theme CSS/JSON.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const OUT = __dirname;
const W = 360, H = 240;
const SHIFT = 32; // moves the cottage right, away from the chat column

// ---------- utils ----------
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const R = (a, b) => a + rnd() * (b - a);
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, o = 4) => { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); n += a; a *= 0.5; f *= 2; } return s / n; };

const img = Array.from({ length: W * H }, () => [0, 0, 0]);
const mat = new Uint8Array(W * H); // 0 air/fog 1 trunk 2 snow 3 house 4 bush 5 emissive 6 canopy
const get = (x, y) => img[y * W + x];
let OX = 0;
function put(x, y, c, m, a = 1) {
  x = Math.round(x + OX); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = y * W + x;
  img[i] = a >= 1 ? c.slice() : mix(img[i], c, a);
  if (m !== undefined) mat[i] = m;
}
function rect(x0, y0, x1, y1, c, m) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, typeof c === 'function' ? c(x, y) : c, m); }
function poly(pts, c, m) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++)
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) put(x, y, typeof c === 'function' ? c(x, y) : c, m);
    }
}
function line(x0, y0, x1, y1, c, m) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) put(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, typeof c === 'function' ? c(i / n) : c, m);
}

// ---------- palette ----------
const C = {
  skyTop: hex('#071014'), skyMid: hex('#123039'), fogGlow: hex('#3f7280'), fogLow: hex('#163640'),
  farTrunk: hex('#2a434b'), farCanopy: hex('#1a2d33'), farSnow: hex('#4d6b73'),
  midTrunk: hex('#12161a'), midTrunkRim: hex('#2c3f47'), midCanopy: hex('#0c171b'), midSnow: hex('#56767f'),
  nearTrunk: hex('#050608'), nearRim: hex('#1a272d'),
  snow: hex('#2c5263'), snowLight: hex('#6f9cac'), snowShade: hex('#142a36'),
  log: hex('#3d2516'), logHi: hex('#56351f'), logLo: hex('#24150c'),
  roofSnow: hex('#8fb0bb'), roofSnowShade: hex('#5b7c88'), fascia: hex('#1a1210'),
  stone: hex('#2a2c30'), win: hex('#ffcf73'), winEdge: hex('#e9862f'), winCore: hex('#fff0b8'),
  bush: hex('#17201a'), warm: [255, 150, 62],
};
const GROUND = (x) => 186 + Math.round(2 * Math.sin(x / 37) + 1.5 * Math.sin(x / 13 + 2));

// ---------- 1. sky / fog ----------
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const t = y / H;
  let c = t < 0.55 ? mix(C.skyTop, C.skyMid, t / 0.55) : mix(C.skyMid, C.fogLow, (t - 0.55) / 0.45);
  const dx = (x - 205 - SHIFT) / 120, dy = (y - 95) / 80;
  c = mix(c, C.fogGlow, 0.75 * Math.exp(-(dx * dx + dy * dy) * 1.6));
  // faint moonbeams through the canopy
  const beam = ((x - y * 0.45) % 46 + 46) % 46;
  if (beam < 7 && y < 170) c = mix(c, C.fogGlow, 0.07 * (1 - y / 170));
  c = mix(c, C.fogGlow, (fbm(x / 40, y / 25, 3) - 0.5) * 0.25);
  put(x, y, c, 0);
}

// ---------- 2. far forest ----------
for (let i = 0; i < 46; i++) {
  const x0 = R(-5, W), w = Math.round(R(2, 5)), lean = R(-0.03, 0.03);
  for (let y = 0; y < GROUND(x0) + 4; y++) for (let k = 0; k < w; k++) {
    const x = x0 + k + lean * y;
    const fogT = 0.25 + 0.5 * Math.exp(-(((x - 205) / 90) ** 2));
    put(x, y, mix(mix(C.farTrunk, hex('#1f3138'), k / w), get(Math.round(clamp(x, 0, W - 1)), y), fogT), 1);
  }
}
for (let y = 0; y < 90; y++) for (let x = 0; x < W; x++) {
  const n = fbm(x / 16, y / 9, 4), th = 0.42 + (y / 90) * 0.28;
  if (n > th) {
    const top = fbm(x / 16, (y - 1) / 9, 4) <= th + (y - 1) / 90 * 0;
    let c = mix(C.farCanopy, get(x, y), 0.35);
    if (top || hash(x, y) > 0.95) c = mix(C.farSnow, c, 0.3);
    put(x, y, c, 6);
  }
}

// ---------- 3. mid forest ----------
const midTrunks = [];
for (let x0 = -4; x0 < W; x0 += R(18, 34)) {
  if (x0 > 150 + SHIFT && x0 < 252 + SHIFT && rnd() < 0.7) continue;
  midTrunks.push(x0);
  const w = Math.round(R(4, 8));
  for (let y = 0; y < GROUND(x0) + 1; y++) for (let k = 0; k < w; k++) {
    const x = Math.round(x0 + k);
    let c = mix(C.midTrunk, hex('#1b2228'), vnoise(x / 4, y / 14) * 0.6);
    if (k === 0) c = C.midTrunkRim;
    if (k === w - 1) c = mix(C.midTrunk, C.midTrunkRim, 0.35);
    put(x, y, c, 1);
  }
  // a few snowy branches
  for (let b = 0; b < 3; b++) {
    const by = Math.round(R(25, 110)), dir = rnd() < 0.5 ? -1 : 1, len = Math.round(R(8, 20));
    const bx = dir < 0 ? x0 : x0 + w - 1;
    for (let i = 0; i < len; i++) {
      const x = bx + dir * i, y = by - Math.round(i * 0.55);
      put(x, y, C.midTrunk, 1); put(x, y + 1, C.midTrunk, 1);
      if (rnd() < 0.75) put(x, y - 1, C.midSnow, 2);
    }
  }
}
for (let y = 0; y < 70; y++) for (let x = 0; x < W; x++) {
  const n = fbm(x / 14 + 40, y / 8 + 7, 4), th = 0.4 + (y / 70) * 0.35;
  if (n > th) {
    let c = mix(C.midCanopy, hex('#14232a'), vnoise(x / 7, y / 5) * 0.6);
    const above = fbm(x / 14 + 40, (y - 1) / 8 + 7, 4) > 0.4 + ((y - 1) / 70) * 0.35;
    if (!above || hash(x + 3, y) > 0.97) c = C.midSnow;
    put(x, y, c, 6);
  }
}

// ---------- 4. ground ----------
for (let x = 0; x < W; x++) for (let y = GROUND(x); y < H; y++) {
  const depth = (y - 186) / (H - 186);
  let c = mix(C.snow, C.snowShade, clamp(depth * 0.9 + (fbm(x / 40, y / 10, 2) - 0.5) * 0.3));
  if (y === GROUND(x)) c = mix(C.snowLight, c, 0.3);
  if (hash(x, y) > 0.997) c = C.snowLight;
  put(x, y, c, 2);
}
OX = SHIFT;
// path from the porch towards the viewer
const pathC = (y) => { const t = (y - 191) / (H - 191); return [214 - 58 * Math.pow(t, 1.25) + 4 * Math.sin(t * 5), 3 + 18 * t]; };
for (let y = 191; y < H; y++) {
  const [cx, hw] = pathC(y);
  for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
    const e = Math.abs(x - cx) / hw;
    if (e > 1) continue;
    let c = mix(hex('#24394a'), hex('#2d4656'), fbm(x / 4, y / 2, 2));
    if (e > 0.82) c = mix(c, C.snowLight, 0.35);
    put(x, y, c, 2);
  }
}

// ---------- 5. cottage ----------
const logs = (x, y) => (y % 3 === 0 ? C.logLo : y % 3 === 1 ? mix(C.logHi, C.log, vnoise(x / 3, y)) : C.log);
// side wall (receding, left) — slightly darker
rect(160, 161, 199, 188, (x, y) => mix(logs(x, y), hex('#120a06'), 0.35), 3);
// front gable wall
rect(200, 160, 244, 188, logs, 3);
poly([[199, 160.5], [222, 138], [245, 160.5]], (x, y) => mix(logs(x, y), C.logLo, 0.15), 3);
// log ends at the corner
for (let y = 161; y < 189; y += 3) { put(199, y, hex('#6b4428'), 3); put(200, y, hex('#4a2e1a'), 3); }
// foundation
rect(158, 189, 246, 190, (x) => (x % 5 === 0 ? hex('#1b1c20') : C.stone), 3);
// roof plane over the side wall, covered in snow
poly([[183, 136], [222, 134], [197, 162], [154, 164]], (x, y) => {
  const t = clamp((y - 134) / 30);
  let c = mix(C.roofSnow, C.roofSnowShade, t * 0.8 + (fbm(x / 5, y / 3, 2) - 0.5) * 0.5);
  return c;
}, 3);
// roof edge / fascia along the gable, with snow lip
line(222, 134, 197, 161, C.fascia, 3); line(222, 135, 197, 162, C.fascia, 3);
line(222, 134, 248, 162, C.fascia, 3); line(222, 135, 248, 163, C.fascia, 3);
line(222, 133, 196, 160, C.roofSnow, 3); line(222, 133, 249, 161, mix(C.roofSnow, C.roofSnowShade, 0.4), 3);
line(155, 165, 197, 163, C.fascia, 3);
for (let x = 156; x < 197; x++) if (hash(x, 7) > 0.55) put(x, 166, C.roofSnowShade, 3); // drips of snow
// icicles under the eave
for (let x = 158; x < 196; x += 4) { const l = Math.round(R(1, 4)); for (let k = 0; k < l; k++) put(x, 166 + k, hex('#a8c4cc'), 3, 0.7); }
// chimney
rect(170, 124, 177, 146, (x, y) => ((y + (x > 173 ? 1 : 0)) % 3 === 0 ? hex('#1c1718') : hex('#3a2c2a')), 3);
rect(169, 122, 178, 123, C.roofSnow, 3);
// windows
function windowAt(x0, y0, w, h, dim = 0, muntins = true) {
  rect(x0 - 1, y0 - 1, x0 + w, y0 + h, C.fascia, 3);
  rect(x0, y0, x0 + w - 1, y0 + h - 1, (x, y) => {
    const d = Math.hypot((x - (x0 + w / 2)) / (w / 2), (y - (y0 + h / 2)) / (h / 2));
    return mix(mix(C.winCore, C.win, clamp(d)), C.winEdge, clamp(d - 0.6)).map((v) => v * (1 - dim));
  }, 5);
  const mx = x0 + Math.floor(w / 2), my = y0 + Math.floor(h / 2);
  if (muntins) {
    for (let y = y0; y < y0 + h; y++) put(mx, y, C.fascia, 3);
    for (let x = x0; x < x0 + w; x++) put(x, my, C.fascia, 3);
  }
  rect(x0 - 2, y0 + h + 1, x0 + w + 1, y0 + h + 1, C.roofSnow, 3); // snowy sill
}
const RED = hex('#c8343a'), REDHI = hex('#e8574f'), REDLO = hex('#7e1c22');
const STAR = hex('#ff7448'), STARCORE = hex('#ffd2a0');
// a paper advent star (red, glowing) hanging in a window: plus arms + diagonals + a short tail
function paperStar(cx, cy, big) {
  const px = big
    ? [[0, -2], [0, -1], [-1, -1], [1, -1], [-2, 0], [-1, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]
    : [[0, -1], [-1, 0], [1, 0], [0, 1]];
  for (const [dx, dy] of px) put(cx + dx, cy + dy, STAR, 5);
  put(cx, cy, STARCORE, 5);
  put(cx, cy - (big ? 3 : 2), C.fascia, 3); // string
  put(cx, cy + (big ? 3 : 2), mix(STAR, C.fascia, 0.4), 5); // tail
}
// big window: no muntins, dimmer room, a seven-armed advent candlestick on the sill
windowAt(225, 166, 15, 10, 0.3, false);
for (let x = 226; x <= 238; x++) {
  const sy = 172 + Math.floor(Math.abs(x - 232) / 2);
  for (let y = sy; y <= 175; y++) put(x, y, hex('#2a1509'), 3);
}
for (let j = -3; j <= 3; j++) {
  const x = 232 + 2 * j, sy = 172 + Math.floor(Math.abs(2 * j) / 2);
  put(x, sy - 1, hex('#efe2c4'), 5); put(x, sy - 2, hex('#efe2c4'), 5); put(x, sy - 3, hex('#fff7d6'), 5);
}
windowAt(166, 168, 9, 8, 0.3, false);
paperStar(170, 171, false);
windowAt(183, 168, 9, 8, 0.1);
windowAt(218, 145, 7, 7, 0.55, false);
paperStar(221, 148, true);
// door with a wreath
rect(206, 171, 216, 188, hex('#2a170c'), 3);
rect(207, 172, 215, 188, (x, y) => (x % 3 === 0 ? hex('#3c2414') : hex('#4b2d19')), 3);
for (let y = 173; y <= 181; y++) for (let x = 207; x <= 215; x++) {
  const d = Math.hypot(x - 211, y - 177);
  if (d < 3.6 && d > 1.6) put(x, y, hash(x, y) > 0.6 ? hex('#3a7a42') : hash(x, y) > 0.2 ? hex('#245a30') : hex('#163d20'), 3);
}
put(209, 175, RED, 3); put(213, 178, RED, 3); put(212, 174, RED, 3);
put(210, 180, REDHI, 3); put(212, 180, REDHI, 3); put(211, 181, RED, 3); put(210, 182, REDLO, 3); put(212, 182, REDLO, 3); // bow
put(214, 183, hex('#d9a441'), 5);
// pine garland over the door with a red bow
for (let x = 204; x <= 218; x++) { const y = 169 + (Math.abs(x - 211) < 4 ? 1 : 0); put(x, y, hash(x, 3) > 0.5 ? hex('#2d6a38') : hex('#1b4626'), 3); if (hash(x, 5) > 0.5) put(x, y + 1, hex('#163d20'), 3); }
put(210, 170, REDHI, 3); put(212, 170, REDHI, 3); put(211, 171, RED, 3);
// porch steps
rect(203, 189, 219, 189, hex('#3a2a20'), 3); rect(201, 190, 221, 190, hex('#2b1f18'), 3);
rect(201, 189, 221, 189, (x) => (hash(x, 1) > 0.5 ? C.roofSnow : hex('#3a2a20')), 3);
// lantern post by the path
rect(253, 176, 253, 192, hex('#0d0b0c'), 3);
rect(251, 172, 255, 176, hex('#ffd27a'), 5); rect(251, 171, 255, 171, hex('#0d0b0c'), 3); rect(252, 170, 254, 170, C.roofSnow, 3);
// woodpile by the side wall
for (let y = 180; y < 189; y += 2) for (let x = 146; x < 158; x += 2) { put(x, y, hex('#6b4a33'), 3); put(x + 1, y, hex('#2a1a10'), 3); put(x, y + 1, hex('#2a1a10'), 3); put(x + 1, y + 1, hex('#4a3020'), 3); }
rect(145, 179, 158, 179, C.roofSnow, 3);
bush(192, 190, 9, 4); bush(232, 191, 11, 4); bush(246, 189, 6, 4); bush(171, 191, 9, 3); bush(140, 192, 10, 4); bush(292, 193, 10, 5); bush(118, 194, 8, 4); bush(208, 197, 4, 2);
// red bow on the lantern post
put(252, 178, REDHI, 3); put(254, 178, REDHI, 3); put(253, 179, RED, 3); put(252, 180, REDLO, 3); put(254, 180, REDLO, 3);

// the Christmas spruce to the right of the cottage
const TCX = 272, TTOP = 142, TBASE = 188;
const treeHW = (y) => {
  if (y < TTOP || y > TBASE) return -1;
  const t = (y - TTOP) / (TBASE - TTOP), k = Math.min(4, Math.floor(t * 5)), f = t * 5 - k;
  return (1.5 + 13 * t) * (0.58 + 0.42 * f);
};
const inTree = (x, y) => Math.abs(x - TCX) <= treeHW(y);
rect(TCX - 1, TBASE - 2, TCX + 1, TBASE + 2, hex('#2a1a10'), 3);
for (let y = TTOP; y <= TBASE; y++) for (let x = TCX - 16; x <= TCX + 16; x++) {
  if (!inTree(x, y)) continue;
  const side = (x - TCX) / (treeHW(y) + 1); // -1 left (lit side) .. 1 right
  let c = mix(hex('#1d3a26'), hex('#0b1a12'), clamp(0.45 + side * 0.4 + (fbm(x / 3, y / 2, 2) - 0.5) * 0.7));
  if (!inTree(x, y - 1) || !inTree(x, y - 2) && hash(x, y) > 0.35) c = mix(C.snowLight, C.roofSnowShade, clamp(0.3 + side * 0.4));
  put(x, y, c, 8);
}
// baubles
for (let i = 0; i < 14; i++) {
  const y = Math.round(R(TTOP + 8, TBASE - 3)), hw = treeHW(y) - 1.5, x = Math.round(TCX + R(-hw, hw));
  put(x, y, i % 3 === 2 ? hex('#d9a441') : RED, 3); put(x, y + 1, i % 3 === 2 ? hex('#8a6320') : REDLO, 3);
}
// star on top
for (const [dx, dy] of [[0, -3], [0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [1, 1]]) put(TCX + dx, TTOP - 1 + dy, hex('#ffd76a'), 5);
put(TCX, TTOP - 1, hex('#fff6d0'), 5);

// a little tomte by the porch with a lantern
{
  const tx = 223, ty = 192;
  const H_ = hex('#c8343a'), Hd = hex('#8e2228'), B = hex('#e9e4da'), N = hex('#e6a08a'), G = hex('#5b6066'), Gd = hex('#3c4046'), K = hex('#151214');
  const px = [
    [2, 0, Hd], [2, 1, H_], [1, 2, H_], [2, 2, H_], [1, 3, H_], [2, 3, H_], [3, 3, Hd], [0, 4, H_], [1, 4, H_], [2, 4, H_], [3, 4, Hd], [4, 4, Hd],
    [1, 5, B], [2, 5, N], [3, 5, B], [1, 6, B], [2, 6, B], [3, 6, B],
    [0, 7, G], [1, 7, G], [2, 7, B], [3, 7, Gd], [4, 7, Gd], [0, 8, G], [1, 8, G], [2, 8, G], [3, 8, Gd], [4, 8, Gd],
    [1, 9, K], [3, 9, K], [5, 7, hex('#0d0b0c')],
  ];
  for (const [dx, dy, c] of px) put(tx + dx, ty + dy, c, 3);
  put(tx + 5, ty + 8, hex('#ffd27a'), 5);
}

// snowman in the front yard, beside the path (smaller, lit like the walls so it doesn't blow out)
{
  const sx = 182, K = hex('#101216');
  const ball = (cy, r) => { for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(sx - r - 1); x <= sx + r + 1; x++) {
    const d = Math.hypot(x - sx, y - cy) / (r + 0.5); if (d > 1) continue;
    put(x, y, mix(hex('#8fb3c0'), hex('#34566a'), clamp(0.2 + (x - sx) / (r + 1) * 0.45 + (y - cy) / (r + 1) * 0.3)), 3);
  } };
  ball(207, 3); ball(201.5, 2.2); ball(197, 1.6);
  put(sx - 1, 196, K, 3); put(sx + 1, 196, K, 3);
  put(sx - 1, 197, hex('#e8782a'), 3); put(sx - 2, 197, hex('#c45a1c'), 3); // carrot
  for (let x = sx - 2; x <= sx + 2; x++) put(x, 199, x > sx ? REDLO : RED, 3); put(sx + 2, 200, REDLO, 3); // scarf
  put(sx, 202, K, 3); put(sx, 205, K, 3);
  line(sx - 3, 201, sx - 6, 198, hex('#2e1e12'), 3); line(sx + 3, 201, sx + 6, 199, hex('#2e1e12'), 3);
  for (let x = sx - 2; x <= sx + 2; x++) put(x, 195, K, 3); // hat brim
  rect(sx - 1, 192, sx + 1, 194, K, 3); put(sx - 1, 194, REDLO, 3); put(sx, 194, REDLO, 3); put(sx + 1, 194, REDLO, 3);
}

// bushes hugging the cottage
function bush(cx, cy, rx, ry) {
  for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (fbm(x / 3, y / 3, 2) - 0.5) * 0.9;
    if (d < 1) put(x, y, mix(C.bush, hex('#2b3324'), fbm(x / 4, y / 3, 2) * 0.45), 4);
    else if (d < 1.15 && y < cy) put(x, y, C.snowLight, 2);
  }
}


OX = 0;
// ---------- 6. near trunks & canopy (frame) ----------
function nearTrunk(x0, w, rimRight) {
  for (let y = 0; y < H; y++) for (let k = 0; k < w; k++) {
    const x = x0 + k + Math.round(Math.sin(y / 50) * 1.5);
    let c = mix(C.nearTrunk, hex('#0d0f12'), vnoise(x / 5, y / 14) * 0.6);
    if ((rimRight && k === w - 1) || (!rimRight && k === 0)) c = C.nearRim;
    put(x, y, c, 1);
    if (hash(x, y) > 0.998) put(x, y, C.snowShade, 2);
  }
}
nearTrunk(-4, 20, true); nearTrunk(27, 7, true); nearTrunk(338, 26, false); nearTrunk(316, 8, false);
for (let y = 0; y < 34; y++) for (let x = 0; x < W; x++) {
  const n = fbm(x / 20 + 90, y / 7, 4), th = 0.45 + (y / 34) * 0.4 - (x < 60 || x > 300 ? 0.12 : 0);
  if (n > th) {
    let c = mix(hex('#04080a'), hex('#0b1417'), vnoise(x / 7, y / 5) * 0.6);
    const above = fbm(x / 20 + 90, (y - 1) / 7, 4) > 0.45 + ((y - 1) / 34) * 0.4 - (x < 60 || x > 300 ? 0.12 : 0);
    if ((!above && y > 0) || hash(x, y + 9) > 0.98) c = hex('#3c5862');
    put(x, y, c, 6);
  }
}
// foreground shrubs along the bottom
for (let x = 0; x < W; x++) {
  const top = 216 + Math.round(fbm(x / 7, 3, 3) * 26 - 6 + 6 * Math.sin(x / 23)) + (x > 115 + SHIFT && x < 225 + SHIFT ? 16 : 0);
  for (let y = top; y < H; y++) {
    let c = mix(hex('#050a0d'), hex('#10201f'), fbm(x / 8, y / 5, 2) * 0.55);
    if (y - top < 2 && hash(x, y) > 0.1) c = mix(hex('#5d8494'), hex('#2c4a56'), y - top);
    else if (hash(x * 3, y) > 0.995) c = hex('#36525e');
    put(x, y, c, 7);
  }
}

// ---------- 7. lighting ----------
const lights0 = [
  [232, 171, 26, 1.0], [212, 176, 18, 0.25], [211, 186, 22, 0.45], [170, 172, 14, 0.5], [187, 172, 14, 0.5],
  [221, 148, 10, 0.4], [272, 165, 24, 0.45], [272, 140, 9, 0.35], [228, 200, 7, 0.22], [253, 174, 24, 0.9], [232, 190, 34, 0.6], [212, 182, 80, 0.16],
];
const gainBy = [0.3, 0.6, 0.85, 0.3, 1.3, 0, 0.3, 0.25, 0.7];
const lights = lights0.map(([x, y, r, s]) => [x + SHIFT, y, r, s]);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x, m = mat[i];
  if (m === 5) continue;
  let L = 0;
  for (const [lx, ly, r, s] of lights) { const d2 = ((x - lx) ** 2 + (y - ly) ** 2) / (r * r); L += s / (1 + d2 * 1.6); }
  // windows facing the viewer light the snow in front of them more
  const g = gainBy[m] * (m === 2 && y > 186 ? 1.25 : 1);
  const c = img[i];
  const lum = (c[0] + c[1] + c[2]) / 765;
  const k = L * g * (0.5 + lum * 1.5);
  img[i] = [c[0] + C.warm[0] * k * 0.62, c[1] + C.warm[1] * k * 0.62, c[2] + C.warm[2] * k * 0.62];
}
// vignette
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const d = Math.hypot((x - 205 - SHIFT / 2) / 230, (y - 150) / 170);
  const v = clamp(1 - Math.max(0, d - 0.55) * 0.9, 0.45, 1);
  img[y * W + x] = img[y * W + x].map((c) => c * v * (mat[y * W + x] === 5 ? 1 : 0.82));
}
// warm colour grade: pull the cold teal night towards a neutral, slightly warm dusk (emissive pixels untouched)
const WARM = 0.8;
for (let i = 0; i < W * H; i++) {
  if (mat[i] === 5) continue;
  const [r, g, b] = img[i];
  const w = [(0.9 * r + 0.3 * b) * 1.1, (0.82 * g + 0.06 * r + 0.03 * b), (0.68 * b + 0.1 * g) * 0.92];
  img[i] = mix(img[i], w, WARM);
}

// ---------- 8. posterize with ordered dither ----------
const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const LV = 40;
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    const th = (bayer[(y % 4) * 4 + (x % 4)] + 0.5) / 16 - 0.5;
    const c = img[y * W + x];
    for (let k = 0; k < 3; k++) {
      const v = clamp(c[k] / 255) * (LV - 1);
      const q = clamp(Math.round(v + th * 0.45), 0, LV - 1) / (LV - 1);
      raw[y * (W * 3 + 1) + 1 + x * 3 + k] = Math.round(q * 255);
    }
  }
}
// ---------- PNG ----------
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]); };
function filterRows(raw) {
  const st = W * 3 + 1, out = Buffer.alloc(raw.length);
  for (let y = 0; y < H; y++) {
    let best = null, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const row = Buffer.alloc(st); row[0] = f; let sum = 0;
      for (let i = 1; i < st; i++) {
        const x = raw[y * st + i], a = i > 3 ? raw[y * st + i - 3] : 0, b = y ? raw[(y - 1) * st + i] : 0, c = y && i > 3 ? raw[(y - 1) * st + i - 3] : 0;
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pr = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
        row[i] = (x - pr) & 255; sum += row[i] < 128 ? row[i] : 256 - row[i];
      }
      if (sum < bestSum) { bestSum = sum; best = row; }
    }
    best.copy(out, y * st);
  }
  return out;
}
// reduce to a 256-colour palette (weighted k-means) and store as an indexed PNG
const counts = new Map();
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = y * (W * 3 + 1) + 1 + x * 3; const k = raw[o] << 16 | raw[o + 1] << 8 | raw[o + 2]; counts.set(k, (counts.get(k) || 0) + 1); }
const cols = [...counts].map(([k, n]) => [k >> 16, (k >> 8) & 255, k & 255, n]);
let cent = cols.slice().sort((a, b) => b[3] - a[3]).slice(0, 256).map((c) => c.slice(0, 3));
const near = (c) => { let bi = 0, bd = Infinity; cent.forEach((p, i) => { const d = (p[0] - c[0]) ** 2 * 0.3 + (p[1] - c[1]) ** 2 * 0.59 + (p[2] - c[2]) ** 2 * 0.11; if (d < bd) { bd = d; bi = i; } }); return bi; };
for (let it = 0; it < 12; it++) {
  const acc = cent.map(() => [0, 0, 0, 0]);
  for (const c of cols) { const a = acc[near(c)]; a[0] += c[0] * c[3]; a[1] += c[1] * c[3]; a[2] += c[2] * c[3]; a[3] += c[3]; }
  cent = cent.map((p, i) => (acc[i][3] ? [acc[i][0] / acc[i][3], acc[i][1] / acc[i][3], acc[i][2] / acc[i][3]] : p));
}
cent = cent.map((p) => p.map(Math.round));
const lut = new Map(cols.map((c) => [c[0] << 16 | c[1] << 8 | c[2], near(c)]));
const idx = Buffer.alloc((W + 1) * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = y * (W * 3 + 1) + 1 + x * 3; idx[y * (W + 1) + 1 + x] = lut.get(raw[o] << 16 | raw[o + 1] << 8 | raw[o + 2]); }
const plte = Buffer.from(cent.flat());
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 3;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('IDAT', zlib.deflateSync(idx, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync(path.join(OUT, 'julstugan.png'), png);

// ---------- 9. animated overlay (same 360x240 grid) ----------
let o = '';
const rc = (x, y, w, h, fill, extra = '') => `<rect x='${x}' y='${y}' width='${w}' height='${h}'${fill ? ` fill='${fill}'` : ''}${extra}/>`;

o += `<g transform='translate(${SHIFT} 0)'>`;
// window glow flicker
o += `<g class='fl'>${rc(225, 166, 15, 5, '#fff2c4', " opacity='.12'")}
${rc(222, 162, 20, 18, '#ffb35c', " opacity='.07'")}${rc(220, 188, 26, 5, '#ffb35c', " opacity='.12'")}${rc(203, 189, 18, 4, '#ffb35c', " opacity='.1'")}</g>`;
o += `<g class='fl f2'>${rc(183, 168, 9, 8, '#fff2c4', " opacity='.25'")}${rc(162, 165, 34, 14, '#ffb35c', " opacity='.05'")}</g>`;
o += `<g class='fl f3'>${rc(251, 172, 5, 5, '#fff6d0', " opacity='.5'")}${rc(247, 168, 13, 13, '#ffb35c', " opacity='.08'")}${rc(244, 186, 20, 5, '#ffb35c', " opacity='.1'")}</g>`;

// string lights: [x0,y0,x1,y1,sag,spacing]
const strands = [
  [196, 160, 222, 132, 0, 3], [222, 132, 249, 160, 0, 3], [155, 164, 196, 162, 3, 4],
  [201, 163, 244, 163, 3, 3], [88, 150, 155, 164, 6, 4], [2, 128, 88, 150, 12, 5],
];
// garlands wound around the spruce, left edge to right edge, sloping down
for (const yL of [150, 159, 168, 177]) {
  const yR = yL + 5;
  strands.push([Math.round(TCX - treeHW(yL) + 1), yL - 1, Math.round(TCX + treeHW(yR) - 1), yR - 1, 1, 3]);
}
const bulbCols = ['#ffd27a', '#ffc65c', '#ffe09a', '#ffcc66'];
let bi = 0, bulbs = '';
const wirePx = new Set();
const plot = (x0, y0, x1, y1) => { let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy; for (;;) { wirePx.add(x0 + ',' + y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } };
for (const [x0, y0, x1, y1, sag, sp] of strands) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + sag * 2;
  const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / sp));
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const x = Math.round(u * u * x0 + 2 * u * t * cx + t * t * x1), y = Math.round(u * u * y0 + 2 * u * t * cy + t * t * y1) + 1;
    if (prev) plot(prev[0], prev[1], x, y);
    prev = [x, y];
    if (i === 0 || i === n) continue;
    const col = bulbCols[bi % bulbCols.length];
    bulbs += `<g class='t${bi % 5}'>${rc(x - 1, y, 3, 2, col, " opacity='.28'")}${rc(x, y - 1 + 1, 1, 2, col)}${rc(x, y + 3, 1, 1, col, " opacity='.15'")}</g>`;
    bi++;
  }
}
// the wire as whole pixels, merged into horizontal runs
const rows = new Map();
for (const p of wirePx) { const [x, y] = p.split(',').map(Number); if (!rows.has(y)) rows.set(y, []); rows.get(y).push(x); }
let wd = '';
for (const [y, xs] of rows) { xs.sort((a, b) => a - b); let st = xs[0], pv = xs[0]; for (const x of [...xs.slice(1), Infinity]) { if (x === pv + 1) { pv = x; continue; } wd += `M${st} ${y}h${pv - st + 1}v1h-${pv - st + 1}z`; st = pv = x; } }
o += `<path d='${wd}' fill='#08090b' opacity='.75'/>${bulbs}`;

// chimney smoke: pixel puffs drifting right and up, warm-lit near the chimney
let smoke = '';
const puff = (s) => `${rc(0, 0, 3 * s, 2 * s)}${rc(-1 * s, 1 * s, 5 * s, 2 * s)}${rc(0, 3 * s, 3 * s, 1 * s)}`;
for (let i = 0; i < 6; i++) {
  const d = -(i * 2.2).toFixed(1);
  smoke += `<g class='sx' style='animation-delay:${d}s'><g class='sy' style='animation-delay:${d}s'><g class='sc' style='animation-delay:${d}s' transform='translate(172 117)'>${puff(i % 2 ? 2 : 1)}</g></g></g>`;
}
o += smoke;
// tree-top star: a soft halo that pulses, and a glint
o += `<g class='fl f3'>${rc(TCX - 3, TTOP - 5, 7, 7, '#ffe08a', " opacity='.18'")}${rc(TCX - 1, TTOP - 3, 3, 3, '#fff6d0', " opacity='.35'")}</g>`;
o += `<g class='k1'>${rc(TCX, TTOP - 7, 1, 2, '#fff6d0')}${rc(TCX + 3, TTOP - 1, 2, 1, '#fff6d0')}</g>`;
// paper stars glow, advent candles and the tomte's lantern flicker
o += `<g class='fl f2'>${rc(219, 146, 5, 5, '#ff9a6a', " opacity='.25'")}${rc(169, 170, 3, 3, '#ff9a6a', " opacity='.25'")}</g>`;
o += `<g class='fl'>${[-3, -2, -1, 0, 1, 2, 3].map((j) => rc(232 + 2 * j, 169 + Math.abs(j), 1, 1, '#ffffff', " opacity='.45'")).join('')}</g>`;
o += `<g class='fl f3'>${rc(228, 200, 1, 1, '#fff6d0', " opacity='.7'")}${rc(226, 198, 5, 5, '#ffb35c', " opacity='.12'")}</g>`;

o += '</g>';
// owl eyes in the dark of a left trunk
o += `<g class='owl'>${rc(57, 96, 1, 1, '#ffd66b')}${rc(60, 96, 1, 1, '#ffd66b')}</g>`;

// sparkles on the snow
let sp = '';
for (let i = 0; i < 22; i++) {
  const x = Math.round(R(60, 320)), y = Math.round(R(190, 222));
  sp += rc(x, y, 1, 1, i % 3 ? '#e9f3ff' : '#ffd9a0', ` class='k${i % 4}'`);
}
o += sp;

// drifting fog bands
const fogBand = (y, h, op) => { const blob = (x, yy, w, hh) => [0, 1, 2, 3].map((k) => rc(x + k * 6, yy + k, w - k * 12, Math.max(1, hh - k * 2), '#cbbfae', ` opacity='${op}'`)).join(''); return `<g class='fg' style='animation-duration:${Math.round(R(70, 110))}s'>${[0, -360].map((dx) => blob(dx + 40, y, 120, h) + blob(dx + 210, y + 2, 90, h - 2)).join('')}</g>`; };
o += fogBand(150, 10, 0.018) + fogBand(172, 8, 0.022);

// snowfall: two layers, each wrapping seamlessly over 240px
function snowLayer(n, dur, op, cls, big) {
  let f = '';
  for (let i = 0; i < n; i++) {
    const x = Math.round(R(0, W)), y = Math.round(R(0, H));
    f += big && i % 3 === 0 ? rc(x, y, 2, 2) : rc(x, y, 1, 1);
  }
  return `<g class='${cls}'><g class='sf' style='animation-duration:${dur}s' fill='#f4eee6' opacity='${op}'><g>${f}</g><g transform='translate(0 -240)'>${f}</g></g></g>`;
}
o += snowLayer(95, 40, 0.55, 'sw', false) + snowLayer(46, 22, 0.85, 'sw s2', true);

const overlay = `<svg xmlns='http://www.w3.org/2000/svg' width='360' height='240' viewBox='0 0 360 240' shape-rendering='crispEdges'><style>
.fl{animation:fl 4.6s steps(1) infinite}.f2{animation-duration:6.1s;animation-delay:-2s}.f3{animation-duration:3.3s;animation-delay:-1s}
@keyframes fl{0%{opacity:1}12%{opacity:.75}20%{opacity:1}43%{opacity:.85}51%{opacity:1}70%{opacity:.7}76%{opacity:.95}90%{opacity:.82}}
.t0,.t1,.t2,.t3,.t4{animation:tw 3s steps(1) infinite}
.t1{animation-duration:2.3s;animation-delay:-1s}.t2{animation-duration:3.7s;animation-delay:-2s}.t3{animation-duration:2.9s;animation-delay:-.4s}.t4{animation-duration:4.4s;animation-delay:-3s}
@keyframes tw{0%{opacity:1}40%{opacity:.85}55%{opacity:.35}70%{opacity:1}}
.sx{animation:sx 13.2s steps(16) infinite}.sy{animation:sy 13.2s steps(70) infinite}
.sc{fill:#ffb86b;animation:sc 13.2s steps(6) infinite}
@keyframes sx{from{transform:translate(0,0)}to{transform:translate(16px,0)}}
@keyframes sy{from{transform:translate(0,0)}to{transform:translate(0,-70px)}}
@keyframes sc{0%{fill:#ffb86b;opacity:.55}20%{fill:#a7a2a0;opacity:.45}60%{fill:#8b9aa3;opacity:.25}100%{fill:#8b9aa3;opacity:0}}
.owl{animation:ow 9s steps(1) infinite}@keyframes ow{0%,46%,50%,93%,97%{opacity:1}47%,49%,94%,96%{opacity:0}}
.k0,.k1,.k2,.k3{opacity:0;animation:k 5s steps(1) infinite}.k1{animation-delay:-1.3s;animation-duration:6.2s}.k2{animation-delay:-2.9s;animation-duration:4.4s}.k3{animation-delay:-3.7s;animation-duration:7s}
@keyframes k{0%,88%{opacity:0}90%,94%{opacity:.9}96%{opacity:.4}}
.fg{animation:fg 90s steps(360) infinite}@keyframes fg{from{transform:translate(0,0)}to{transform:translate(360px,0)}}
.sf{animation:sf 40s steps(240) infinite}@keyframes sf{from{transform:translate(0,0)}to{transform:translate(0,240px)}}
.sw{animation:sw 7s steps(3) infinite alternate}.s2{animation-duration:4.5s}@keyframes sw{from{transform:translate(0,0)}to{transform:translate(3px,0)}}
@media (prefers-reduced-motion:reduce){*{animation-play-state:paused!important}}
</style>${o}</svg>`;
fs.writeFileSync(path.join(OUT, 'overlay.svg'), overlay);

// ---------- 10. CSS + theme ----------
const enc = (svg) => 'url("data:image/svg+xml,' + svg.replace(/\s*\n\s*/g, ' ').replace(/%/g, '%25').replace(/#/g, '%23').replace(/"/g, "'") + '")';
const POS = '30% 100%/auto max(100%,74.67vw) no-repeat';
const css = `/* Julstugan — pixel-art Christmas cottage in a snowy night forest. Base image: julstugan.png beside this theme. */
html.dark{background:#15100d!important}
html.dark body,html.dark #root,.dark [data-slot="sidebar-wrapper"],.dark main[data-slot="sidebar-inset"]{background:transparent!important}
html.dark body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;image-rendering:pixelated;background:${enc(overlay)} ${POS},var(--theme-background-image) ${POS}}
.dark [data-slot="sidebar-inner"]{background:rgba(17,11,8,.5)!important;-webkit-backdrop-filter:blur(8px) saturate(1.2);backdrop-filter:blur(8px) saturate(1.2)}
.dark [data-workspace-area="conversation"]{position:relative;isolation:isolate;overflow:clip;background:transparent!important}
.dark [data-workspace-area="conversation"]::after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:linear-gradient(90deg,transparent calc(50% - 32rem),rgba(10,6,4,.8) calc(50% - 24rem),rgba(10,6,4,.8) calc(50% + 24rem),transparent calc(50% + 32rem))}
.dark .messages-timeline-scroll{background:transparent!important}
.dark [data-slot="composer-host"]{background:rgba(17,11,8,.88)!important;box-shadow:0 0 0 1px rgba(240,110,95,.2),0 10px 30px rgba(0,0,0,.4)!important}
.dark [data-user-message-bubble]{background:rgba(78,26,26,.9)!important}
.dark .chat-markdown{text-shadow:0 1px 2px rgba(0,0,0,.95),0 0 6px rgba(0,0,0,.6)}
.dark [data-chat-header]{background:rgba(15,10,7,.72)!important;backdrop-filter:blur(6px)}`;

const colors = {
  canvas: '#15100d59', chrome: '#110c0a', toolbar: '#110c0a', toolbarForeground: '#f1e4cf', toolbarBorder: '#2c211b',
  toolbarControl: '#211814', toolbarControlForeground: '#f1e4cf', toolbarControlHover: '#2c201a',
  surface: '#191210', surfaceRaised: '#211915', surfaceOverlay: '#2a1f1a', text: '#f1e6d4', textMuted: '#9c9584',
  border: '#382a22', input: '#4a382d', focus: '#e8675c', accent: '#e8675c', accentForeground: '#1c0605',
  secondary: '#251b16', secondaryForeground: '#f1e6d4', muted: '#1c1411', mutedForeground: '#8f8a7c',
  placeholder: '#857f71', secondaryLabel: '#9c9584', iconMuted: '#938b7a',
  error: '#ef6458', errorForeground: '#ff8a7e', errorSurface: '#2c1a1b', warning: '#f5a524', warningForeground: '#ffc35a', warningSurface: '#2c2414',
  update: '#f0a95a', updateForeground: '#f1e6d4', updateSurface: '#33240f', accentSurface: '#3a1716', accentSurfaceForeground: '#f8e2dc',
  messageSurface: '#4a1d1c', messageForeground: '#fbe9e4', messageAction: '#e8675c', messageActionForeground: '#1c0605', messageActionHover: '#f08a80',
  codeBackground: '#130d0b', codeForeground: '#eadcc6',
  searchMatchBackground: '#5a3e15', searchMatchForeground: '#fff6e6', searchMatchActiveBackground: '#c8862e', searchMatchActiveForeground: '#000000',
  sidebar: '#120d0b', sidebarForeground: '#e9dcc7', sidebarMutedForeground: '#8a8575', sidebarControlSurface: '#201713',
  sidebarRowHover: '#1e1612', sidebarRowActive: '#2a1f19', sidebarRowSelected: '#36181a', sidebarBorder: '#271d17',
  terminalBackground: '#15100d', terminalForeground: '#eadcc6', terminalCursor: '#e8675c', terminalSelection: '#47201e',
  terminalScrollbar: '#3b2d24', terminalScrollbarHover: '#54402f',
};
const light = {
  canvas: '#f6efe3', chrome: '#f1e8d9', toolbar: '#f1e8d9', toolbarForeground: '#2a1d12', toolbarBorder: '#e0d2bc',
  toolbarControl: '#e9dcc8', toolbarControlForeground: '#2a1d12', toolbarControlHover: '#e0d0b8',
  surface: '#fbf6ee', surfaceRaised: '#f3ebdd', surfaceOverlay: '#ede2d0', text: '#2a1d12', textMuted: '#7a6a58',
  border: '#e0d2bc', input: '#d6c5aa', focus: '#b3332b', accent: '#b3332b', accentForeground: '#ffffff',
  secondary: '#efe3cf', secondaryForeground: '#2a1d12', muted: '#f0e7d8', mutedForeground: '#7a6a58',
  placeholder: '#8c7c69', secondaryLabel: '#7a6a58', iconMuted: '#8c7c69',
  error: '#d63b30', errorForeground: '#b3261e', errorSurface: '#f8e2dc', warning: '#d98a10', warningForeground: '#9a5a00', warningSurface: '#f8ead0',
  update: '#b9772a', updateForeground: '#2a1d12', updateSurface: '#f3dfbf', accentSurface: '#f6dad3', accentSurfaceForeground: '#2a1d12',
  messageSurface: '#f4d8d0', messageForeground: '#2a1d12', messageAction: '#b3332b', messageActionForeground: '#ffffff', messageActionHover: '#962a23',
  codeBackground: '#f1e8da', codeForeground: '#2a1d12',
  searchMatchBackground: '#f3d08f', searchMatchForeground: '#2a1d12', searchMatchActiveBackground: '#d99a3d', searchMatchActiveForeground: '#000000',
  sidebar: '#efe5d4', sidebarForeground: '#2a1d12', sidebarMutedForeground: '#7f6f5c', sidebarControlSurface: '#e6d9c3',
  sidebarRowHover: '#e8dcc7', sidebarRowActive: '#e2d2b8', sidebarRowSelected: '#f0d2ca', sidebarBorder: '#e0d2bc',
  terminalBackground: '#f6efe3', terminalForeground: '#2a1d12', terminalCursor: '#b3332b', terminalSelection: '#f2d3cb',
  terminalScrollbar: '#d6c8b2', terminalScrollbarHover: '#c4b49c',
};
const theme = {
  version: 1, id: 'julstugan', name: 'Julstugan', appearance: 'dark', author: 'Hanna Adenholm',
  description: 'Pixel-art: en julpyntad stuga i en snöig skog en natt, med glittrande gran, adventsljusstake, julstjärna, tomte, snögubbe, ljusslingor och snöfall. Scenen visas i mörkt läge.',
  colors, variants: { light }, css,
};
fs.writeFileSync(path.join(OUT, 'julstugan.json'), JSON.stringify(theme, null, 2));
fs.writeFileSync(path.join(OUT, 'julstugan.css'), css);
const shareCss = css.replace('var(--theme-background-image)', 'url(data:image/png;base64,' + png.toString('base64') + ')').replace('Base image: julstugan.png beside this theme.', 'Base image embedded.');
fs.writeFileSync(path.join(OUT, 'julstugan-dela.json'), JSON.stringify({ ...theme, css: shareCss }, null, 2));
console.log('share css chars', shareCss.length);
fs.writeFileSync(path.join(OUT, 'preview.html'), `<!doctype html><html class="dark"><head><meta charset="utf-8"><style>
:root{--theme-background-image:url(julstugan.png)}
html,body{margin:0;height:100%;font:15px/1.5 system-ui;color:${colors.text};background:${colors.canvas}}
.app{display:flex;height:100%}.side{width:260px;padding:52px 12px;box-sizing:border-box;background:${colors.sidebar};border-right:1px solid ${colors.sidebarBorder};color:${colors.sidebarForeground};font-size:13px}.side div{padding:6px 8px;border-radius:6px}main{flex:1;display:flex;background:${colors.canvas}}
.home{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:var(--background)}
[data-workspace-area="conversation"]{flex:1;display:flex;flex-direction:column}html{--background:${colors.canvas}}
.messages-timeline-scroll{flex:1;padding:40px 0}.col{max-width:44rem;margin:0 auto;padding:0 16px}
[data-user-message-bubble]{margin-left:auto;width:fit-content;padding:10px 14px;border-radius:14px}
[data-slot="composer-host"]{margin:0 auto 20px;max-width:44rem;height:110px;border-radius:18px;width:calc(100% - 32px)}
</style><link rel="stylesheet" href="julstugan.css"></head><body><div class="app" data-slot="sidebar-wrapper"><div class="side" data-slot="sidebar-inner"><div>Mysigt tema</div><div style="background:${colors.sidebarRowSelected}">Julpynt till stugan</div><div>Fixa buggen i appen</div><div>Ny landningssida</div></div><main data-slot="sidebar-inset"><div data-workspace-area="conversation">
<div data-chat-header style="height:44px"></div><div class="messages-timeline-scroll"><div class="col">
<div data-user-message-bubble>Kan du hjälpa mig med en sak?</div>
<div class="chat-markdown"><p>Absolut! Här är ett längre svar så att man ser hur texten läses ovanpå bakgrunden. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p></div>
</div></div><div data-slot="composer-host"></div></div></main></div></body></html>`);
fs.writeFileSync(path.join(OUT, 'preview-home.html'), fs.readFileSync(path.join(OUT, 'preview.html'), 'utf8').replace(/<div data-workspace-area="conversation">[\s\S]*<\/main>/, '<div class="home"><div style="font-size:22px;font-weight:600;text-shadow:0 1px 3px #000">Vad ska vi bygga?</div><div data-slot="composer-host" style="margin:0;max-width:40rem"></div></div></main>'));
console.log('css chars', css.length, 'png bytes', png.length, 'bulbs', bi);
