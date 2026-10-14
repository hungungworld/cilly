// CILLY film v2 — procedural motion graphics renderer (deterministic per frame)
const W = 1080, H = 1920, FPS = 30, DUR = 17.5;
const C = { olive: '#858f5f', leaf: '#263020', paper: '#ebe6d1', red: '#d63421', lime: '#d6dc93', ink: '#1b2114', black: '#0b0d08' };
const LEAFC = ['#2c4a1c', '#3b6a26', '#4c822f', '#5c963a', '#6fa846', '#3f5f2a'];
const cv = document.getElementById('c'), ctx = cv.getContext('2d');

/* ---------------- utils ---------------- */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const eOutCubic = x => 1 - Math.pow(1 - x, 3);
const eOutExpo = x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const eInCubic = x => x * x * x;
const eInOut = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eOutBack = x => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const punch = (t, t0, d = 0.25) => (t < t0 ? 0 : Math.exp(-((t - t0) / d) * 4));
function rng(seed) { return function () { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shake(t, t0, amp, dur = 0.3) { if (t < t0 || t > t0 + dur) return [0, 0]; const k = 1 - (t - t0) / dur; return [Math.sin(t * 97) * amp * k, Math.cos(t * 71) * amp * k]; }

function load(src) { return new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => j(new Error(src)); i.src = src; }); }
const IMG = {};
const origCache = new Map();
async function orig(n) {
  n = Math.round(n);
  if (!origCache.has(n)) {
    if (origCache.size > 40) origCache.delete(origCache.keys().next().value);
    origCache.set(n, await load(`orig/${String(n).padStart(4, '0')}.jpg`));
  }
  return origCache.get(n);
}

// draw img covering rect, zoom z, focus fx/fy (0..1), offset
function cover(img, x, y, w, h, z = 1, fx = 0.5, fy = 0.5, dx = 0, dy = 0, src) {
  const sw = src ? src[2] : img.width, sh = src ? src[3] : img.height;
  const s = Math.max(w / sw, h / sh) * z, iw = sw * s, ih = sh * s;
  const ox = x + (w - iw) * fx + dx, oy = y + (h - ih) * fy + dy;
  if (src) ctx.drawImage(img, src[0], src[1], sw, sh, ox, oy, iw, ih);
  else ctx.drawImage(img, ox, oy, iw, ih);
  return { ox, oy, s };
}
// motion-blurred horizontal/vertical smear
function coverBlur(img, x, y, w, h, z, fx, fy, dx, dy, vx, vy, src) {
  const sp = Math.hypot(vx, vy);
  if (sp < 30) return cover(img, x, y, w, h, z, fx, fy, dx, dy, src);
  const n = 6;
  ctx.save();
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = i === 0 ? 1 : 0.22;
    const k = i / n;
    cover(img, x, y, w, h, z, fx, fy, dx - vx * k * 0.05, dy - vy * k * 0.05, src);
  }
  ctx.restore();
}

function ovalPath(cx, cy, rx, ry) { ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); }
function vignetteOval(cx, cy, rx, ry, strength = 0.85) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, rx * 0.5, 0, 0, rx);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.78, `rgba(0,0,0,${strength * 0.25})`); g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g; ctx.fillRect(-rx, -rx, rx * 2, rx * 2); ctx.restore();
}
function inOval(cx, cy, rx, ry, fn, vig = 0.85) {
  ctx.save(); ovalPath(cx, cy, rx, ry); ctx.clip(); fn(); if (vig) vignetteOval(cx, cy, rx, ry, vig); ctx.restore();
}
function frameVignette(a = 0.55) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function flash(t, t0, a = 0.9, d = 0.1, col = '255,255,255') {
  const p = prog(t, t0, t0 + d); if (t < t0 || p >= 1) return;
  ctx.fillStyle = `rgba(${col},${a * (1 - p)})`; ctx.fillRect(0, 0, W, H);
}

/* ---------------- text ---------------- */
const F = {
  anton: s => `${s}px Anton`,
  kr: s => `900 ${s}px "Noto Sans KR"`,
  jp: s => `900 ${s}px "Noto Sans JP"`,
  sc: s => `900 ${s}px "Noto Sans SC"`,
  serif: s => `italic ${s}px "Instrument Serif"`,
  mono: s => `500 ${s}px "IBM Plex Mono"`,
};
function fit(str, fam, max, maxW, ls = 0) {
  ctx.font = fam(max); ctx.letterSpacing = ls + 'px';
  const w = ctx.measureText(str).width; return w > maxW ? Math.floor(max * maxW / w) : max;
}
function text(str, x, y, fam, size, color, o = {}) {
  ctx.save();
  ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot); if (o.scale) ctx.scale(o.scale, o.scale);
  ctx.font = fam(size); ctx.letterSpacing = (o.ls || 0) + 'px';
  ctx.textAlign = o.align || 'center'; ctx.textBaseline = o.base || 'alphabetic';
  ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
  if (o.shadow) { ctx.shadowColor = o.shadow; ctx.shadowBlur = o.shadowBlur || 30; ctx.shadowOffsetY = o.shadowY || 8; }
  if (o.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = o.strokeW || 16; ctx.strokeStyle = o.stroke; ctx.strokeText(str, 0, 0); ctx.shadowColor = 'transparent'; }
  ctx.fillStyle = color; ctx.fillText(str, 0, 0);
  ctx.restore();
}
// slam-in text: big -> settle
function slam(t, t0, str, x, y, fam, size, color, o = {}) {
  if (t < t0) return;
  const p = eOutExpo(prog(t, t0, t0 + (o.d || 0.14)));
  text(str, x, y, fam, size, color, { ...o, scale: lerp(o.from || 1.8, 1, p), alpha: clamp(p * 3) * (o.alpha == null ? 1 : o.alpha) });
}
// letters stagger up
function stagger(t, t0, str, x, y, fam, size, color, o = {}) {
  ctx.save(); ctx.font = fam(size); ctx.letterSpacing = (o.ls || 0) + 'px';
  const chars = [...str]; const total = ctx.measureText(str).width;
  let cx = x - total / 2; const step = o.step || 0.035;
  chars.forEach((ch, i) => {
    const w = ctx.measureText(ch).width + (o.ls || 0);
    const p = eOutCubic(prog(t, t0 + i * step, t0 + i * step + 0.22));
    if (p > 0) text(ch, cx + w / 2, y + (1 - p) * (o.dy || 90), fam, size, color, { ...o, alpha: p, align: 'center' });
    cx += w;
  });
  ctx.restore();
}

