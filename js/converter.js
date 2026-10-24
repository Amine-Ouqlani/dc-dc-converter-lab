/*
 * converter.js — switched simulation of a buck or boost DC-DC converter
 *
 * State: inductor current iL, capacitor (output) voltage vC.
 * Each switching period Ts = 1/fs is split into an ON segment (D*Ts) and an OFF segment ((1-D)*Ts),
 * each cut into small RK4 steps, so the switching instants are exact.
 *
 * BUCK   ON : L diL/dt = Vin - (Ron + rL) iL - vC
 *        OFF: L diL/dt = -Vf - rL iL - vC          (diode conducts while iL > 0)
 *        C dvC/dt = iL - vC/R
 * BOOST  ON : L diL/dt = Vin - (Ron + rL) iL ,          C dvC/dt = -vC/R
 *        OFF: L diL/dt = Vin - rL iL - Vf - vC ,        C dvC/dt = iL - vC/R
 * When the diode would have to carry a negative current, it blocks: iL stays at 0 (discontinuous mode, DCM).
 *
 * Losses: switch conduction (Ron iL^2), inductor copper (rL iL^2), diode (Vf iL) come out of the simulation;
 * switching losses use the usual estimate E = 1/2 * V_blocked * I * t_sw at each turn-on and turn-off.
 *
 * Closed loop (optional): once per period, D = D_ff + Ki * integral(e), e = Vref - (average Vout over the
 * previous period), with a feed-forward D_ff from the ideal conversion ratio. Ki is tuned automatically
 * from the circuit: the loop crossover wc is placed
 *   - below the LC resonance, so that |L(j w0)| <= 1/2 at the resonant peak (6 dB gain margin),
 *   - below the right-half-plane zero of the boost (wz / 5),
 *   - well below the switching frequency (2 pi fs / 20),
 * then multiplied by the user's "loop speed" factor. Ki = wc / G0, G0 = dVout/dD.
 *
 * Works in the browser (window.Converter) and in Node (require) for the tests.
 */
