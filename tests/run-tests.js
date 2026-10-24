/*
 * Run with:  node tests/run-tests.js
 * Checks the converter simulation against the textbook formulas of power electronics.
 */
'use strict';
const assert = require('assert');
const K = require('../js/converter.js');
const T = K.theory;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}
function near(a, b, rel, what) {
  assert.ok(Math.abs(a - b) <= rel * Math.abs(b), what + ': got ' + a.toFixed(5) + ', expected ' + b.toFixed(5) + ' (±' + (rel * 100) + ' %)');
}
const IDEAL = { ron: 0, rl: 0, vf: 0, tsw: 0 };

['buck', 'boost'].forEach(function (top) {
  console.log(top.toUpperCase());

  test('ideal continuous mode: Vout = ' + (top === 'buck' ? 'D·Vin' : 'Vin/(1−D)'), function () {
    [0.25, 0.5, 0.7].forEach(function (d) {
      const c = K.makeConfig(top, Object.assign({}, IDEAL, { d: d, R: top === 'buck' ? 2 : 10 }));
      assert.ok(!T.isDCM(c, d), 'setup should be CCM');
      near(K.steadyState(c).vout, c.vin * T.gainIdeal(c, d), 0.005, 'D = ' + d);
    });
  });

  test('inductor ripple matches ΔiL formula', function () {
    const c = K.makeConfig(top, IDEAL);
    near(K.steadyState(c).rippleI, T.rippleI(c, c.d), 0.02, 'ΔiL');
  });

  test('output ripple matches ΔVout formula', function () {
    const c = K.makeConfig(top, IDEAL);
    near(K.steadyState(c).rippleV, T.rippleV(c, c.d), 0.03, 'ΔVout');
  });

  test('light load enters discontinuous mode and follows the DCM formula', function () {
    const c = K.makeConfig(top, Object.assign({}, IDEAL, { R: top === 'buck' ? 100 : 400 }));
    assert.ok(T.isDCM(c, c.d), 'theory should predict DCM');
    const m = K.steadyState(c);
    assert.ok(m.dcm, 'simulation should be in DCM');
    near(m.vout, c.vin * T.gainDCM(c, c.d), 0.01, 'Vout in DCM');
  });

  test('CCM/DCM boundary K = Kcrit(D) is where the simulation switches mode', function () {
    const c0 = K.makeConfig(top, IDEAL);
    const Rcrit = 2 * c0.L * c0.fs / T.Kcrit(c0, c0.d);
    const below = K.steadyState(K.makeConfig(top, Object.assign({}, IDEAL, { R: Rcrit * 0.85 })));
    const above = K.steadyState(K.makeConfig(top, Object.assign({}, IDEAL, { R: Rcrit * 1.15 })));
    assert.ok(!below.dcm, 'R slightly below Rcrit should be CCM');
    assert.ok(above.dcm, 'R slightly above Rcrit should be DCM');
  });

  test('with losses, Vout matches the non-ideal formula (Ron, rL, Vf)', function () {
    const c = K.makeConfig(top);
    near(K.steadyState(c).vout, T.voutReal(c, c.d), 0.003, 'Vout real');
  });

  test('energy balance: Pin = Pout + conduction losses', function () {
    const m = K.steadyState(K.makeConfig(top));
    const cond = m.loss.switchCond + m.loss.diode + m.loss.inductor;
    near(m.pIn, m.pOut + cond, 0.002, 'Pin');
  });

  test('higher switching frequency: smaller ripple but more switching losses', function () {
    const lo = K.steadyState(K.makeConfig(top, { fs: 20e3 }));
    const hi = K.steadyState(K.makeConfig(top, { fs: 200e3 }));
    assert.ok(hi.rippleI < lo.rippleI, 'ripple should drop');
    assert.ok(hi.loss.switching > 5 * lo.loss.switching, 'switching losses should grow ~ with fs');
  });

  test('closed loop holds Vref through a load step and an input step', function () {
    const c = K.makeConfig(top, { control: 'closed' });
    const conv = K.createConverter(c);
    conv.reset(0, 0);
    const P = Math.round((top === 'buck' ? 0.08 : 0.2) * c.fs);
    let v = [];
    for (let k = 0; k < P; k++) {
      if (k === Math.round(P * 0.4)) conv.cfg.R = c.R / 2;
      if (k === Math.round(P * 0.7)) conv.cfg.vin = c.vin * 1.25;
      const p = conv.period();
      if (k === Math.round(P * 0.4) - 1 || k === Math.round(P * 0.7) - 1 || k === P - 1) v.push(p.vAvg);
    }
    v.forEach(function (x, i) { near(x, c.vref, 0.003, 'Vout before event ' + i); });
  });

  test('automatic loop tuning stays stable over a grid of L, C, R and fs', function () {
    const Ls = [10e-6, 220e-6], Cs = [22e-6, 470e-6], Rs = top === 'buck' ? [1, 50] : [6, 200], fss = [20e3, 200e3];
    Ls.forEach(function (L) { Cs.forEach(function (C) { Rs.forEach(function (R) { fss.forEach(function (fs) {
      const c = K.makeConfig(top, { control: 'closed', L: L, C: C, R: R, fs: fs });
      const conv = K.createConverter(c);
      conv.reset(0, 0);
      const P = Math.round(Math.max(0.05, 40 * R * C) * fs);
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < P; k++) {
        const p = conv.period();
        if (k > 0.85 * P) { lo = Math.min(lo, p.vAvg); hi = Math.max(hi, p.vAvg); }
      }
      const tag = 'L=' + L * 1e6 + 'µH C=' + C * 1e6 + 'µF R=' + R + 'Ω fs=' + fs / 1e3 + 'kHz';
      assert.ok(hi - lo < 0.01 * c.vref, tag + ' still oscillating (' + (hi - lo).toFixed(4) + ' V)');
      assert.ok(Math.abs(0.5 * (lo + hi) - c.vref) < 0.01 * c.vref, tag + ' wrong final value ' + (0.5 * (lo + hi)).toFixed(3));
    }); }); }); });
  });
});

console.log('\n' + passed + ' tests passed' + (process.exitCode ? ', some FAILED' : ''));