/* ---------------- leaves ---------------- */
let LEAF, VEIN; const SPR = []; // SPR[color][blurLevel]
function buildLeaves(d) {
  LEAF = new Path2D(d);
  VEIN = new Path2D('M100 186 L100 40 M100 120 L52 70 M100 120 L148 70 M100 150 L64 128 M100 150 L136 128');
  const blurs = [0, 7, 16];
  LEAFC.forEach((col, ci) => {
    SPR[ci] = blurs.map(b => {
      const c = document.createElement('canvas'); c.width = c.height = 300; const x = c.getContext('2d');
      x.filter = b ? `blur(${b}px)` : 'none';
      x.translate(50, 50);
      const g = x.createLinearGradient(30, 20, 170, 190); g.addColorStop(0, col); g.addColorStop(1, shade(col, -0.35));
      x.fillStyle = g; x.fill(LEAF);
      x.strokeStyle = 'rgba(214,220,147,.45)'; x.lineWidth = 3.5; x.lineCap = 'round'; x.stroke(VEIN);
      return c;
    });
  });
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = v => Math.round(clamp(k < 0 ? v * (1 + k) : v + (255 - v) * k, 0, 255));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function leafAt(x, y, s, rot, ci, bl = 0, alpha = 1) {
  if (s < 2 || alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(rot);
  ctx.drawImage(SPR[ci % SPR.length][bl], -s * 0.75, -s * 0.75, s * 1.5, s * 1.5);
  ctx.restore();
}
function makeBurst(seed, n, o) {
  const R = rng(seed);
  return Array.from({ length: n }, () => ({
    a: (o.a0 || 0) + (R() - 0.5) * (o.spread == null ? Math.PI * 2 : o.spread),
    v: lerp(o.v0, o.v1, R()), s: lerp(o.s0, o.s1, Math.pow(R(), 1.6)), spin: (R() - 0.5) * (o.spin || 8),
    r0: R() * 6.283, c: Math.floor(R() * LEAFC.length), z: R(), delay: R() * (o.delay || 0),
  }));
}
// layer: 'back' (z<zSplit) | 'front' | 'all'
function drawBurst(ps, t, t0, ox, oy, o, layer = 'all') {
  const k = o.drag || 3, g = o.g || 0, zs = o.zSplit == null ? 0.35 : o.zSplit;
  for (const p of ps) {
    if (layer === 'back' && p.z >= zs) continue; if (layer === 'front' && p.z < zs) continue;
    const dt = t - t0 - p.delay; if (dt < 0) continue;
    const pos = tt => { const d = p.v * (1 - Math.exp(-k * tt)) / k; return [ox + Math.cos(p.a) * d, oy + Math.sin(p.a) * d + g * tt * tt]; };
    const [x, y] = pos(dt);
    const s = p.s * (1 + dt * (o.zoom || 0) * p.z) * clamp(dt / 0.06, 0.2, 1);
    const life = o.life ? 1 - prog(dt, o.life * 0.7, o.life) : 1;
    const bl = s > (o.blurAt || 260) ? 2 : p.z < 0.15 ? 1 : 0;
    const sp = p.v * Math.exp(-k * dt);
    if (sp > 1400) { const [x2, y2] = pos(Math.max(0, dt - 0.025)); leafAt((x + x2) / 2, (y + y2) / 2, s, p.r0 + p.spin * dt, p.c, bl, 0.35 * life); }
    leafAt(x, y, s, p.r0 + p.spin * dt, p.c, bl, life);
  }
}
// falling leaves (rain / drift)
function makeRain(seed, n, o) {
  const R = rng(seed);
  return Array.from({ length: n }, () => ({ x: R() * (W + 300) - 150, t0: lerp(o.t0, o.t1, R()), v: lerp(o.v0, o.v1, R()), s: lerp(o.s0, o.s1, Math.pow(R(), 2)), sway: R() * 6.28, spin: (R() - 0.5) * 5, r0: R() * 6.28, c: Math.floor(R() * LEAFC.length), z: R() }));
}
function drawRain(ps, t, o = {}) {
  for (const p of ps) {
    const dt = t - p.t0; if (dt < 0) continue;
    const y = -200 + dt * p.v * (o.dir || 1); const x = p.x + Math.sin(dt * 2.4 + p.sway) * (o.swayAmp || 50);
    const yy = o.dir === -1 ? H + 200 - dt * p.v : y;
    if (yy > H + 300 || yy < -400) continue;
    leafAt(x, yy, p.s, p.r0 + p.spin * dt, p.c, p.s > (o.blurAt || 300) ? 2 : p.z < 0.2 ? 1 : 0, o.alpha || 1);
  }
}

/* ---------------- mist ---------------- */
let DOT;
function buildDot() {
  DOT = document.createElement('canvas'); DOT.width = DOT.height = 64; const x = DOT.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
}
function makeMist(seed, n, o) {
  const R = rng(seed);
  return Array.from({ length: n }, (_, i) => ({ bt: lerp(o.e0, o.e1, i / n) + R() * 0.02, a: o.ang + (R() - 0.5) * o.spread, v: lerp(o.v0, o.v1, R()), s: lerp(o.s0, o.s1, R()), life: lerp(o.l0 || 0.5, o.l1 || 1.1, R()), j: R() }));
}
function drawMist(ps, t, ox, oy, o = {}) {
  const k = o.drag || 4; ctx.save(); ctx.globalCompositeOperation = 'screen';
  for (const p of ps) {
    const dt = t - p.bt; if (dt < 0 || dt > p.life) continue;
    const d = p.v * (1 - Math.exp(-k * dt)) / k;
    const x = ox + Math.cos(p.a) * d + Math.sin(dt * 3 + p.j * 9) * 20 * dt, y = oy + Math.sin(p.a) * d + (o.rise || -40) * dt * dt;
    const s = p.s * (1 + dt * 3);
    const a = (o.alpha || 0.5) * Math.pow(1 - dt / p.life, 1.5) * clamp(dt / 0.03);
    ctx.globalAlpha = a; ctx.drawImage(DOT, x - s / 2, y - s / 2, s, s);
  }
  ctx.restore();
}

/* ---------------- grain ---------------- */
const GRAIN = [];
function buildGrain() {
  for (let k = 0; k < 4; k++) {
    const c = document.createElement('canvas'); c.width = 540; c.height = 960; const x = c.getContext('2d');
    const d = x.createImageData(540, 960); const R = rng(k * 99 + 7);
    for (let i = 0; i < d.data.length; i += 4) { const v = 128 + (R() - 0.5) * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0); GRAIN.push(c);
  }
}

/* ================= SCENES ================= */
const R0 = rng(1);

// S1 — orders from everywhere (0 – 2.0)
const TICKETS = [
  { t: 0.0, txt: ['고수', '많이요.'], fam: F.kr, bg: C.paper, fg: C.ink, ac: C.red, city: 'SEOUL', rot: -0.05, dx: 0 },
  { t: 0.5, txt: ['EXTRA', 'CILANTRO.'], fam: F.anton, bg: C.red, fg: C.paper, ac: C.paper, city: 'NEW YORK', rot: 0.07, dx: 40 },
  { t: 0.75, txt: ['香菜', '多放!'], fam: F.sc, bg: C.olive, fg: C.leaf, ac: C.leaf, city: 'SHANGHAI', rot: -0.09, dx: -50 },
  { t: 1.0, txt: ['MÁS', 'CILANTRO.'], fam: F.anton, bg: C.lime, fg: C.red, ac: C.ink, city: 'CDMX', rot: 0.05, dx: 30 },
  { t: 1.25, txt: ['パクチー', '多めで。'], fam: F.jp, bg: C.leaf, fg: C.lime, ac: C.lime, city: 'TOKYO', rot: -0.04, dx: -20 },
  { t: 1.5, txt: ['NHIỀU', 'NGÒ!'], fam: F.anton, bg: C.paper, fg: C.red, ac: C.ink, city: 'HÀ NỘI', rot: 0.08, dx: 20 },
];
function ticket(tk, i) {
  const w = 840, h = 1120;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 24;
  ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(w / 2, h / 2);
  const teeth = 21; for (let k = 0; k <= teeth; k++) ctx.lineTo(w / 2 - (k * w) / teeth, h / 2 + (k % 2 ? -22 : 0));
  ctx.closePath(); ctx.fillStyle = tk.bg; ctx.fill();
  ctx.restore();
  // header
  text(`ORDER No. 0${417 + i * 23}`, -w / 2 + 60, -h / 2 + 90, F.mono, 34, tk.ac, { align: 'left', alpha: 0.85 });
  text(tk.city, w / 2 - 60, -h / 2 + 90, F.mono, 34, tk.ac, { align: 'right', alpha: 0.85 });
  ctx.save(); ctx.setLineDash([14, 12]); ctx.strokeStyle = tk.ac; ctx.globalAlpha = 0.5; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-w / 2 + 60, -h / 2 + 130); ctx.lineTo(w / 2 - 60, -h / 2 + 130); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-w / 2 + 60, h / 2 - 210); ctx.lineTo(w / 2 - 60, h / 2 - 210); ctx.stroke(); ctx.restore();
  // big words
  const size = Math.min(...tk.txt.map(s => fit(s, tk.fam, 300, w - 120)));
  const lh = size * (tk.fam === F.anton ? 1.0 : 1.12);
  tk.txt.forEach((s, k) => text(s, 0, -lh * (tk.txt.length - 1) / 2 + k * lh + size * 0.36, tk.fam, size, tk.fg));
  text('1 × CILANTRO', -w / 2 + 60, h / 2 - 140, F.mono, 36, tk.ac, { align: 'left' });
  text('EXTRA +++', w / 2 - 60, h / 2 - 140, F.mono, 36, tk.ac, { align: 'right' });
  text('TABLE ' + (3 + i * 2), -w / 2 + 60, h / 2 - 85, F.mono, 28, tk.ac, { align: 'left', alpha: 0.6 });
}
function sOrders(t) {
  const g = ctx.createRadialGradient(W / 2, H * 0.45, 100, W / 2, H / 2, H * 0.8);
  g.addColorStop(0, '#2a2f20'); g.addColorStop(1, '#0b0d08'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // background marquee of the request in many tongues
  const rows = ['고수 많이요 · EXTRA CILANTRO · 香菜多放 · MÁS CILANTRO · パクチー多めで · NHIỀU NGÒ · '];
  for (let r = 0; r < 9; r++) {
    const off = ((t * (r % 2 ? 260 : -260) + r * 377) % 1800) - 1800;
    for (let k = 0; k < 3; k++) text(rows[0], off + k * 1800, 120 + r * 220, F.kr, 70, '#ffffff', { align: 'left', alpha: 0.05 });
  }
  const cz = 1 + 0.07 * t;
  const sh = TICKETS.reduce((a, tk) => { const s = shake(t, tk.t + 0.1, 14, 0.18); return [a[0] + s[0], a[1] + s[1]]; }, [0, 0]);
  ctx.save(); ctx.translate(W / 2 + sh[0], H / 2 + sh[1]); ctx.scale(cz, cz);
  TICKETS.forEach((tk, i) => {
    if (t < tk.t) return;
    let p, sc, y = 0;
    if (i === 0) { p = eOutExpo(prog(t, 0, 0.35)); sc = 1; y = (1 - p) * 1400; }
    else { p = eOutExpo(prog(t, tk.t, tk.t + 0.13)); sc = lerp(1.9, 1, p); }
    ctx.save(); ctx.translate(tk.dx, y); ctx.rotate(tk.rot * (i === 0 ? 1 : lerp(2.5, 1, p))); ctx.scale(sc, sc);
    ctx.globalAlpha = i === 0 ? 1 : clamp(p * 4); ticket(tk, i); ctx.restore();
  });
  ctx.restore();
  // MORE. MORE. MORE. full-bleed finale
  if (t >= 1.75) {
    ctx.fillStyle = C.red; ctx.fillRect(0, 0, W, H);
    [1.75, 1.83, 1.91].forEach((t0, k) => slam(t, t0, 'MORE.', W / 2, 760 + k * 420, F.anton, 470, k === 1 ? C.ink : C.paper, { d: 0.08, from: 1.5 }));
  }
  flash(t, 0.5, 0.35, 0.08); flash(t, 1.0, 0.35, 0.08); flash(t, 1.5, 0.35, 0.08);
}

// S2 — three leaves (2.0 – 3.5)
const NOODLES = (() => { const R = rng(42); return Array.from({ length: 34 }, () => { const a = R() * 6.28, r = 40 + R() * 220; return [a, r, (R() - 0.5) * 2.4, 60 + R() * 140, R()]; }); })();
function bowl(cx, cy) {
  ctx.save();
  ctx.shadowColor = 'rgba(40,30,10,.35)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 30;
  ovalPath(cx, cy, 430, 430); ctx.fillStyle = '#f6f1e3'; ctx.fill(); ctx.restore();
  let g = ctx.createRadialGradient(cx - 60, cy - 80, 50, cx, cy, 430); g.addColorStop(0, '#fffdf6'); g.addColorStop(1, '#d9d0b8');
  ovalPath(cx, cy, 430, 430); ctx.fillStyle = g; ctx.fill();
  g = ctx.createRadialGradient(cx + 40, cy + 30, 30, cx, cy, 345); g.addColorStop(0, '#e0a64a'); g.addColorStop(0.75, '#b8722a'); g.addColorStop(1, '#8a4f1a');
  ovalPath(cx, cy, 345, 345); ctx.fillStyle = g; ctx.fill();
  ctx.save(); ovalPath(cx, cy, 340, 340); ctx.clip();
  ctx.lineCap = 'round';
  NOODLES.forEach(([a, r, c, len, k]) => {
    ctx.strokeStyle = k > 0.5 ? '#f4e7c3' : '#e9d6a6'; ctx.lineWidth = 11;
    ctx.beginPath(); const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a + c) * len, y + Math.sin(a + c) * len, x + Math.cos(a + c * 2) * len * 1.4, y + Math.sin(a + c * 2) * len * 1.4); ctx.stroke();
  });
  [[cx - 120, cy + 90, 0.4], [cx + 60, cy + 150, -0.3], [cx + 140, cy - 40, 0.9]].forEach(([x, y, r]) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(r); ovalPath(0, 0, 120, 62); ctx.fillStyle = '#8d4c3e'; ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = '#b97a64'; ctx.stroke(); ctx.restore();
  });
  // broth sheen
  g = ctx.createLinearGradient(cx - 340, cy - 340, cx + 100, cy + 100); g.addColorStop(0, 'rgba(255,255,255,.28)'); g.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(cx - 345, cy - 345, 690, 690);
  ctx.restore();
}
const THREE = [{ t: 2.0, x: -90, y: -60, r: 0.6, c: 3 }, { t: 2.5, x: 110, y: 40, r: -1.1, c: 2 }, { t: 3.0, x: -10, y: 160, r: 2.4, c: 4 }];
function sThree(t) {
  ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
  const zIn = eInCubic(prog(t, 3.28, 3.5));
  const cz = lerp(1, 1.08, prog(t, 2, 3.3)) + zIn * 1.4;
  const sh = THREE.reduce((a, l) => { const s = shake(t, l.t + 0.16, 9, 0.16); return [a[0] + s[0], a[1] + s[1]]; }, [0, 0]);
  const cx = 540, cy = 1080;
  ctx.save(); ctx.translate(cx + sh[0], cy + sh[1]); ctx.scale(cz, cz); ctx.translate(-cx, -cy);
  bowl(cx, cy);
  THREE.forEach(l => {
    if (t < l.t) return;
    const p = eOutCubic(prog(t, l.t, l.t + 0.17));
    const land = t - l.t - 0.17;
    if (land > 0) { // ripple
      const rp = prog(land, 0, 0.5); ctx.save(); ctx.globalAlpha = 0.5 * (1 - rp); ctx.strokeStyle = '#fff3d0'; ctx.lineWidth = 6;
      ovalPath(cx + l.x, cy + l.y, 60 + rp * 160, 60 + rp * 160); ctx.stroke(); ctx.restore();
    }
    leafAt(cx + l.x, cy + l.y - (1 - p) * 900, lerp(520, 150, p), l.r + (1 - p) * 3, l.c, p < 0.6 ? 2 : 0);
  });
  ctx.restore();
  // counter
  const n = t >= 3.0 ? 3 : t >= 2.5 ? 2 : 1;
  const tt = THREE[n - 1].t;
  text(String(n), 540, 520, F.anton, 380, C.ink, { scale: 1 + 0.5 * punch(t, tt + 0.15, 0.2), alpha: 1 - zIn });
  text('LEAVES', 540, 600, F.mono, 40, C.ink, { ls: 12, alpha: 0.7 * (1 - zIn) });
  if (t >= 3.05) {
    slam(t, 3.05, '…세 잎.', 540, 1700, F.kr, 120, C.red, { d: 0.12, from: 1.4, alpha: 1 - zIn });
    text('“고수 많이요” 했는데.', 540, 1800, F.kr, 44, C.ink, { alpha: prog(t, 3.1, 3.2) * (1 - zIn) * 0.75 });
  }
}