(function (root) {
  'use strict';

  const DEFAULTS = {
    buck: {
      topology: 'buck', vin: 12, d: 0.44, fs: 50e3, L: 47e-6, C: 100e-6, R: 5,
      vref: 5
    },
    boost: {
      topology: 'boost', vin: 5, d: 0.6, fs: 50e3, L: 47e-6, C: 100e-6, R: 24,
      vref: 12
    }
  };

  const COMMON = {
    ron: 0.05,      // switch on-resistance [ohm]
    rl: 0.05,       // inductor resistance [ohm]
    vf: 0.45,       // diode forward voltage [V] (Schottky)
    tsw: 40e-9,     // switching time (rise + fall) [s]
    control: 'open',
    loopSpeed: 1,   // multiplies the automatically tuned crossover frequency
    dMin: 0.02, dMax: 0.9
  };

  const STEPS = 400; // integration steps per switching period

  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  function makeConfig(topology, overrides) {
    return Object.assign({}, COMMON, DEFAULTS[topology], overrides || {});
  }

  // ---------- textbook formulas ----------
  const theory = {
    // ideal conversion ratio in continuous conduction
    gainIdeal: function (c, d) { return c.topology === 'buck' ? d : 1 / (1 - d); },

    // conversion ratio with Ron, rL, Vf (continuous conduction)
    voutReal: function (c, d) {
      if (c.topology === 'buck') {
        return (d * c.vin - (1 - d) * c.vf) / (1 + (c.rl + d * c.ron) / c.R);
      }
      const k = 1 - d;
      return (c.vin - k * c.vf) / (k + (c.rl + d * c.ron) / (k * c.R));
    },

    // K = 2L/(R Ts): the converter runs in DCM when K < Kcrit(D)
    K: function (c) { return 2 * c.L * c.fs / c.R; },
    Kcrit: function (c, d) { return c.topology === 'buck' ? (1 - d) : d * (1 - d) * (1 - d); },
    isDCM: function (c, d) { return theory.K(c) < theory.Kcrit(c, d); },

    // ideal conversion ratio in discontinuous conduction
    gainDCM: function (c, d) {
      const K = theory.K(c);
      return c.topology === 'buck'
        ? 2 / (1 + Math.sqrt(1 + 4 * K / (d * d)))
        : (1 + Math.sqrt(1 + 4 * d * d / K)) / 2;
    },

    // ideal output voltage, whichever mode applies
    voutIdeal: function (c, d) {
      return c.vin * (theory.isDCM(c, d) ? theory.gainDCM(c, d) : theory.gainIdeal(c, d));
    },

    // peak-to-peak inductor ripple (CCM, ideal)
    rippleI: function (c, d) {
      const vout = c.vin * theory.gainIdeal(c, d);
      return c.topology === 'buck'
        ? (c.vin - vout) * d / (c.L * c.fs)
        : c.vin * d / (c.L * c.fs);
    },

    // peak-to-peak output voltage ripple (CCM, ideal)
    rippleV: function (c, d) {
      if (c.topology === 'buck') return theory.rippleI(c, d) / (8 * c.C * c.fs);
      const vout = c.vin * theory.gainIdeal(c, d);
      return (vout / c.R) * d / (c.C * c.fs);
    },

    // duty cycle that ideally gives vref in continuous conduction
    dutyFor: function (c, vref) {
      return c.topology === 'buck' ? vref / c.vin : 1 - c.vin / vref;
    },

    // duty cycle that ideally gives vref in whichever mode applies (bisection; Vout grows with D)
    dutyForMode: function (c, vref, dMin, dMax) {
      let lo = dMin, hi = dMax;
      if (theory.voutIdeal(c, lo) >= vref) return lo;
      if (theory.voutIdeal(c, hi) <= vref) return hi;
      for (let i = 0; i < 50; i++) {
        const mid = 0.5 * (lo + hi);
        if (theory.voutIdeal(c, mid) < vref) lo = mid; else hi = mid;
      }
      return 0.5 * (lo + hi);
    },

    // small-signal values of the averaged model around duty d (CCM)
    plant: function (c, d) {
      const k = 1 - d, z = Math.sqrt(c.C / c.L);
      if (c.topology === 'buck') {
        return { G0: c.vin, w0: 1 / Math.sqrt(c.L * c.C), Q: c.R * z, wz: Infinity };
      }
      return { G0: c.vin / (k * k), w0: k / Math.sqrt(c.L * c.C), Q: k * c.R * z, wz: k * k * c.R / c.L };
    },

    // automatic loop design around duty d: returns the dc gain G0 = dVout/dD [V],
    // the crossover wc [rad/s] and the conduction mode used for the design
    loopDesign: function (c, d) {
      const h = 1e-4;
      const G0 = c.vin * (theory.voutIdeal(c, d + h) - theory.voutIdeal(c, d - h)) / (2 * h * c.vin);
      const wMax = 2 * Math.PI * c.fs / 20;
      let wc, mode;
      if (theory.isDCM(c, d)) {
        // DCM: first-order plant, pole at wp
        const M = theory.gainDCM(c, d);
        const wp = c.topology === 'buck'
          ? (2 - M) / ((1 - M) * c.R * c.C)
          : (2 * M - 1) / ((M - 1) * c.R * c.C);
        wc = Math.min(Math.abs(wp), wMax); mode = 'DCM';
      } else {
        // CCM: LC resonance (and right-half-plane zero for the boost)
        const pl = theory.plant(c, d);
        wc = Math.min(0.5 * pl.w0 / Math.max(pl.Q, 0.5), pl.wz / 5, wMax); mode = 'CCM';
      }
      wc *= (c.loopSpeed || 1);
      return { G0: Math.max(G0, 1e-6), wc: wc, mode: mode };
    },

    crossover: function (c, d) { return theory.loopDesign(c, d).wc; }
  };

  // ---------- the simulation ----------
  function createConverter(cfgIn) {
    const cfg = Object.assign({}, cfgIn);
    const s = { t: 0, iL: 0, vC: 0, d: cfg.d, integ: 0, periods: 0, vAvgPrev: 0, wc: 0 };

    function deriv(on, iL, vC) {
      const c = cfg;
      let diL, dvC;
      if (c.topology === 'buck') {
        if (on) diL = (c.vin - (c.ron + c.rl) * iL - vC) / c.L;
        else diL = (-c.vf - c.rl * iL - vC) / c.L;
        dvC = (iL - vC / c.R) / c.C;
      } else {
        if (on) { diL = (c.vin - (c.ron + c.rl) * iL) / c.L; dvC = (-vC / c.R) / c.C; }
        else { diL = (c.vin - c.rl * iL - c.vf - vC) / c.L; dvC = (iL - vC / c.R) / c.C; }
      }
      return [diL, dvC];
    }

    // diode blocking: when off with no current, the inductor current stays at zero
    function derivBlocked(vC) {
      return [0, (-vC / cfg.R) / cfg.C];
    }

    function blockedNow(on, iL, vC) {
      if (on || iL > 1e-12) return false;
      return deriv(false, 0, vC)[0] <= 0;
    }

    function rk4(on, dt) {
      const f = function (iL, vC) { return blockedNow(on, iL, vC) ? derivBlocked(vC) : deriv(on, iL, vC); };
      const a = f(s.iL, s.vC);
      const b = f(s.iL + 0.5 * dt * a[0], s.vC + 0.5 * dt * a[1]);
      const c = f(s.iL + 0.5 * dt * b[0], s.vC + 0.5 * dt * b[1]);
      const e = f(s.iL + dt * c[0], s.vC + dt * c[1]);
      s.iL += dt / 6 * (a[0] + 2 * b[0] + 2 * c[0] + e[0]);
      s.vC += dt / 6 * (a[1] + 2 * b[1] + 2 * c[1] + e[1]);
      if (!on && s.iL < 0) s.iL = 0;          // diode blocks reverse current
      if (s.vC < 0 && cfg.topology === 'boost') s.vC = Math.max(s.vC, 0);
    }

    function blockingVoltage() {
      return cfg.topology === 'buck' ? cfg.vin : s.vC + cfg.vf;
    }

    // choose the duty cycle for the coming period
    function duty() {
      if (cfg.control !== 'closed') return clamp(cfg.d, cfg.dMin, cfg.dMax);
      const e = cfg.vref - s.vAvgPrev;
      const Ts = 1 / cfg.fs;
      // design point: the duty that should give vref (feed-forward), and the loop tuned around it
      const ff = theory.dutyForMode(cfg, cfg.vref, cfg.dMin, cfg.dMax);
      const ld = theory.loopDesign(cfg, ff);
      s.wc = ld.wc;
      const ki = ld.wc / ld.G0;
      // anti-windup by clamping: the integral never pushes D outside [dMin, dMax]
      s.integ = clamp(s.integ + ki * e * Ts, cfg.dMin - ff, cfg.dMax - ff);
      return clamp(ff + s.integ, cfg.dMin, cfg.dMax);
    }

    /*
     * Simulate one switching period.
     * rec (optional): { every: n, out: array } receives samples {t, iL, vC, vsw, on}
     * Returns a summary of the period.
     */
    function period(rec) {
      const Ts = 1 / cfg.fs;
      const d = duty();
      s.d = d;
      const nOn = Math.max(4, Math.round(STEPS * d)), nOff = Math.max(4, STEPS - nOn);
      const dtOn = d * Ts / nOn, dtOff = (1 - d) * Ts / nOff;

      const sum = {
        d: d, t0: s.t,
        eIn: 0, eOut: 0, eSwCond: 0, eL: 0, eDiode: 0, eSwitching: 0,
        iMin: Infinity, iMax: -Infinity, vMin: Infinity, vMax: -Infinity,
        iAvg: 0, vAvg: 0, dcmTime: 0
      };

      // turn-on switching loss (zero if the current is zero, as in DCM)
      sum.eSwitching += 0.5 * blockingVoltage() * Math.max(0, s.iL) * cfg.tsw;

      let k = 0;
      function sample(on) {
        if (rec && (k % rec.every === 0)) {
          const blocked = blockedNow(on, s.iL, s.vC);
          let vsw;
          if (cfg.topology === 'buck') vsw = on ? cfg.vin - cfg.ron * s.iL : (blocked ? s.vC : -cfg.vf);
          else vsw = on ? cfg.ron * s.iL : (blocked ? cfg.vin : s.vC + cfg.vf);
          rec.out.push({ t: s.t, iL: s.iL, vC: s.vC, vsw: vsw, on: on });
        }
        k++;
      }

      function segment(on, n, dt) {
        for (let i = 0; i < n; i++) {
          sample(on);
          const iL0 = s.iL, vC0 = s.vC;
          const blocked0 = blockedNow(on, iL0, vC0);
          rk4(on, dt);
          // energies with the trapezoid rule
          const iA = 0.5 * (iL0 + s.iL), v2 = 0.5 * (vC0 * vC0 + s.vC * s.vC);
          const iIn = cfg.topology === 'boost' ? iA : (on ? iA : 0);
          sum.eIn += cfg.vin * iIn * dt;
          sum.eOut += v2 / cfg.R * dt;
          const i2 = 0.5 * (iL0 * iL0 + s.iL * s.iL);
          sum.eL += cfg.rl * i2 * dt;
          if (on) sum.eSwCond += cfg.ron * i2 * dt;
          else sum.eDiode += cfg.vf * iA * dt;
          if (!on && (blocked0 || s.iL <= 0)) sum.dcmTime += dt;
          sum.iAvg += iA * dt; sum.vAvg += 0.5 * (vC0 + s.vC) * dt;
          sum.iMin = Math.min(sum.iMin, s.iL); sum.iMax = Math.max(sum.iMax, s.iL);
          sum.vMin = Math.min(sum.vMin, s.vC); sum.vMax = Math.max(sum.vMax, s.vC);
          s.t += dt;
        }
      }

      segment(true, nOn, dtOn);
      // turn-off switching loss
      sum.eSwitching += 0.5 * blockingVoltage() * Math.max(0, s.iL) * cfg.tsw;
      segment(false, nOff, dtOff);
      sample(false);

      sum.iAvg /= Ts; sum.vAvg /= Ts;
      s.vAvgPrev = sum.vAvg;
      sum.dcm = sum.dcmTime > 0.01 * Ts;
      s.periods++;
      return sum;
    }

    function reset(iL, vC) {
      s.t = 0; s.iL = iL || 0; s.vC = vC || 0; s.integ = 0; s.periods = 0; s.d = cfg.d; s.vAvgPrev = vC || 0;
    }

    return { cfg: cfg, state: s, period: period, reset: reset };
  }

  /*
   * Run until the period-average output voltage stops changing, then average
   * the last periods. Starts from the ideal operating point to converge quickly.
   */
  function steadyState(cfgIn, opts) {
    opts = opts || {};
    const conv = createConverter(cfgIn);
    const c = conv.cfg;
    const d0 = c.control === 'closed' ? clamp(theory.dutyFor(c, c.vref), c.dMin, c.dMax) : clamp(c.d, c.dMin, c.dMax);
    const v0 = Math.max(0, theory.voutReal(c, d0));
    const i0 = c.topology === 'buck' ? v0 / c.R : v0 / (c.R * (1 - d0));
    conv.reset(theory.isDCM(c, d0) ? 0 : i0, v0);

    const maxPeriods = opts.maxPeriods || 6000;
    const avgN = opts.avgPeriods || 20;
    let last = [], prevV = null, calm = 0, n = 0;
    while (n < maxPeriods) {
      const p = conv.period();
      n++;
      last.push(p); if (last.length > avgN) last.shift();
      if (prevV !== null && Math.abs(p.vAvg - prevV) < 1e-6 * Math.max(1, Math.abs(p.vAvg))) calm++; else calm = 0;
      prevV = p.vAvg;
      if (calm >= avgN && n > 2 * avgN) break;
    }
    const m = { periods: n, converged: calm >= avgN };
    const mean = function (k) { return last.reduce(function (a, p) { return a + p[k]; }, 0) / last.length; };
    const Ts = 1 / c.fs;
    m.vout = mean('vAvg');
    m.iL = mean('iAvg');
    m.d = mean('d');
    m.iOut = m.vout / c.R;
    m.rippleI = last[last.length - 1].iMax - last[last.length - 1].iMin;
    m.rippleV = last[last.length - 1].vMax - last[last.length - 1].vMin;
    m.dcm = last[last.length - 1].dcm;
    const P = function (k) { return mean(k) / Ts; };
    m.pIn = P('eIn'); m.pOut = P('eOut');
    m.loss = { switchCond: P('eSwCond'), switching: P('eSwitching'), diode: P('eDiode'), inductor: P('eL') };
    m.lossTotal = m.loss.switchCond + m.loss.switching + m.loss.diode + m.loss.inductor;
    m.efficiency = m.pOut / (m.pOut + m.lossTotal);
    // one period of waveforms at steady state
    const out = [];
    conv.period({ every: 4, out: out });
    m.wave = out;
    return m;
  }

  const api = { DEFAULTS: DEFAULTS, COMMON: COMMON, makeConfig: makeConfig, theory: theory, createConverter: createConverter, steadyState: steadyState, clamp: clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Converter = api;
})(typeof window !== 'undefined' ? window : this);
