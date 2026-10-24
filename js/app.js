/*
 * app.js — user interface: schematic, oscilloscopes, controls, theory vs simulation.
 * The physics lives in converter.js.
 */
(function () {
  'use strict';

  const K = window.Converter, T = K.theory;
  const PRESETS = window.ConverterPresets;
  const I18N = window.I18N, t = I18N.t, pick = I18N.pick;
  I18N.init();

  const $ = function (id) { return document.getElementById(id); };
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------- colours ----------------
  const COL = {};
  const SCOPE = { bg: '#0b0f0d', grid: '#1d2a23', axis: '#2f4036', text: '#9fb0a6', ch1: '#f2d33c', ch2: '#3fd0e0', ch3: '#e25fd6', ref: '#e25fd6', gate: 'rgba(242,211,60,0.06)' };
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['bg', 'panel', 'panel-2', 'line', 'fg', 'muted', 'accent', 'cmd', 'est', 'good', 'bad'].forEach(function (k) { COL[k] = cs.getPropertyValue('--' + k).trim(); });
    analysisDirty = true;
  }
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', readColors);
  }
  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  function fit(canvas) {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: r.width, h: r.height };
  }
  function font(size, kind) {
    return size + 'px ' + (kind === 'mono' ? '"IBM Plex Mono", ui-monospace, Consolas, monospace' : '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif');
  }

  // ---------------- number formatting ----------------
  const PREFIX = [[1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n']];
  function eng(v, unit, digits) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    if (v === 0) return '0 ' + unit;
    const a = Math.abs(v);
    let p = PREFIX[PREFIX.length - 1];
    for (let i = 0; i < PREFIX.length; i++) { if (a >= PREFIX[i][0] * 0.9995) { p = PREFIX[i]; break; } }
    const x = v / p[0];
    const d = digits !== undefined ? digits : (Math.abs(x) >= 100 ? 0 : Math.abs(x) >= 10 ? 1 : 2);
    return x.toFixed(d) + ' ' + p[1] + unit;
  }
  function niceFloor(x) {
    const e = Math.pow(10, Math.floor(Math.log10(x) + 1e-9));
    const m = x / e * (1 + 1e-9);
    return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * e;
  }
  function nice125(x) {
    const e = Math.pow(10, Math.floor(Math.log10(x)));
    const m = x / e;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e;
  }

  // ---------------- simulation state ----------------
  let topology = 'buck';
  const conv = K.createConverter(K.makeConfig('buck'));
  const cfg = conv.cfg, st = conv.state;
  const base = { R: cfg.R, vin: cfg.vin };   // values before a load / input step
  let loadStepped = false, vinStepped = false;
  let savedReal = null;                     // component values before "make ideal"

  const TRN = 1500;                         // periods shown on the transient scope
  const tr = [];                            // {t, v, i, d}
  const swPeriods = [];                     // sample arrays of the last committed periods
  let pending = null, pendingSum = null;    // period being "played" on screen
  let phase = 0;                            // 0..1 inside the pending period
  let running = true, pps = 200;

  function runPending() {
    const out = [];
    pendingSum = conv.period({ every: 4, out: out });
    pending = out;
  }
  function commitPending() {
    swPeriods.push(pending);
    if (swPeriods.length > 12) swPeriods.shift();
    tr.push({ t: pendingSum.t0, v: pendingSum.vAvg, i: pendingSum.iAvg, d: pendingSum.d, dcm: pendingSum.dcm });
    if (tr.length > TRN) tr.shift();
    lastSum = pendingSum;
  }
  let lastSum = null;

  function restartAt(iL, vC) {
    conv.reset(iL, vC);
    tr.length = 0; swPeriods.length = 0; phase = 0;
    runPending();
  }
  function restartSteady() {
    const d0 = cfg.control === 'closed' ? T.dutyForMode(cfg, cfg.vref, cfg.dMin, cfg.dMax) : K.clamp(cfg.d, cfg.dMin, cfg.dMax);
    const v0 = Math.max(0, T.isDCM(cfg, d0) ? T.voutIdeal(cfg, d0) : T.voutReal(cfg, d0));
    const i0 = T.isDCM(cfg, d0) ? 0 : (topology === 'buck' ? v0 / cfg.R : v0 / (cfg.R * (1 - d0)));
    restartAt(i0, v0);
  }

  // ================= SCHEMATIC =================
  // coordinates are fractions of the canvas; paths list points in the direction of the current
  const LAYOUT = {
    buck: {
      parts: [
        { kind: 'source', x: 0.08, y1: 0.24, y2: 0.82 },
        { kind: 'switchH', x1: 0.18, x2: 0.32, y: 0.24 },
        { kind: 'diodeV', x: 0.40, y1: 0.82, y2: 0.24 },
        { kind: 'inductor', x1: 0.46, x2: 0.62, y: 0.24 },
        { kind: 'cap', x: 0.72, y1: 0.24, y2: 0.82 },
        { kind: 'res', x: 0.88, y1: 0.24, y2: 0.82 }
      ],
      wires: [[0.08, 0.24, 0.18, 0.24], [0.32, 0.24, 0.46, 0.24], [0.62, 0.24, 0.88, 0.24], [0.08, 0.82, 0.88, 0.82]],
      dots: [[0.40, 0.24], [0.72, 0.24], [0.40, 0.82], [0.72, 0.82]],
      paths: {
        on: [[0.08, 0.82], [0.08, 0.24], [0.40, 0.24], [0.72, 0.24], [0.88, 0.24], [0.88, 0.82], [0.08, 0.82]],
        off: [[0.40, 0.82], [0.40, 0.24], [0.72, 0.24], [0.88, 0.24], [0.88, 0.82], [0.40, 0.82]],
        idle: [[0.72, 0.24], [0.88, 0.24], [0.88, 0.82], [0.72, 0.82], [0.72, 0.24]]
      },
      labels: { L: [0.54, 0.24], C: [0.72, 0.53], R: [0.88, 0.53], vin: [0.08, 0.53], sw: [0.25, 0.24], d: [0.40, 0.53] }
    },
    boost: {
      parts: [
        { kind: 'source', x: 0.08, y1: 0.24, y2: 0.82 },
        { kind: 'inductor', x1: 0.16, x2: 0.32, y: 0.24 },
        { kind: 'switchV', x: 0.40, y1: 0.24, y2: 0.82 },
        { kind: 'diodeH', x1: 0.48, x2: 0.60, y: 0.24 },
        { kind: 'cap', x: 0.72, y1: 0.24, y2: 0.82 },
        { kind: 'res', x: 0.88, y1: 0.24, y2: 0.82 }
      ],
      wires: [[0.08, 0.24, 0.16, 0.24], [0.32, 0.24, 0.48, 0.24], [0.60, 0.24, 0.88, 0.24], [0.08, 0.82, 0.88, 0.82]],
      dots: [[0.40, 0.24], [0.72, 0.24], [0.40, 0.82], [0.72, 0.82]],
      paths: {
        on: [[0.08, 0.82], [0.08, 0.24], [0.40, 0.24], [0.40, 0.82], [0.08, 0.82]],
        off: [[0.08, 0.82], [0.08, 0.24], [0.40, 0.24], [0.72, 0.24], [0.88, 0.24], [0.88, 0.82], [0.08, 0.82]],
        idle: [[0.72, 0.24], [0.88, 0.24], [0.88, 0.82], [0.72, 0.82], [0.72, 0.24]]
      },
      labels: { L: [0.24, 0.24], C: [0.72, 0.53], R: [0.88, 0.53], vin: [0.08, 0.53], sw: [0.40, 0.53], d: [0.54, 0.24] }
    }
  };

  function currentSample() {
    if (!pending || !pending.length) return null;
    return pending[Math.min(pending.length - 1, Math.floor(phase * pending.length))];
  }

  let dashOffset = 0;
  function drawSchematic(dtFrame) {
    const f = fit($('schematic')), ctx = f.ctx, W = f.w, H = f.h;
    ctx.clearRect(0, 0, W, H);
    const lay = LAYOUT[topology];
    const X = function (x) { return 24 + x * (W - 48); }, Y = function (y) { return y * H; };
    const smp = currentSample();
    const on = smp ? smp.on : false;
    const blocked = smp ? (!smp.on && smp.iL <= 1e-9) : false;
    const state = on ? 'on' : (blocked ? 'idle' : 'off');

    // active current path, drawn under the circuit
    const pathCol = state === 'on' ? COL.cmd : state === 'off' ? COL.est : COL.muted;
    if (!reduceMotion && running) dashOffset -= dtFrame * 40;
    function path(pts, col, width, dash) {
      ctx.save();
      ctx.strokeStyle = col; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.setLineDash(dash || []); ctx.lineDashOffset = dashOffset;
      ctx.beginPath();
      pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(X(p[0]), Y(p[1])); else ctx.lineTo(X(p[0]), Y(p[1])); });
      ctx.stroke(); ctx.restore();
    }
    ctx.globalAlpha = 0.22; path(lay.paths[state], pathCol, 12); ctx.globalAlpha = 1;
    path(lay.paths[state], pathCol, 2.5, [7, 9]);
    // with the boost switch ON, the capacitor still feeds the load
    if (topology === 'boost' && state === 'on') { ctx.globalAlpha = 0.18; path(lay.paths.idle, COL.muted, 10); ctx.globalAlpha = 1; path(lay.paths.idle, COL.muted, 2, [7, 9]); }

    // wires
    ctx.strokeStyle = COL.fg; ctx.lineWidth = 1.6; ctx.setLineDash([]);
    lay.wires.forEach(function (w) { ctx.beginPath(); ctx.moveTo(X(w[0]), Y(w[1])); ctx.lineTo(X(w[2]), Y(w[3])); ctx.stroke(); });
    ctx.fillStyle = COL.fg;
    lay.dots.forEach(function (d) { ctx.beginPath(); ctx.arc(X(d[0]), Y(d[1]), 3, 0, Math.PI * 2); ctx.fill(); });

    // components
    const u = Math.min(W * 0.045, H * 0.09);
    lay.parts.forEach(function (p) { drawPart(ctx, p, X, Y, u, on); });

    // labels
    ctx.font = font(12, 'mono'); ctx.fillStyle = COL.muted; ctx.textBaseline = 'middle';
    function label(key, text, dx, dy, align) {
      const pos = lay.labels[key]; ctx.textAlign = align || 'left';
      ctx.fillText(text, X(pos[0]) + dx, Y(pos[1]) + dy);
    }
    label('vin', eng(cfg.vin, 'V'), u * 0.9 + 6, 0, 'left');
    label('L', 'L = ' + eng(cfg.L, 'H'), 0, -u * 1.45, 'center');
    label('C', eng(cfg.C, 'F'), -u * 0.8 - 4, 0, 'right');
    label('R', eng(cfg.R, 'Ω'), u * 0.6 + 4, 0, 'left');

    // live values
    ctx.font = font(13, 'mono'); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const iL = smp ? smp.iL : st.iL, vo = smp ? smp.vC : st.vC;
    ctx.fillStyle = COL.est;
    ctx.fillText('iL = ' + eng(iL, 'A'), X(lay.labels.L[0]) - 40, Y(0.24) + u * 1.15);
    ctx.fillStyle = COL.fg;
    ctx.textAlign = 'right';
    ctx.fillText('Vout = ' + eng(vo, 'V'), X(0.88) + u * 0.6, Y(0.08));
    ctx.textAlign = 'left';
    ctx.fillStyle = COL.muted;
    ctx.fillText('D = ' + (st.d * 100).toFixed(1) + ' %', X(0) - 12, Y(0.08));
  }

  function drawPart(ctx, p, X, Y, u, on) {
    ctx.save();
    ctx.strokeStyle = COL.fg; ctx.fillStyle = COL.panel; ctx.lineWidth = 1.8; ctx.setLineDash([]);
    if (p.kind === 'source') {
      const x = X(p.x), ym = (Y(p.y1) + Y(p.y2)) / 2, r = u * 0.75;
      ctx.beginPath(); ctx.moveTo(x, Y(p.y1)); ctx.lineTo(x, ym - r); ctx.moveTo(x, ym + r); ctx.lineTo(x, Y(p.y2)); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, ym, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.font = font(13, 'mono'); ctx.fillStyle = COL.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('+', x, ym - r * 0.45); ctx.fillText('−', x, ym + r * 0.45);
    } else if (p.kind === 'res') {
      const x = X(p.x), y1 = Y(p.y1), y2 = Y(p.y2), ym = (y1 + y2) / 2, h = u * 1.6;
      ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, ym - h / 2);
      for (let i = 0; i < 6; i++) ctx.lineTo(x + (i % 2 ? -1 : 1) * u * 0.35, ym - h / 2 + (i + 0.5) * h / 6);
      ctx.lineTo(x, ym + h / 2); ctx.lineTo(x, y2); ctx.stroke();
    } else if (p.kind === 'cap') {
      const x = X(p.x), y1 = Y(p.y1), y2 = Y(p.y2), ym = (y1 + y2) / 2, g = u * 0.18, w = u * 0.6;
      ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, ym - g); ctx.moveTo(x, ym + g); ctx.lineTo(x, y2); ctx.stroke();
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(x - w, ym - g); ctx.lineTo(x + w, ym - g); ctx.moveTo(x - w, ym + g); ctx.lineTo(x + w, ym + g); ctx.stroke();
    } else if (p.kind === 'inductor') {
      const x1 = X(p.x1), x2 = X(p.x2), y = Y(p.y), n = 4, r = (x2 - x1) / (2 * n);
      ctx.beginPath(); ctx.moveTo(x1, y);
      for (let i = 0; i < n; i++) ctx.arc(x1 + r + 2 * r * i, y, r, Math.PI, 0, false);
      ctx.stroke();
    } else if (p.kind === 'diodeV' || p.kind === 'diodeH') {
      // drawn from anode (1) to cathode (2)
      const vert = p.kind === 'diodeV';
      const a = vert ? [X(p.x), Y(p.y1)] : [X(p.x1), Y(p.y)];
      const c = vert ? [X(p.x), Y(p.y2)] : [X(p.x2), Y(p.y)];
      const m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], s = u * 0.45;
      const dir = vert ? [0, Math.sign(c[1] - a[1])] : [Math.sign(c[0] - a[0]), 0];
      const nrm = [-dir[1], dir[0]];
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(m[0] - dir[0] * s, m[1] - dir[1] * s);
      ctx.moveTo(m[0] + dir[0] * s, m[1] + dir[1] * s); ctx.lineTo(c[0], c[1]); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(m[0] - dir[0] * s + nrm[0] * s, m[1] - dir[1] * s + nrm[1] * s);
      ctx.lineTo(m[0] - dir[0] * s - nrm[0] * s, m[1] - dir[1] * s - nrm[1] * s);
      ctx.lineTo(m[0] + dir[0] * s, m[1] + dir[1] * s); ctx.closePath();
      ctx.fillStyle = COL.fg; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(m[0] + dir[0] * s + nrm[0] * s, m[1] + dir[1] * s + nrm[1] * s);
      ctx.lineTo(m[0] + dir[0] * s - nrm[0] * s, m[1] + dir[1] * s - nrm[1] * s); ctx.lineWidth = 2.4; ctx.stroke();
    } else if (p.kind === 'switchH' || p.kind === 'switchV') {
      const vert = p.kind === 'switchV';
      const a = vert ? [X(p.x), Y(p.y1)] : [X(p.x1), Y(p.y)];
      const b = vert ? [X(p.x), Y(p.y2)] : [X(p.x2), Y(p.y)];
      const len = vert ? b[1] - a[1] : b[0] - a[0];
      const g1 = vert ? [a[0], a[1] + len * 0.32] : [a[0] + len * 0.25, a[1]];
      const g2 = vert ? [a[0], a[1] + len * 0.68] : [a[0] + len * 0.75, a[1]];
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(g1[0], g1[1]); ctx.moveTo(g2[0], g2[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.fillStyle = COL.fg;
      [g1, g2].forEach(function (g) { ctx.beginPath(); ctx.arc(g[0], g[1], 3, 0, Math.PI * 2); ctx.fill(); });
      // lever: closed = straight, open = lifted (with a halo in the panel colour so it stays visible)
      ctx.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass === 0 ? COL.panel : (on ? COL.cmd : COL.fg); ctx.lineWidth = pass === 0 ? 7 : 3;
      ctx.beginPath(); ctx.moveTo(g1[0], g1[1]);
      if (on) ctx.lineTo(g2[0], g2[1]);
      else if (vert) ctx.lineTo(g2[0] - Math.abs(g2[1] - g1[1]) * 0.6, g2[1] - Math.abs(g2[1] - g1[1]) * 0.2);
      else ctx.lineTo(g2[0] - (g2[0] - g1[0]) * 0.2, g2[1] - (g2[0] - g1[0]) * 0.55);
      ctx.stroke();
      }
      ctx.fillStyle = COL.fg;
      [g1, g2].forEach(function (g) { ctx.beginPath(); ctx.arc(g[0], g[1], 3.5, 0, Math.PI * 2); ctx.fill(); });
      ctx.font = font(11, 'mono'); ctx.fillStyle = COL.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      if (vert) { ctx.textAlign = 'left'; ctx.fillText('S', g1[0] + 12, (g1[1] + g2[1]) / 2); }
      else ctx.fillText('S', (g1[0] + g2[0]) / 2, g1[1] + 18);
    }
    ctx.restore();
  }

  // ================= OSCILLOSCOPES =================
  function scopeFrame(ctx, W, H) {
    ctx.fillStyle = SCOPE.bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = SCOPE.grid; ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) { const x = Math.round(i * W / 10) + 0.5; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let j = 0; j <= 8; j++) { const y = Math.round(j * H / 8) + 0.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // centre graticule ticks
    ctx.strokeStyle = SCOPE.axis;
    for (let i = 0; i <= 50; i++) { const x = i * W / 50; ctx.beginPath(); ctx.moveTo(x, H / 2 - 3); ctx.lineTo(x, H / 2 + 3); ctx.stroke(); }
    for (let j = 0; j <= 40; j++) { const y = j * H / 40; ctx.beginPath(); ctx.moveTo(W / 2 - 3, y); ctx.lineTo(W / 2 + 3, y); ctx.stroke(); }
  }
  function groundMark(ctx, y, col, n) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, y - 6); ctx.lineTo(12, y); ctx.lineTo(0, y + 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = SCOPE.bg; ctx.font = font(9, 'mono'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(n, 2, y + 0.5);
  }
  function trace(ctx, pts, col, width) {
    if (pts.length < 2) return;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = width || 1.8; ctx.shadowColor = col; ctx.shadowBlur = 4;
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
    ctx.stroke(); ctx.restore();
  }
  function chanLegend(id, items) {
    $(id).innerHTML = items.map(function (it) {
      return '<span><b style="background:' + it.col + '">' + it.n + '</b>' + it.label + ' · ' + it.scale + '</span>';
    }).join('');
  }

  let swLegendKey = '', trLegendKey = '';
  function drawSwitchingScope() {
    const f = fit($('scope-sw')), ctx = f.ctx, W = f.w, H = f.h;
    scopeFrame(ctx, W, H);
    const Ts = 1 / cfg.fs;
    const tb = niceFloor(5 * Ts / 10);      // 2.5 to 5 periods on screen
    const win = 10 * tb;

    // samples: committed periods + the part of the pending one already "played"
    const played = pending ? pending.slice(0, Math.max(1, Math.floor(phase * pending.length))) : [];
    let all = [];
    swPeriods.forEach(function (p) { all = all.concat(p); });
    all = all.concat(played);
    if (all.length < 2) return;
    const tEnd = all[all.length - 1].t;
    // trigger on the switch turn-on: the latest period start that leaves a full window
    let t0 = null;
    for (let k = swPeriods.length - 1; k >= 0; k--) {
      const s0 = swPeriods[k][0].t;
      if (s0 + win <= tEnd + 1e-12) { t0 = s0; break; }
    }
    if (t0 === null) t0 = all[0].t;
    const vis = all.filter(function (s) { return s.t >= t0 - 1e-12 && s.t <= t0 + win + 1e-12; });

    // scales
    let vmax = 0, imax = 0, vlo = Infinity, vhi = -Infinity, vsum = 0;
    vis.forEach(function (s) { vmax = Math.max(vmax, Math.abs(s.vsw)); imax = Math.max(imax, Math.abs(s.iL)); vlo = Math.min(vlo, s.vC); vhi = Math.max(vhi, s.vC); vsum += s.vC; });
    const vmean = vsum / vis.length;
    const vdiv = nice125(Math.max(vmax, 0.1) / 2.6);
    const idiv = nice125(Math.max(imax, 0.01) / 2.6);
    const rdiv = nice125(Math.max(vhi - vlo, 1e-5) / 1.7);
    const dy = H / 8;
    const z1 = H - 5.2 * dy, z2 = H - 2.2 * dy, z3 = H - 1.0 * dy;
    const X = function (tt) { return (tt - t0) / win * W; };

    // switch ON shading
    ctx.fillStyle = SCOPE.gate;
    let start = null;
    vis.forEach(function (s, i) {
      if (s.on && start === null) start = s.t;
      if ((!s.on || i === vis.length - 1) && start !== null) { ctx.fillRect(X(start), 0, X(s.t) - X(start), H); start = null; }
    });

    trace(ctx, vis.map(function (s) { return [X(s.t), z1 - s.vsw / vdiv * dy]; }), SCOPE.ch1);
    trace(ctx, vis.map(function (s) { return [X(s.t), z2 - s.iL / idiv * dy]; }), SCOPE.ch2);
    trace(ctx, vis.map(function (s) { return [X(s.t), z3 - (s.vC - vmean) / rdiv * dy]; }), SCOPE.ch3, 1.5);
    groundMark(ctx, z1, SCOPE.ch1, '1'); groundMark(ctx, z2, SCOPE.ch2, '2'); groundMark(ctx, z3, SCOPE.ch3, '3');
    // trigger marker
    ctx.fillStyle = SCOPE.text; ctx.font = font(10, 'mono'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('T↑', 4, 4);

    $('tb-sw').textContent = t('tb', { v: eng(tb, 's', 0) }) + ' · f = ' + eng(cfg.fs, 'Hz', 0);
    const key = [I18N.lang, vdiv, idiv, rdiv].join('|');
    if (key !== swLegendKey) {
      swLegendKey = key;
      chanLegend('chans-sw', [
        { n: 1, col: SCOPE.ch1, label: t('ch.vsw'), scale: t('tb', { v: eng(vdiv, 'V', 0) }) },
        { n: 2, col: SCOPE.ch2, label: t('ch.il'), scale: t('tb', { v: eng(idiv, 'A', 0) }) },
        { n: 3, col: SCOPE.ch3, label: t('ch.vripple'), scale: t('tb', { v: eng(rdiv, 'V', 0) }) }
      ]);
    }
  }

  function drawTransientScope() {
    const f = fit($('scope-tr')), ctx = f.ctx, W = f.w, H = f.h;
    scopeFrame(ctx, W, H);
    if (tr.length < 2) return;
    const Ts = 1 / cfg.fs;
    const span = TRN * Ts;
    const tb = niceFloor(span / 10), win = 10 * tb;
    const tEnd = tr[tr.length - 1].t + Ts;
    const t0 = tEnd - win;
    const X = function (tt) { return (tt - t0) / win * W; };
    let vmax = cfg.control === 'closed' ? cfg.vref : 0, imax = 0;
    tr.forEach(function (p) { vmax = Math.max(vmax, p.v); imax = Math.max(imax, p.i); });
    const vdiv = nice125(Math.max(vmax, 0.1) / 6.4), idiv = nice125(Math.max(imax, 0.01) / 6.4);
    const dy = H / 8, z = H - 0.6 * dy;
    const vis = tr.filter(function (p) { return p.t >= t0; });
    if (cfg.control === 'closed') {
      ctx.save(); ctx.strokeStyle = SCOPE.ref; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.2;
      const y = z - cfg.vref / vdiv * dy; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.restore();
    }
    trace(ctx, vis.map(function (p) { return [X(p.t), z - p.i / idiv * dy]; }), SCOPE.ch2, 1.5);
    trace(ctx, vis.map(function (p) { return [X(p.t), z - p.v / vdiv * dy]; }), SCOPE.ch1, 1.8);
    groundMark(ctx, z, SCOPE.ch1, '1');

    $('tb-tr').textContent = t('tb', { v: eng(tb, 's', 0) });
    const key = [I18N.lang, vdiv, idiv, cfg.control].join('|');
    if (key !== trLegendKey) {
      trLegendKey = key;
      const items = [
        { n: 1, col: SCOPE.ch1, label: t('ch.vout'), scale: t('tb', { v: eng(vdiv, 'V', 0) }) },
        { n: 2, col: SCOPE.ch2, label: t('ch.iavg'), scale: t('tb', { v: eng(idiv, 'A', 0) }) }
      ];
      chanLegend('chans-tr', items);
      if (cfg.control === 'closed') $('chans-tr').insertAdjacentHTML('beforeend', '<span><b style="background:' + SCOPE.ref + '">ref</b>' + t('ch.vref') + ' = ' + eng(cfg.vref, 'V') + '</span>');
    }
  }

  // ================= STATUS =================
  function updateStatus() {
    const smp = currentSample();
    const sw = $('chip-switch');
    const isOn = smp && smp.on, idle = smp && !smp.on && smp.iL <= 1e-9;
    if (pps > 20) { sw.textContent = 'f = ' + eng(cfg.fs, 'Hz', 0); sw.className = 'chip chip-switch'; }
    else { sw.textContent = isOn ? t('chip.on') : idle ? t('chip.idle') : t('chip.off'); sw.className = 'chip chip-switch' + (isOn ? ' on' : ''); }
    const dcm = lastSum ? lastSum.dcm : false;
    const m = $('chip-mode');
    m.textContent = dcm ? t('chip.dcm') : t('chip.ccm');
    m.className = 'chip' + (dcm ? ' dcm' : '');
  }

  // ================= THEORY VS SIMULATION =================
  let analysisDirty = true, analysisTimer = null, result = null;
  function scheduleAnalysis() {
    clearTimeout(analysisTimer);
    analysisTimer = setTimeout(function () {
      result = K.steadyState(Object.assign({}, cfg));
      renderAnalysis();
    }, 180);
  }

  // duty that gives vref with the lossy formula (CCM), by bisection
  function dutyReal(vref) {
    let lo = cfg.dMin, hi = cfg.dMax;
    if (T.voutReal(cfg, hi) < vref) return null;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (T.voutReal(cfg, mid) < vref) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }

  function renderAnalysis() {
    if (!result) return;
    const m = result, closed = cfg.control === 'closed';
    const d = closed ? m.d : K.clamp(cfg.d, cfg.dMin, cfg.dMax);
    const dcmTh = T.isDCM(cfg, d);
    const rows = [];
    function cls(sim, ref, tol) { return (ref === null || !isFinite(ref)) ? 'sim' : (Math.abs(sim - ref) <= tol * Math.abs(ref) ? 'sim match' : 'sim off'); }

    if (closed) {
      const dI = T.dutyForMode(cfg, cfg.vref, cfg.dMin, cfg.dMax), dR = dcmTh ? null : dutyReal(cfg.vref);
      rows.push([t('r.d'), (dI * 100).toFixed(1) + ' %', dR === null ? '—' : (dR * 100).toFixed(1) + ' %', (m.d * 100).toFixed(1) + ' %', cls(m.d, dR !== null ? dR : dI, 0.02)]);
      rows.push([t('r.vout'), eng(cfg.vref, 'V', 3), eng(cfg.vref, 'V', 3), eng(m.vout, 'V', 3), cls(m.vout, cfg.vref, 0.005)]);
    } else {
      const vI = T.voutIdeal(cfg, d), vR = dcmTh ? null : T.voutReal(cfg, d);
      rows.push([t('r.vout'), eng(vI, 'V', 3), vR === null ? '—' : eng(vR, 'V', 3), eng(m.vout, 'V', 3), cls(m.vout, vR !== null ? vR : vI, 0.02)]);
    }
    if (dcmTh) {
      rows.push([t('r.ripi'), t('r.na'), '—', eng(m.rippleI, 'A'), 'sim', 'dim']);
      rows.push([t('r.ripv'), t('r.na'), '—', eng(m.rippleV, 'V'), 'sim', 'dim']);
    } else {
      rows.push([t('r.ripi'), eng(T.rippleI(cfg, d), 'A'), '—', eng(m.rippleI, 'A'), cls(m.rippleI, T.rippleI(cfg, d), 0.1)]);
      rows.push([t('r.ripv'), eng(T.rippleV(cfg, d), 'V'), '—', eng(m.rippleV, 'V'), cls(m.rippleV, T.rippleV(cfg, d), 0.2)]);
    }
    const Kv = T.K(cfg), Kc = T.Kcrit(cfg, d);
    rows.push([t('r.mode'), (dcmTh ? t('mode.dcm') : t('mode.ccm')) + ' · K = ' + Kv.toFixed(3) + (dcmTh ? ' < ' : ' > ') + 'K<sub>crit</sub> = ' + Kc.toFixed(3), '—',
      m.dcm ? t('mode.dcm') : t('mode.ccm'), (m.dcm === dcmTh) ? 'sim match' : 'sim off']);
    rows.push([t('r.eff'), '100 %', '—', (m.efficiency * 100).toFixed(1) + ' %', 'sim']);

    $('cmp').querySelector('tbody').innerHTML = rows.map(function (r) {
      const idealCls = r[5] === 'dim' ? ' class="dim"' : '';
      return '<tr><td>' + r[0] + '</td><td' + idealCls + '>' + r[1] + '</td><td>' + r[2] + '</td><td class="' + r[4] + '">' + r[3] + '</td></tr>';
    }).join('');
    $('formulas').innerHTML = t(topology === 'buck' ? 'formulas.buck' : 'formulas.boost');
    $('eff-sub').textContent = t('p.eff', { e: (m.efficiency * 100).toFixed(1) });

    // loop note / unreachable target
    if (closed) {
      const ff = T.dutyForMode(cfg, cfg.vref, cfg.dMin, cfg.dMax);
      const ld = T.loopDesign(cfg, ff);
      let html = t('loop.note', { mode: ld.mode === 'DCM' ? t('mode.dcm') : t('mode.ccm'), f: (ld.wc / (2 * Math.PI)).toFixed(ld.wc / (2 * Math.PI) < 100 ? 1 : 0) });
      if (m.d <= cfg.dMin + 1e-3 || m.d >= cfg.dMax - 1e-3) html += ' <strong>' + t('loop.unreach', { lo: cfg.dMin, hi: cfg.dMax }) + '</strong>';
      $('loop-note').innerHTML = html;
    }
    drawLosses(); drawChar();
    $('R-out').textContent = eng(cfg.R, 'Ω') + '  (' + eng(m.iOut, 'A') + ')';
    analysisDirty = false;
  }

  function drawLosses() {
    const f = fit($('losses')), ctx = f.ctx, W = f.w, H = f.h;
    ctx.clearRect(0, 0, W, H);
    if (!result) return;
    const m = result;
    const items = [
      ['loss.out', m.pOut, COL.good],
      ['loss.switchCond', m.loss.switchCond, COL.accent],
      ['loss.switching', m.loss.switching, COL.accent],
      ['loss.diode', m.loss.diode, COL.accent],
      ['loss.inductor', m.loss.inductor, COL.accent]
    ];
    const total = m.pOut + m.lossTotal;
    const labelW = Math.min(170, W * 0.42), barX = labelW + 8, valW = 92;
    const rowH = Math.min(38, (H - 10) / items.length);
    const maxLoss = Math.max(1e-9, m.loss.switchCond, m.loss.switching, m.loss.diode, m.loss.inductor);
    items.forEach(function (it, i) {
      const y = 6 + i * rowH;
      ctx.font = font(13); ctx.fillStyle = COL.fg; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(t(it[0]), labelW, y + rowH / 2);
      const avail = Math.max(10, W - barX - valW);
      // output bar on the total scale, loss bars magnified on their own scale
      const frac = i === 0 ? it[1] / total : it[1] / maxLoss;
      ctx.fillStyle = it[2]; ctx.globalAlpha = i === 0 ? 0.85 : 0.75;
      ctx.fillRect(barX, y + rowH * 0.2, Math.max(1, frac * avail), rowH * 0.6);
      ctx.globalAlpha = 1;
      ctx.font = font(12, 'mono'); ctx.fillStyle = COL.muted; ctx.textAlign = 'left';
      ctx.fillText(eng(it[1], 'W') + '  ' + (it[1] / total * 100).toFixed(1) + '%', barX + Math.max(1, frac * avail) + 6, y + rowH / 2);
    });
  }

  function drawChar() {
    const f = fit($('char')), ctx = f.ctx, W = f.w, H = f.h;
    ctx.clearRect(0, 0, W, H);
    if (!result) return;
    const padL = 44, padR = 14, top = 10, bottom = 26;
    const dLo = 0.02, dHi = topology === 'boost' ? 0.985 : 0.95;
    const d = cfg.control === 'closed' ? result.d : K.clamp(cfg.d, cfg.dMin, cfg.dMax);
    const opY = result.vout / cfg.vin;
    let yMax;
    if (topology === 'buck') yMax = Math.max(1.05, opY * 1.1);
    else {
      let peak = 0; for (let x = 0.02; x < 0.985; x += 0.005) peak = Math.max(peak, T.voutReal(cfg, x) / cfg.vin);
      yMax = Math.min(16, Math.max(4, opY * 1.3, peak * 1.25));
    }
    const X = function (x) { return padL + (x - dLo) / (dHi - dLo) * (W - padL - padR); };
    const Y = function (y) { return top + (1 - y / yMax) * (H - top - bottom); };

    ctx.strokeStyle = COL.line; ctx.lineWidth = 1; ctx.font = font(11, 'mono'); ctx.fillStyle = COL.muted;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let x = 0.1; x <= dHi + 1e-9; x += 0.1) { ctx.beginPath(); ctx.moveTo(X(x), top); ctx.lineTo(X(x), H - bottom); ctx.stroke(); ctx.fillText(x.toFixed(1), X(x), H - bottom + 5); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const ys = nice125(yMax / 5);
    for (let y = 0; y <= yMax + 1e-9; y += ys) { ctx.beginPath(); ctx.moveTo(padL, Y(y)); ctx.lineTo(W - padR, Y(y)); ctx.stroke(); ctx.fillText(y.toFixed(ys < 1 ? 1 : 0), padL - 6, Y(y)); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('D', W - padR, H - bottom - 2);

    function curve(fn, col, width, dash) {
      ctx.save(); ctx.beginPath(); ctx.rect(padL, top, W - padL - padR, H - top - bottom); ctx.clip();
      ctx.strokeStyle = col; ctx.lineWidth = width; ctx.setLineDash(dash || []);
      ctx.beginPath();
      let first = true;
      for (let i = 0; i <= 300; i++) {
        const x = dLo + (dHi - dLo) * i / 300, y = fn(x);
        if (!isFinite(y)) { first = true; continue; }
        if (first) { ctx.moveTo(X(x), Y(y)); first = false; } else ctx.lineTo(X(x), Y(y));
      }
      ctx.stroke(); ctx.restore();
    }
    curve(function (x) { return T.gainIdeal(cfg, x); }, COL.muted, 1.5);
    curve(function (x) { return T.isDCM(cfg, x) ? T.voutIdeal(cfg, x) / cfg.vin : NaN; }, COL.est, 2, [6, 5]);
    curve(function (x) { return T.voutReal(cfg, x) / cfg.vin; }, COL.accent, 2.2);
    // operating point
    ctx.fillStyle = COL.cmd; ctx.strokeStyle = COL.panel; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(d), Y(Math.min(opY, yMax)), 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = font(12, 'mono'); ctx.fillStyle = COL.cmd; ctx.textAlign = X(d) > W - 150 ? 'right' : 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('D = ' + d.toFixed(3) + ', ' + opY.toFixed(3), X(d) + (ctx.textAlign === 'left' ? 9 : -9), Y(Math.min(opY, yMax)) - 6);

    const lg = [['lg.ideal', COL.muted, ''], ['lg.real', COL.accent, ''], ['lg.dcm', COL.est, 'dashed'], ['lg.op', COL.cmd, 'dot']];
    $('char-legend').innerHTML = lg.map(function (l) {
      const key = l[2] === 'dot' ? '<span class="key" style="width:10px;height:10px;border:0;border-radius:50%;background:' + l[1] + '"></span>'
        : '<span class="key" style="border-color:' + l[1] + ';border-top-style:' + (l[2] || 'solid') + '"></span>';
      return '<li>' + key + t(l[0]) + '</li>';
    }).join('');
  }

  // ================= CONTROLS =================
  function logMap(min, max) {
    return {
      toVal: function (x) { return min * Math.pow(max / min, x / 1000); },
      toPos: function (v) { return Math.round(1000 * Math.log(v / min) / Math.log(max / min)); }
    };
  }
  const LOG = { R: logMap(0.5, 500), fs: logMap(10e3, 500e3), L: logMap(2.2e-6, 1e-3), C: logMap(4.7e-6, 2.2e-3), speed: logMap(0.25, 4) };

  function changed(restart) {
    swLegendKey = ''; trLegendKey = '';
    if (restart) restartSteady();
    scheduleAnalysis();
  }

  function syncInputs() {
    $('vin').value = cfg.vin; $('vin-out').textContent = eng(cfg.vin, 'V');
    $('R').value = LOG.R.toPos(cfg.R); $('R-out').textContent = eng(cfg.R, 'Ω') + '  (' + eng(cfg.control === 'closed' ? cfg.vref / cfg.R : (result ? result.iOut : 0), 'A') + ')';
    $('d').value = cfg.d; $('d-out').textContent = cfg.d.toFixed(3);
    $('vref').value = cfg.vref; $('vref-out').textContent = eng(cfg.vref, 'V');
    $('speed').value = LOG.speed.toPos(cfg.loopSpeed); $('speed-out').textContent = '×' + cfg.loopSpeed.toFixed(2);
    $('fs').value = LOG.fs.toPos(cfg.fs); $('fs-out').textContent = eng(cfg.fs, 'Hz');
    $('L').value = LOG.L.toPos(cfg.L); $('L-out').textContent = eng(cfg.L, 'H');
    $('C').value = LOG.C.toPos(cfg.C); $('C-out').textContent = eng(cfg.C, 'F');
    $('ron').value = cfg.ron; $('ron-out').textContent = eng(cfg.ron, 'Ω');
    $('rl').value = cfg.rl; $('rl-out').textContent = eng(cfg.rl, 'Ω');
    $('vf').value = cfg.vf; $('vf-out').textContent = eng(cfg.vf, 'V');
    $('tsw').value = cfg.tsw * 1e9; $('tsw-out').textContent = eng(cfg.tsw, 's', 0);
    document.querySelectorAll('[data-topo]').forEach(function (b) { const on = b.getAttribute('data-topo') === topology; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    document.querySelectorAll('[data-ctrl]').forEach(function (b) { const on = b.getAttribute('data-ctrl') === cfg.control; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    $('open-fields').hidden = cfg.control === 'closed';
    $('closed-fields').hidden = cfg.control !== 'closed';
    $('load-step').innerHTML = loadStepped ? t('btn.loadback') : t('btn.loadstep');
    $('load-step').classList.toggle('on', loadStepped);
    $('vin-step').innerHTML = vinStepped ? t('btn.vinback') : t('btn.vinstep');
    $('vin-step').classList.toggle('on', vinStepped);
    $('ideal').innerHTML = savedReal ? t('btn.real') : t('btn.ideal');
    $('eq-model').innerHTML = topology === 'buck'
      ? 'ON: L·di<sub>L</sub>/dt = V<sub>in</sub> − (R<sub>on</sub> + r<sub>L</sub>)·i<sub>L</sub> − v<sub>C</sub><br>OFF: L·di<sub>L</sub>/dt = −V<sub>F</sub> − r<sub>L</sub>·i<sub>L</sub> − v<sub>C</sub><br>C·dv<sub>C</sub>/dt = i<sub>L</sub> − v<sub>C</sub>/R'
      : 'ON: L·di<sub>L</sub>/dt = V<sub>in</sub> − (R<sub>on</sub> + r<sub>L</sub>)·i<sub>L</sub>,  C·dv<sub>C</sub>/dt = −v<sub>C</sub>/R<br>OFF: L·di<sub>L</sub>/dt = V<sub>in</sub> − r<sub>L</sub>·i<sub>L</sub> − V<sub>F</sub> − v<sub>C</sub>,  C·dv<sub>C</sub>/dt = i<sub>L</sub> − v<sub>C</sub>/R';
  }

  function clearSteps() {
    if (loadStepped) { cfg.R = base.R; loadStepped = false; }
    if (vinStepped) { cfg.vin = base.vin; vinStepped = false; }
  }

  function applyConfig(top, set) {
    topology = top;
    const fresh = K.makeConfig(top, set);
    Object.keys(fresh).forEach(function (k) { cfg[k] = fresh[k]; });
    base.R = cfg.R; base.vin = cfg.vin; loadStepped = false; vinStepped = false; savedReal = null;
    syncInputs(); changed(true);
  }

  let currentPreset = 'buck';
  function markPreset(id) {
    currentPreset = id;
    document.querySelectorAll('#presets button').forEach(function (b) {
      const on = b.getAttribute('data-preset') === id;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const pr = PRESETS.filter(function (p) { return p.id === id; })[0];
    $('preset-note').textContent = pr ? pick(pr.note) : '';
  }
  PRESETS.forEach(function (pr) {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('data-preset', pr.id); b.textContent = pick(pr.name);
    b.addEventListener('click', function () { applyConfig(pr.topology, pr.set); markPreset(pr.id); });
    $('presets').appendChild(b);
  });

  document.querySelectorAll('[data-topo]').forEach(function (b) {
    b.addEventListener('click', function () { applyConfig(b.getAttribute('data-topo'), {}); markPreset(b.getAttribute('data-topo')); });
  });
  document.querySelectorAll('[data-ctrl]').forEach(function (b) {
    b.addEventListener('click', function () {
      cfg.control = b.getAttribute('data-ctrl');
      if (cfg.control === 'closed') { st.integ = 0; }
      else { cfg.d = K.clamp(st.d, cfg.dMin, cfg.dMax); }   // keep the current duty when opening the loop
      markPreset(null); syncInputs(); changed(false);
    });
  });

  function slider(id, read) {
    $(id).addEventListener('input', function () { read(this.value); markPreset(null); syncInputs(); changed(false); });
  }
  slider('vin', function (v) { cfg.vin = parseFloat(v); base.vin = cfg.vin; vinStepped = false; });
  slider('R', function (v) { cfg.R = LOG.R.toVal(+v); base.R = cfg.R; loadStepped = false; });
  slider('d', function (v) { cfg.d = parseFloat(v); });
  slider('vref', function (v) { cfg.vref = parseFloat(v); });
  slider('speed', function (v) { cfg.loopSpeed = LOG.speed.toVal(+v); });
  slider('fs', function (v) { cfg.fs = LOG.fs.toVal(+v); swPeriods.length = 0; tr.length = 0; });
  slider('L', function (v) { cfg.L = LOG.L.toVal(+v); });
  slider('C', function (v) { cfg.C = LOG.C.toVal(+v); });
  slider('ron', function (v) { cfg.ron = parseFloat(v); savedReal = null; });
  slider('rl', function (v) { cfg.rl = parseFloat(v); savedReal = null; });
  slider('vf', function (v) { cfg.vf = parseFloat(v); savedReal = null; });
  slider('tsw', function (v) { cfg.tsw = parseFloat(v) * 1e-9; savedReal = null; });

  $('load-step').addEventListener('click', function () {
    loadStepped = !loadStepped; cfg.R = loadStepped ? base.R / 2 : base.R;
    syncInputs(); changed(false);
  });
  $('vin-step').addEventListener('click', function () {
    vinStepped = !vinStepped; cfg.vin = vinStepped ? base.vin * 1.25 : base.vin;
    syncInputs(); changed(false);
  });
  $('ideal').addEventListener('click', function () {
    if (savedReal) { Object.assign(cfg, savedReal); savedReal = null; }
    else { savedReal = { ron: cfg.ron, rl: cfg.rl, vf: cfg.vf, tsw: cfg.tsw }; cfg.ron = 0; cfg.rl = 0; cfg.vf = 0; cfg.tsw = 0; }
    markPreset(null); syncInputs(); changed(false);
  });

  function renderPlay() { $('play').textContent = running ? t('btn.pause') : t('btn.play'); }
  $('play').addEventListener('click', function () { running = !running; renderPlay(); });
  $('startup').addEventListener('click', function () { restartAt(0, 0); });
  function renderSpeedNote() {
    $('speed-note').textContent = t('speed.note', { x: Math.round(cfg.fs / pps).toLocaleString(I18N.lang === 'fr' ? 'fr-FR' : 'en-US') });
  }
  document.querySelectorAll('[data-speed]').forEach(function (b) {
    b.addEventListener('click', function () {
      pps = parseFloat(b.getAttribute('data-speed'));
      document.querySelectorAll('[data-speed]').forEach(function (x) { x.classList.toggle('on', x === b); });
      renderSpeedNote();
    });
  });

  I18N.onChange(function () {
    document.querySelectorAll('#presets button').forEach(function (b) {
      const pr = PRESETS.filter(function (p) { return p.id === b.getAttribute('data-preset'); })[0];
      b.textContent = pick(pr.name);
    });
    markPreset(currentPreset);
    renderPlay(); renderSpeedNote(); syncInputs();
    swLegendKey = ''; trLegendKey = '';
    renderAnalysis();
  });

  // ================= MAIN LOOP =================
  let last = null;
  function frame(ts) {
    if (last === null) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (running) {
      phase += dt * pps;
      let guard = 0;
      while (phase >= 1 && guard < 400) { commitPending(); runPending(); phase -= 1; guard++; }
      if (guard >= 400) phase = 0;
    }
    drawSchematic(dt);
    drawSwitchingScope();
    drawTransientScope();
    updateStatus();
    if (analysisDirty && result) renderAnalysis();
    requestAnimationFrame(frame);
  }

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(function () { if (result) { drawLosses(); drawChar(); } });
    ['losses', 'char'].forEach(function (id) { ro.observe($(id)); });
  }

  // ================= START =================
  readColors();
  markPreset('buck');
  syncInputs();
  renderPlay();
  renderSpeedNote();
  restartSteady();
  scheduleAnalysis();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { analysisDirty = true; swLegendKey = ''; });
  requestAnimationFrame(frame);
})();