// S3 — spray (original footage, 3.5 – 4.0)
const MIST_S3 = makeMist(5, 240, { e0: 3.5, e1: 3.9, ang: -0.25, spread: 0.6, v0: 1200, v1: 2600, s0: 30, s1: 90, l0: 0.4, l1: 0.8 });
async function sSpray(t) {
  const f = t < 3.75 ? lerp(405, 412, prog(t, 3.5, 3.75)) : lerp(75, 79, prog(t, 3.75, 4.0));
  const img = await orig(f);
  ctx.fillStyle = C.red; ctx.fillRect(0, 0, W, H);
  const z = 1.14 + 0.18 * (t >= 3.75 ? 1 : 0) + 0.06 * prog(t, 3.5, 4);
  const pr = 1 + 0.05 * punch(t, 3.5) + 0.05 * punch(t, 3.75);
  inOval(540, 900, 470 * pr, 800 * pr, () => cover(img, 0, 0, W, H, z, 0.5, 0.35));
  drawMist(MIST_S3, t, 120, 700, { alpha: 0.35 });
  slam(t, 3.5, 'SPRAY.', 540, 1840, F.anton, 260, C.paper, { from: 1.6, d: 0.1 });
  flash(t, 3.5, 0.6, 0.08);
}

// S4 — the burst (4.0 – 5.0)
const BURST4 = makeBurst(11, 105, { v0: 1800, v1: 4800, s0: 36, s1: 150, spin: 14, delay: 0.22 });
const BURST4b = makeBurst(12, 45, { v0: 1400, v1: 3600, s0: 40, s1: 130, spin: 10, delay: 0.1 });
const MIST4 = makeMist(13, 360, { e0: 4.0, e1: 4.45, ang: -Math.PI / 2, spread: 1.3, v0: 900, v1: 3200, s0: 40, s1: 140, l0: 0.5, l1: 1.0 });
function sBurst(t) {
  const g = ctx.createRadialGradient(540, 900, 50, 540, 960, 1200); g.addColorStop(0, C.lime); g.addColorStop(0.45, C.olive); g.addColorStop(1, C.leaf);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const [sx, sy] = shake(t, 4.0, 26, 0.35); const [sx2, sy2] = shake(t, 4.5, 16, 0.25);
  ctx.save(); ctx.translate(sx + sx2, sy + sy2);
  // rays
  ctx.save(); ctx.translate(540, 830); ctx.rotate(t * 0.4); ctx.globalAlpha = 0.12;
  for (let k = 0; k < 16; k++) { ctx.rotate(Math.PI / 8); ctx.fillStyle = C.paper; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1600, -90); ctx.lineTo(1600, 90); ctx.fill(); }
  ctx.restore();
  const txt4 = () => {
  slam(t, 4.25, 'CILANTRO,', 540, 470, F.anton, fit('CILANTRO,', F.anton, 330, 980), C.paper, { d: 0.1, shadow: 'rgba(0,0,0,.35)' });
  slam(t, 4.5, 'BOTTLED.', 540, 1790, F.anton, fit('BOTTLED.', F.anton, 330, 980), C.red, { d: 0.1, shadow: 'rgba(0,0,0,.35)' });
  };
  drawBurst(BURST4, t, 4.0, 540, 830, { drag: 2.6, g: 500, zoom: 2.4 }, 'back');
  const bs = eOutBack(prog(t, 4.0, 4.28)) * (1 + 0.04 * punch(t, 4.5)) ;
  const bw = 700 * lerp(0.5, 1, bs), bh = bw * 1183 / 993;
  ctx.drawImage(IMG.bottle, 540 - bw / 2, 1120 - bh / 2 + (1 - bs) * 200, bw, bh);
  drawMist(MIST4, t, 540, 1120 - bh / 2 + 40, { alpha: 0.45, drag: 3 });
  drawBurst(BURST4, t, 4.0, 540, 830, { drag: 2.6, g: 500, zoom: 2.4 }, 'front');
  drawBurst(BURST4b, t, 4.5, 540, 830, { drag: 2.2, g: 700, zoom: 3 });
  txt4();
  ctx.restore();
  flash(t, 4.0, 1, 0.1); flash(t, 4.5, 0.3, 0.06);
}

// S5 — the bite (5.0 – 5.5), real-time so it reads naturally
const CRUMBS = makeBurst(21, 46, { a0: -2.3, spread: 2.6, v0: 700, v1: 1900, s0: 22, s1: 70, spin: 18, delay: 0.05 });
async function sBite(t) {
  const f = lerp(126, 140, prog(t, 5.0, 5.5));
  const img = await orig(f);
  ctx.fillStyle = C.black; ctx.fillRect(0, 0, W, H);
  const z = 1.2 + 0.14 * eOutCubic(prog(t, 5.0, 5.5)) + 0.06 * punch(t, 5.2);
  inOval(540, 940, 480, 840, () => {
    ctx.save(); ctx.translate(540, 940); ctx.rotate(0.03 * Math.sin(t * 9)); ctx.translate(-540, -940);
    cover(img, 0, 0, W, H, z, 0.55, 0.55); ctx.restore();
  });
  drawBurst(CRUMBS, t, 5.2, 470, 1140, { drag: 2, g: 1600, zoom: 0.8 });
  slam(t, 5.0, 'BITE.', 540, 1850, F.anton, 260, C.red, { from: 1.6, d: 0.1 });
}

// S6 — whip montage of plates (5.5 – 6.5)
const PLATES = [
  { img: 'ritual', z: 1.15, fx: 0.55, fy: 0.55, label: 'ON RICE.', dir: 1 },
  { img: 'pho', z: 1.1, fx: 0.5, fy: 0.62, label: 'ON PHO.', dir: -1 },
  { img: 'ritual', z: 1.9, fx: 0.62, fy: 0.42, label: 'ON SALMON.', dir: 1 },
  { img: 'pho', z: 1.75, fx: 0.62, fy: 0.25, label: 'ON EVERYTHING.', dir: -1 },
];
const MIST6 = PLATES.map((p, i) => makeMist(30 + i, 160, { e0: 5.53 + i * 0.25, e1: 5.68 + i * 0.25, ang: p.dir > 0 ? Math.PI * 0.85 : Math.PI * 0.15, spread: 0.5, v0: 1400, v1: 3000, s0: 40, s1: 120, l0: 0.3, l1: 0.6 }));
function sPlates(t) {
  const i = Math.min(3, Math.floor((t - 5.5) / 0.25)); const p = PLATES[i]; const lt = t - 5.5 - i * 0.25;
  const e = eOutExpo(prog(lt, 0, 0.12)); const dx = (1 - e) * W * 1.1 * p.dir;
  const vx = lt < 0.12 ? W * 9 * p.dir * (1 - e) : 0;
  ctx.fillStyle = C.black; ctx.fillRect(0, 0, W, H);
  coverBlur(IMG[p.img], 0, 0, W, H, p.z + lt * 0.35, p.fx, p.fy, dx, 0, vx, 0);
  if (i > 0 && lt < 0.12) { const q = PLATES[i - 1]; coverBlur(IMG[q.img], 0, 0, W, H, q.z + 0.25 * 0.35, q.fx, q.fy, dx - W * 1.1 * p.dir, 0, vx, 0); }
  drawMist(MIST6[i], t, p.dir > 0 ? W + 40 : -40, 620, { alpha: 0.5 });
  frameVignette(0.6);
  const lp = eOutExpo(prog(lt, 0.04, 0.16));
  const size = fit(p.label, F.anton, 230, 960);
  text(p.label, 540 + (1 - lp) * 400 * p.dir, 1780, F.anton, size, C.paper, { alpha: lp, shadow: 'rgba(0,0,0,.6)', shadowBlur: 40 });
  text(`0${i + 1} / 04`, 60, 110, F.mono, 34, C.paper, { align: 'left', alpha: 0.8 });
}

// S7 — freshly cut (6.5 – 7.5)
const DRIFT7 = makeRain(70, 26, { t0: 5.6, t1: 7.4, v0: 300, v1: 700, s0: 60, s1: 220 });
async function sCut(t) {
  const img = await orig(lerp(195, 225, prog(t, 6.5, 7.5)));
  ctx.fillStyle = C.olive; ctx.fillRect(0, 0, W, H);
  drawRain(DRIFT7.filter(p => p.z < 0.5), t, { swayAmp: 80 });
  const br = 1 + 0.03 * Math.sin((t - 6.5) * Math.PI * 4);
  inOval(540, 960, 450 * br, 790 * br, () => cover(img, 0, 0, W, H, 1.16 + 0.1 * prog(t, 6.5, 7.5), 0.5, 0.5));
  slam(t, 6.5, 'FRESHLY', 540, 330, F.anton, 250, C.paper, { from: 1.5, d: 0.1, shadow: 'rgba(0,0,0,.25)' });
  // CUT. with a knife slice
  if (t >= 7.0) {
    const sep = eOutCubic(prog(t, 7.12, 7.4)) * 38;
    const sl = prog(t, 7.06, 7.13);
    const size = 470, y = 1830;
    const half = (sign) => {
      ctx.save(); ctx.beginPath();
      // slicing line from (40, y-80) to (1040, y-260) roughly through the glyphs
      const ax = 0, ay = y - 120, bx = W, by = y - 300;
      if (sign < 0) { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(bx, 0); ctx.lineTo(ax, 0); }
      else { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(bx, H); ctx.lineTo(ax, H); }
      ctx.clip(); ctx.translate(sign * sep * 0.9, sign * sep * 0.5);
      slam(t, 7.0, 'CUT.', 540, y, F.anton, size, C.red, { from: 1.5, d: 0.08 });
      ctx.restore();
    };
    half(-1); half(1);
    if (sl > 0 && sl < 1) { ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.shadowColor = '#fff'; ctx.shadowBlur = 30; ctx.beginPath(); ctx.moveTo(0, y - 120); ctx.lineTo(W * sl, y - 120 - 180 * sl); ctx.stroke(); ctx.restore(); }
  }
  drawRain(DRIFT7.filter(p => p.z >= 0.5), t, { swayAmp: 80 });
}

// S8 — born a fragrance (7.5 – 9.0)
const FLOAT8 = (() => { const R = rng(80); return Array.from({ length: 34 }, () => ({ x: R() * W, y: R() * H, v: 40 + R() * 160, s: 40 + Math.pow(R(), 2) * 320, r0: R() * 6.28, spin: (R() - 0.5) * 1.2, ph: R() * 6.28, c: Math.floor(R() * 6) })); })();
const MIST8 = makeMist(81, 220, { e0: 7.4, e1: 8.9, ang: -Math.PI / 2, spread: 1.6, v0: 250, v1: 650, s0: 30, s1: 90, l0: 0.9, l1: 1.6 });
function sFragrance(t) {
  const lt = t - 7.5;
  ctx.fillStyle = C.black; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(540, 960, 40, 540, 960, 900); g.addColorStop(0, 'rgba(133,143,95,.55)'); g.addColorStop(1, 'rgba(133,143,95,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const hz = 1 + lt * 0.05;
  ctx.save(); ctx.translate(540, 960); ctx.scale(hz, hz);
  text('香', 0, -90, F.sc, 860, '#4a5636', { alpha: 0.55 * prog(t, 7.5, 7.7) });
  text('菜', 0, 740, F.sc, 860, '#4a5636', { alpha: 0.55 * prog(t, 7.5, 7.7) });
  ctx.restore();
  const fl = p => { const y = ((p.y - lt * p.v) % (H + 400) + H + 400) % (H + 400) - 200; return [p.x + Math.sin(lt * 1.3 + p.ph) * 60, y]; };
  FLOAT8.forEach(p => { if (p.s > 200) return; const [x, y] = fl(p); leafAt(x, y, p.s, p.r0 + p.spin * lt, p.c, p.s < 90 ? 1 : 0, 0.8); });
  const bob = Math.sin(lt * 2.2) * 14, bs = 1 + 0.05 * punch(t, 8.5, 0.3) + lt * 0.02;
  const bw = 470 * bs, bh = bw * 1183 / 993;
  ctx.save(); ctx.translate(540, 1000 + bob); ctx.rotate(Math.sin(lt * 1.6) * 0.04);
  ctx.shadowColor = 'rgba(214,220,147,.45)'; ctx.shadowBlur = 90;
  ctx.drawImage(IMG.bottle, -bw / 2, -bh / 2, bw, bh); ctx.restore();
  drawMist(MIST8, t, 540, 1000 + bob - bh / 2 + 30, { alpha: 0.16, drag: 1.0, rise: -60 });
  FLOAT8.forEach(p => { if (p.s <= 200) return; const [x, y] = fl(p); leafAt(x, y, p.s, p.r0 + p.spin * lt, p.c, 2, 0.9); });
  const line = '香菜 · XIĀNG CÀI · “THE FRAGRANT HERB”';
  const n = Math.floor(prog(t, 7.55, 8.0) * [...line].length);
  text([...line].slice(0, n).join(''), 540, 240, F.mono, 36, C.lime, { ls: 2 });
  stagger(t, 8.0, 'BORN A', 540, 1560, F.anton, 230, C.paper, { step: 0.03 });
  stagger(t, 8.5, 'FRAGRANCE.', 540, 1790, F.anton, fit('FRAGRANCE.', F.anton, 250, 1000), C.red, { step: 0.025 });
}

// S9 — split grid, four sprays (9.0 – 10.0)
const TILES = [
  { img: 'ritual', z: 1.25, fx: 0.5, fy: 0.6, from: [-1, 0] },
  { img: 'extra', z: 1.0, fx: 0.15, fy: 0.95, from: [0, -1] },
  { img: 'pho', z: 1.15, fx: 0.5, fy: 0.62, from: [0, 1] },
  { img: 'ritual', z: 2.0, fx: 0.1, fy: 0.12, from: [1, 0] },
];
const MIST9 = TILES.map((_, i) => makeMist(90 + i, 130, { e0: 9.0 + i * 0.25, e1: 9.14 + i * 0.25, ang: -0.6, spread: 0.6, v0: 700, v1: 1600, s0: 30, s1: 90, l0: 0.35, l1: 0.7 }));
function sGrid(t) {
  ctx.fillStyle = C.olive; ctx.fillRect(0, 0, W, H);
  const gw = 528, gh = 948, gap = 8;
  TILES.forEach((tl, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x0 = gap + col * (gw + gap * 1.0), y0 = gap + row * (gh + gap);
    const e = eOutExpo(prog(t, 9.0 + i * 0.04, 9.18 + i * 0.04));
    const dx = (1 - e) * tl.from[0] * 1100, dy = (1 - e) * tl.from[1] * 1100;
    const hit = 9.0 + i * 0.25, pp = punch(t, hit, 0.3);
    ctx.save(); ctx.translate(x0 + gw / 2 + dx, y0 + gh / 2 + dy); ctx.scale(1 + 0.04 * pp, 1 + 0.04 * pp);
    ctx.beginPath(); ctx.rect(-gw / 2, -gh / 2, gw, gh); ctx.clip();
    cover(IMG[tl.img], -gw / 2, -gh / 2, gw, gh, tl.z + 0.08 * prog(t, 9, 10), tl.fx, tl.fy);
    if (t >= hit) {
      ctx.fillStyle = `rgba(255,255,240,${0.35 * pp})`; ctx.fillRect(-gw / 2, -gh / 2, gw, gh);
      drawMist(MIST9[i], t, -gw / 2 + 60, gh / 2 - 140, { alpha: 0.55 });
      // mini bottle peeking in from the corner
      const bp = eOutBack(prog(t, hit - 0.06, hit + 0.08)), bout = prog(t, hit + 0.2, hit + 0.3);
      ctx.save(); ctx.translate(-gw / 2 + 40 - (1 - bp + bout) * 260, gh / 2 - 60 + (1 - bp + bout) * 200); ctx.rotate(0.55);
      ctx.drawImage(IMG.bottle, -100, -120, 200, 238); ctx.restore();
    }
    ctx.restore();
    if (t >= hit) slam(t, hit, '칙!', x0 + gw / 2 + dx, y0 + gh / 2 + 70 + dy, F.kr, 190, C.paper, { from: 1.8, d: 0.1, stroke: C.red, strokeW: 22 });
  });
  flash(t, 9.0, 0.5, 0.08);
}

// S10 — laugh (10.0 – 10.5)
async function sLaugh(t) {
  const img = await orig(lerp(300, 312, prog(t, 10.0, 10.5)));
  ctx.fillStyle = C.lime; ctx.fillRect(0, 0, W, H);
  inOval(540, 900, 480, 820, () => cover(img, 0, 0, W, H, 1.45, 0.42, 0.12));
  slam(t, 10.0, '아삭!', 760, 1620, F.kr, 230, C.red, { rot: -0.12, from: 2, d: 0.1, stroke: C.paper, strokeW: 24 });
  slam(t, 10.25, '아삭!', 330, 1800, F.kr, 150, C.leaf, { rot: 0.1, from: 2, d: 0.1, stroke: C.paper, strokeW: 18 });
}

// S11 — repeat counter (10.5 – 12.5)
const REP = [
  { k: 'o', a: 405, b: 412, bg: C.red },
  { k: 'i', img: 'ritual', z: 1.6, fx: 0.4, fy: 0.5, bg: C.olive },
  { k: 'o', a: 127, b: 134, bg: C.black },
  { k: 'i', img: 'pho', z: 1.35, fx: 0.5, fy: 0.55, bg: C.red },
  { k: 'b', bg: C.lime },
  { k: 'o', a: 352, b: 360, bg: C.olive },
  { k: 'i', img: 'extra', z: 1.9, fx: 0.08, fy: 0.95, bg: C.black },
  { k: 'o', a: 420, b: 427, bg: C.red },
];
const MIST11 = REP.map((_, i) => makeMist(110 + i, 120, { e0: 10.5 + i * 0.25, e1: 10.62 + i * 0.25, ang: 0.15, spread: 0.6, v0: 1500, v1: 2800, s0: 40, s1: 110, l0: 0.3, l1: 0.55 }));
const BURST11 = makeBurst(119, 70, { v0: 1300, v1: 3200, s0: 50, s1: 160, spin: 12, delay: 0.05 });
async function sRepeat(t) {
  const i = Math.min(7, Math.floor((t - 10.5) / 0.25)); const s = REP[i]; const lt = t - 10.5 - i * 0.25;
  ctx.fillStyle = s.bg; ctx.fillRect(0, 0, W, H);
  // repeating outline type behind
  for (let r = 0; r < 8; r++) text('REPEAT. REPEAT. REPEAT.', ((r % 2 ? 1 : -1) * t * 500) % 700 - 100, 160 + r * 250, F.anton, 240, 'rgba(0,0,0,0)', { align: 'left', stroke: s.bg === C.black ? '#2c3322' : 'rgba(255,255,255,.18)', strokeW: 3 });
  const pr = 1 + 0.06 * punch(t, 10.5 + i * 0.25, 0.2);
  const rx = 440 * pr, ry = 760 * pr;
  if (s.k === 'b') {
    inOval(540, 900, rx, ry, () => { ctx.fillStyle = C.olive; ctx.fillRect(0, 0, W, H); const bw = 520, bh = bw * 1183 / 993; ctx.drawImage(IMG.bottle, 540 - bw / 2, 920 - bh / 2, bw, bh); }, 0.6);
    drawBurst(BURST11, t, 11.5, 540, 600, { drag: 2.5, g: 600, zoom: 2 });
  } else {
    const img = s.k === 'o' ? await orig(lerp(s.a, s.b, prog(lt, 0, 0.25))) : IMG[s.img];
    inOval(540, 900, rx, ry, () => s.k === 'o' ? cover(img, 0, 0, W, H, 1.22, 0.5, 0.4) : cover(img, 0, 0, W, H, s.z + lt * 0.4, s.fx, s.fy));
    if (s.k === 'i') drawMist(MIST11[i], t, -40, 700, { alpha: 0.5 });
  }
  const n = t < 12.0 ? i + 1 : Math.min(99, 7 + Math.floor(Math.pow(prog(t, 12.0, 12.45), 1.6) * 92));
  text('REPEAT.', 540, 250, F.anton, 220, s.bg === C.red ? C.paper : C.red, { scale: 1 + 0.15 * punch(t, 10.5 + i * 0.25, 0.15) });
  text('×' + n, 540, 1850, F.anton, 300, C.paper, { stroke: C.ink, strokeW: 26, scale: 1 + 0.2 * punch(t, 10.5 + i * 0.25, 0.15) });
  if (t > 12.0 && Math.floor(t * 30) % 3 === 0) flash(t, t - 0.01, 0.25, 0.05);
}

// S12 — never enough (12.5 – 13.5)
const RAIN12 = makeRain(120, 130, { t0: 12.35, t1: 13.3, v0: 1500, v1: 2600, s0: 40, s1: 170 });
const WAVE12 = makeRain(121, 70, { t0: 13.18, t1: 13.36, v0: 3600, v1: 4600, s0: 380, s1: 900 });
function sNever(t) {
  ctx.fillStyle = C.olive; ctx.fillRect(0, 0, W, H);
  drawRain(RAIN12.filter(p => p.z < 0.85), t);
  const [sx, sy] = shake(t, 12.5, 18, 0.2), [sx2, sy2] = shake(t, 13.0, 18, 0.2);
  ctx.save(); ctx.translate(sx + sx2, sy + sy2);
  slam(t, 12.5, 'NEVER', 540, 900, F.anton, fit('NEVER', F.anton, 520, 1000), C.paper, { from: 2, d: 0.12, shadow: 'rgba(0,0,0,.3)' });
  slam(t, 13.0, 'ENOUGH.', 540, 1330, F.anton, fit('ENOUGH.', F.anton, 420, 1000), C.red, { from: 2, d: 0.12, shadow: 'rgba(0,0,0,.3)' });
  ctx.restore();
  drawRain(RAIN12.filter(p => p.z >= 0.85), t);
  drawRain(WAVE12, t, { blurAt: 500 });
  if (t > 13.38) { ctx.fillStyle = `rgba(38,48,32,${prog(t, 13.38, 13.5)})`; ctx.fillRect(0, 0, W, H); }
}

// S13 — pho spray (13.5 – 14.5)
const FALL13 = makeRain(130, 18, { t0: 13.3, t1: 14.4, v0: 500, v1: 900, s0: 50, s1: 140 });
async function sPho(t) {
  const img = await orig(lerp(420, 427, prog(t, 13.5, 14.5)));
  ctx.fillStyle = C.leaf; ctx.fillRect(0, 0, W, H);
  const open = eOutExpo(prog(t, 13.5, 13.75));
  inOval(540, 1010, 470 * lerp(0.2, 1, open), 790 * lerp(0.2, 1, open), () => cover(img, 0, 0, W, H, 1.16 + 0.08 * prog(t, 13.5, 14.5), 0.5, 0.5));
  drawRain(FALL13, t, { swayAmp: 60 });
  slam(t, 13.55, '고수 많이,', 540, 150, F.kr, 92, C.paper, { from: 1.3, d: 0.12 });
  slam(t, 14.0, '이제 내 맘대로.', 540, 1880, F.kr, 92, C.lime, { from: 1.3, d: 0.12 });
}

// S14 — end card (14.5 – 17.5)
const BURST14 = makeBurst(141, 80, { v0: 900, v1: 2600, s0: 40, s1: 150, spin: 10, delay: 0.08 });
const MIST14 = makeMist(142, 220, { e0: 14.5, e1: 14.8, ang: -Math.PI / 2, spread: 1.4, v0: 500, v1: 1600, s0: 40, s1: 120, l0: 0.6, l1: 1.2 });
const ORBIT = Array.from({ length: 12 }, (_, i) => ({ ph: (i / 12) * Math.PI * 2, c: i % 6, s: 56 + (i % 4) * 16, ry: 0.3 + (i % 3) * 0.05 }));
function sEnd(t) {
  const lt = t - 14.5;
  ctx.fillStyle = C.black; ctx.fillRect(0, 0, W, H);
  const open = eOutExpo(prog(t, 14.5, 14.85));
  const rx = 470 * lerp(0.3, 1, open), ry = 820 * lerp(0.3, 1, open);
  inOval(540, 960, rx, ry, () => {
    const g = ctx.createRadialGradient(540, 900, 80, 540, 960, 900); g.addColorStop(0, '#c4cb92'); g.addColorStop(0.6, '#97a16b'); g.addColorStop(1, '#5f6a40');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }, 0.7);
  const cx = 540, cy = 1000;
  const orbitR = eOutBack(prog(t, 14.6, 15.2));
  const orb = (front) => ORBIT.forEach(o => {
    const a = o.ph + lt * 0.9; const z = Math.sin(a); if ((z > 0) !== front) return;
    const x = cx + Math.cos(a) * 420 * orbitR, y = cy + 40 + z * 380 * o.ry * orbitR + Math.sin(lt * 2 + o.ph) * 20;
    leafAt(x, y, o.s * (1 + z * 0.35), a * 1.5, o.c, z < -0.5 ? 1 : 0, clamp(orbitR) * (0.75 + 0.25 * z));
  });
  orb(false);
  const bs = eOutBack(prog(t, 14.5, 14.9));
  const bw = 520 * lerp(0.4, 1, bs) * (1 + 0.012 * Math.sin(lt * 3)), bh = bw * 1183 / 993;
  ctx.drawImage(IMG.bottle, cx - bw / 2, cy - bh / 2 + (1 - bs) * 250, bw, bh);
  drawMist(MIST14, t, cx, cy - bh / 2 + 30, { alpha: 0.45, drag: 3 });
  orb(true);
  drawBurst(BURST14, t, 14.5, cx, cy - 200, { drag: 2.4, g: 900, zoom: 1.6, life: 1.4 });
  // copy
  const sp = eOutCubic(prog(t, 14.75, 15.2));
  text('Cilly', 540, 330 + (1 - sp) * 60, F.serif, 250, C.red, { alpha: sp });
  stagger(t, 15.05, 'NEVER ENOUGH.', 540, 1640, F.anton, 150, C.paper, { step: 0.03, ls: 2 });
  text('CILANTRO 01  /  EDIBLE MIST  /  50 mL', 540, 1730, F.mono, 30, C.lime, { alpha: 0.85 * prog(t, 15.5, 15.9), ls: 2 });
  flash(t, 14.5, 0.6, 0.1);
  if (t > 17.15) { ctx.fillStyle = `rgba(0,0,0,${prog(t, 17.15, 17.5)})`; ctx.fillRect(0, 0, W, H); }
}

const SCENES = [
  [0, 2.0, sOrders], [2.0, 3.5, sThree], [3.5, 4.0, sSpray], [4.0, 5.0, sBurst], [5.0, 5.5, sBite],
  [5.5, 6.5, sPlates], [6.5, 7.5, sCut], [7.5, 9.0, sFragrance], [9.0, 10.0, sGrid], [10.0, 10.5, sLaugh],
  [10.5, 12.5, sRepeat], [12.5, 13.5, sNever], [13.5, 14.5, sPho], [14.5, 17.5, sEnd],
];

let ready = null;
async function init() {
  const fonts = [['Anton', '400', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ.,!×0123456789ÁỀÒ'], ['Noto Sans KR', '900', '고수많이요세잎했는데칙아삭제내맘대로,.…“”'], ['Noto Sans JP', '900', 'パクチー多めで。'], ['Noto Sans SC', '900', '香菜多放!'], ['IBM Plex Mono', '500', 'ORDERNo.0123456789 SEOULHÀNỘI·XIĀNGCÀI“”×+/mL'], ['Instrument Serif', 'italic 400', 'Cilly']];
  await Promise.all(fonts.map(([f, w, s]) => document.fonts.load(`${w} 100px "${f}"`, s)));
  await document.fonts.ready;
  const [bottle, pho, ritual, extra, poster, svg] = await Promise.all([
    load('img/bottle.webp'), load('img/pho.webp'), load('img/ritual.webp'), load('img/mr-extra.webp'), load('img/poster-spray-bite-repeat.webp'), fetch('img/leaf.svg').then(r => r.text()),
  ]);
  Object.assign(IMG, { bottle, pho, ritual, extra, poster });
  buildLeaves(svg.match(/<path d="([^"]+)"/)[1]); buildDot(); buildGrain();
}
window.renderFrame = async function (f) {
  if (!ready) ready = init(); await ready;
  const t = f / FPS;
  const sc = SCENES.find(s => t >= s[0] && t < s[1]) || SCENES[SCENES.length - 1];
  ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  await sc[2](t);
  ctx.restore();
  // film grain
  ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.09;
  ctx.drawImage(GRAIN[f % GRAIN.length], 0, 0, W, H); ctx.restore();
};
window.FRAMES = Math.round(DUR * FPS);
