/*
 * i18n.js — English / French texts.
 * Static texts: elements with data-i18n="key" (their HTML is replaced),
 * data-i18n-aria="key" (aria-label). Dynamic texts: I18N.t('key', { name: value }).
 * French follows the vocabulary of the 3EA courses (hacheur série / parallèle, conduction continue / discontinue).
 */
(function (root) {
  'use strict';

  const STR = {
    en: {
      'page.title': 'DC-DC Converter Lab',
      'app.title': 'DC-DC Converter Lab',
      'app.lede': 'Watch a buck or boost converter switch, period by period. Change the duty cycle, the load and the components, push it into discontinuous conduction, close the voltage loop, and compare every measurement with the textbook formula.',
      'app.source': 'Source on GitHub',
      'lang.group': 'Language',

      'topo.aria': 'Converter type',
      'topo.buck': 'Buck (step-down)',
      'topo.boost': 'Boost (step-up)',
      'schem.aria': 'Schematic of the converter with the path of the current',
      'chip.ccm': 'CCM · continuous',
      'chip.dcm': 'DCM · discontinuous',
      'chip.on': 'Switch ON',
      'chip.off': 'Switch OFF · diode conducts',
      'chip.idle': 'Switch OFF · iL = 0',

      'scope.sw': 'Switching waveforms',
      'scope.sw.aria': 'Oscilloscope: switch-node voltage, inductor current and output ripple over three switching periods',
      'scope.tr': 'Transient',
      'scope.tr.aria': 'Oscilloscope: output voltage and average inductor current over the last periods',
      'ch.vsw': 'Switch node',
      'ch.il': 'Inductor current',
      'ch.vripple': 'Output ripple (AC)',
      'ch.vout': 'Output voltage',
      'ch.iavg': 'Average i<sub>L</sub>',
      'ch.vref': 'V<sub>ref</sub>',
      'tb': '{v}/div',

      'btn.pause': 'Pause',
      'btn.play': 'Play',
      'btn.startup': 'Start from 0 V',
      'speed.label': 'Periods per second',
      'speed.aria': 'Simulation speed',
      'speed.note': 'slowed down {x} times',

      'g.presets': 'Try this',
      'g.source': 'Source and load',
      'f.vin': 'Input voltage V<sub>in</sub>',
      'f.R': 'Load resistance R',
      'btn.loadstep': 'Load step: current × 2',
      'btn.loadback': 'Load back to normal',
      'btn.vinstep': 'Input step: V<sub>in</sub> + 25 %',
      'btn.vinback': 'Input back to normal',
      'g.control': 'Control',
      'ctrl.aria': 'Control mode',
      'ctrl.open': 'Open loop',
      'ctrl.closed': 'Voltage loop',
      'f.d': 'Duty cycle D',
      'f.vref': 'Target V<sub>ref</sub>',
      'f.loop': 'Loop speed',
      'loop.note': 'Integral control with feed-forward, tuned automatically for {mode} conduction: crossover f<sub>c</sub> = {f} Hz.',
      'loop.unreach': 'This target cannot be reached with D between {lo} and {hi}: the duty cycle is saturated.',
      'g.switching': 'Switching and components',
      'f.fs': 'Switching frequency f<sub>s</sub>',
      'f.L': 'Inductance L',
      'f.C': 'Capacitance C',
      'g.losses': 'Real components',
      'f.ron': 'Switch resistance R<sub>on</sub>',
      'f.rl': 'Inductor resistance r<sub>L</sub>',
      'f.vf': 'Diode drop V<sub>F</sub>',
      'f.tsw': 'Switching time t<sub>sw</sub>',
      'btn.ideal': 'Make components ideal',
      'btn.real': 'Back to real components',

      'an.title': 'Theory vs simulation',
      'an.note': 'Steady state of the current settings, recomputed when you change them.',
      't.qty': 'Quantity',
      't.ideal': 'Ideal formula',
      't.real': 'With losses',
      't.sim': 'Simulated',
      'r.vout': 'Output voltage V<sub>out</sub>',
      'r.d': 'Duty cycle D',
      'r.ripi': 'Inductor ripple Δi<sub>L</sub>',
      'r.ripv': 'Output ripple ΔV<sub>out</sub>',
      'r.mode': 'Conduction mode',
      'r.eff': 'Efficiency η',
      'r.na': 'CCM only',
      'mode.ccm': 'continuous',
      'mode.dcm': 'discontinuous',
      'formulas.buck': 'Buck: V<sub>out</sub> = D·V<sub>in</sub> · Δi<sub>L</sub> = (V<sub>in</sub> − V<sub>out</sub>)·D / (L·f<sub>s</sub>) · ΔV<sub>out</sub> = Δi<sub>L</sub> / (8·C·f<sub>s</sub>) · discontinuous when K = 2L·f<sub>s</sub>/R &lt; 1 − D',
      'formulas.boost': 'Boost: V<sub>out</sub> = V<sub>in</sub> / (1 − D) · Δi<sub>L</sub> = V<sub>in</sub>·D / (L·f<sub>s</sub>) · ΔV<sub>out</sub> = I<sub>out</sub>·D / (C·f<sub>s</sub>) · discontinuous when K = 2L·f<sub>s</sub>/R &lt; D(1 − D)²',
      'p.loss': 'Where the power goes',
      'p.loss.aria': 'Bar chart of the output power and of each loss',
      'p.eff': 'efficiency {e} %',
      'loss.out': 'Output power',
      'loss.switchCond': 'Switch conduction',
      'loss.switching': 'Switching',
      'loss.diode': 'Diode',
      'loss.inductor': 'Inductor',
      'p.char': 'Static characteristic',
      'p.char.sub': 'V<sub>out</sub> / V<sub>in</sub> as a function of D',
      'p.char.aria': 'Conversion ratio as a function of the duty cycle',
      'lg.ideal': 'Ideal (continuous)',
      'lg.real': 'With losses',
      'lg.dcm': 'Ideal, where this load is discontinuous',
      'lg.op': 'Operating point (simulated)',

      'about.title': 'The model',
      'about.sim': 'Simulation',
      'about.sim.p1': 'Each switching period is split into an ON phase (D·T<sub>s</sub>) and an OFF phase, each integrated in small RK4 steps, so the switching instants are exact. The diode blocks reverse current: when i<sub>L</sub> reaches zero during the OFF phase, it stays at zero until the next ON phase. That is discontinuous conduction.',
      'about.sim.p2': 'The table compares the simulation with the textbook formulas. The 20 automated tests in the repository check the same comparisons for both converters.',
      'about.loss': 'Losses',
      'about.loss.p1': 'Conduction losses come straight out of the simulation: R<sub>on</sub>·i<sub>L</sub>² in the switch, r<sub>L</sub>·i<sub>L</sub>² in the inductor, V<sub>F</sub>·i<sub>L</sub> in the diode. They are what bends the boost characteristic down at high duty cycle.',
      'about.loss.p2': 'Switching losses use the usual estimate E = ½·V·I·t<sub>sw</sub> at each turn-on and turn-off. Raising f<sub>s</sub> shrinks the ripple but multiplies these losses: that is the trade-off every converter designer faces.',
      'about.ctrl': 'Voltage loop',
      'about.ctrl.p1': 'Once per period, D = D<sub>ff</sub> + K<sub>i</sub>·∫(V<sub>ref</sub> − V<sub>out</sub>). The feed-forward D<sub>ff</sub> comes from the conversion ratio; the integral removes what the losses change.',
      'about.ctrl.p2': 'K<sub>i</sub> is tuned from the circuit: the crossover sits below the LC resonance with 6 dB of margin at its peak, below the boost right-half-plane zero, and well below f<sub>s</sub>; in discontinuous mode it follows the single pole of the plant. Push the loop speed above ×1 to see the margin disappear.',
      'foot': 'DC-DC Converter Lab · Ahmed Amine Ouqlani · MIT License'
    },

    fr: {
      'page.title': 'Labo des convertisseurs DC-DC',
      'app.title': 'Labo des convertisseurs DC-DC',
      'app.lede': 'Observez un hacheur série (buck) ou parallèle (boost) commuter, période après période. Modifiez le rapport cyclique, la charge et les composants, passez en conduction discontinue, fermez la boucle de tension, et comparez chaque mesure à la formule du cours.',
      'app.source': 'Code source sur GitHub',
      'lang.group': 'Langue',

      'topo.aria': 'Type de convertisseur',
      'topo.buck': 'Buck (abaisseur)',
      'topo.boost': 'Boost (élévateur)',
      'schem.aria': 'Schéma du convertisseur avec le chemin du courant',
      'chip.ccm': 'Conduction continue',
      'chip.dcm': 'Conduction discontinue',
      'chip.on': 'Interrupteur fermé',
      'chip.off': 'Interrupteur ouvert · diode passante',
      'chip.idle': 'Interrupteur ouvert · iL = 0',

      'scope.sw': 'Formes d’onde de commutation',
      'scope.sw.aria': 'Oscilloscope : tension du point milieu, courant dans l’inductance et ondulation de sortie sur trois périodes',
      'scope.tr': 'Régime transitoire',
      'scope.tr.aria': 'Oscilloscope : tension de sortie et courant moyen dans l’inductance sur les dernières périodes',
      'ch.vsw': 'Point milieu',
      'ch.il': 'Courant dans L',
      'ch.vripple': 'Ondulation de sortie (AC)',
      'ch.vout': 'Tension de sortie',
      'ch.iavg': 'i<sub>L</sub> moyen',
      'ch.vref': 'V<sub>ref</sub>',
      'tb': '{v}/div',

      'btn.pause': 'Pause',
      'btn.play': 'Lecture',
      'btn.startup': 'Démarrer depuis 0 V',
      'speed.label': 'Périodes par seconde',
      'speed.aria': 'Vitesse de simulation',
      'speed.note': 'ralenti {x} fois',

      'g.presets': 'À essayer',
      'g.source': 'Source et charge',
      'f.vin': 'Tension d’entrée V<sub>in</sub>',
      'f.R': 'Résistance de charge R',
      'btn.loadstep': 'Échelon de charge : courant × 2',
      'btn.loadback': 'Charge normale',
      'btn.vinstep': 'Échelon d’entrée : V<sub>in</sub> + 25 %',
      'btn.vinback': 'Entrée normale',
      'g.control': 'Commande',
      'ctrl.aria': 'Mode de commande',
      'ctrl.open': 'Boucle ouverte',
      'ctrl.closed': 'Boucle de tension',
      'f.d': 'Rapport cyclique D',
      'f.vref': 'Consigne V<sub>ref</sub>',
      'f.loop': 'Vitesse de la boucle',
      'loop.note': 'Correcteur intégral avec anticipation, réglé automatiquement pour la conduction {mode} : fréquence de coupure f<sub>c</sub> = {f} Hz.',
      'loop.unreach': 'Cette consigne est inatteignable avec D entre {lo} et {hi} : le rapport cyclique est saturé.',
      'g.switching': 'Découpage et composants',
      'f.fs': 'Fréquence de découpage f<sub>s</sub>',
      'f.L': 'Inductance L',
      'f.C': 'Capacité C',
      'g.losses': 'Composants réels',
      'f.ron': 'Résistance de l’interrupteur R<sub>on</sub>',
      'f.rl': 'Résistance de l’inductance r<sub>L</sub>',
      'f.vf': 'Tension de seuil de la diode V<sub>F</sub>',
      'f.tsw': 'Temps de commutation t<sub>sw</sub>',
      'btn.ideal': 'Composants idéaux',
      'btn.real': 'Revenir aux composants réels',

      'an.title': 'Théorie et simulation',
      'an.note': 'Régime établi des réglages actuels, recalculé à chaque modification.',
      't.qty': 'Grandeur',
      't.ideal': 'Formule idéale',
      't.real': 'Avec pertes',
      't.sim': 'Simulé',
      'r.vout': 'Tension de sortie V<sub>out</sub>',
      'r.d': 'Rapport cyclique D',
      'r.ripi': 'Ondulation de courant Δi<sub>L</sub>',
      'r.ripv': 'Ondulation de tension ΔV<sub>out</sub>',
      'r.mode': 'Mode de conduction',
      'r.eff': 'Rendement η',
      'r.na': 'en continu seulement',
      'mode.ccm': 'continue',
      'mode.dcm': 'discontinue',
      'formulas.buck': 'Buck : V<sub>out</sub> = D·V<sub>in</sub> · Δi<sub>L</sub> = (V<sub>in</sub> − V<sub>out</sub>)·D / (L·f<sub>s</sub>) · ΔV<sub>out</sub> = Δi<sub>L</sub> / (8·C·f<sub>s</sub>) · conduction discontinue si K = 2L·f<sub>s</sub>/R &lt; 1 − D',
      'formulas.boost': 'Boost : V<sub>out</sub> = V<sub>in</sub> / (1 − D) · Δi<sub>L</sub> = V<sub>in</sub>·D / (L·f<sub>s</sub>) · ΔV<sub>out</sub> = I<sub>out</sub>·D / (C·f<sub>s</sub>) · conduction discontinue si K = 2L·f<sub>s</sub>/R &lt; D(1 − D)²',
      'p.loss': 'Bilan de puissance',
      'p.loss.aria': 'Diagramme en barres de la puissance de sortie et de chaque perte',
      'p.eff': 'rendement {e} %',
      'loss.out': 'Puissance de sortie',
      'loss.switchCond': 'Conduction interrupteur',
      'loss.switching': 'Commutation',
      'loss.diode': 'Diode',
      'loss.inductor': 'Inductance',
      'p.char': 'Caractéristique statique',
      'p.char.sub': 'V<sub>out</sub> / V<sub>in</sub> en fonction de D',
      'p.char.aria': 'Rapport de conversion en fonction du rapport cyclique',
      'lg.ideal': 'Idéale (conduction continue)',
      'lg.real': 'Avec pertes',
      'lg.dcm': 'Idéale, là où cette charge est en conduction discontinue',
      'lg.op': 'Point de fonctionnement (simulé)',

      'about.title': 'Le modèle',
      'about.sim': 'Simulation',
      'about.sim.p1': 'Chaque période de découpage est séparée en une phase de conduction (D·T<sub>s</sub>) et une phase de blocage, intégrées chacune en petits pas RK4 : les instants de commutation sont exacts. La diode bloque le courant inverse : quand i<sub>L</sub> s’annule pendant le blocage, il reste nul jusqu’à la conduction suivante. C’est la conduction discontinue.',
      'about.sim.p2': 'Le tableau compare la simulation aux formules du cours. Les 20 tests automatiques du dépôt vérifient les mêmes comparaisons pour les deux convertisseurs.',
      'about.loss': 'Pertes',
      'about.loss.p1': 'Les pertes par conduction sortent directement de la simulation : R<sub>on</sub>·i<sub>L</sub>² dans l’interrupteur, r<sub>L</sub>·i<sub>L</sub>² dans l’inductance, V<sub>F</sub>·i<sub>L</sub> dans la diode. Ce sont elles qui font redescendre la caractéristique du boost à fort rapport cyclique.',
      'about.loss.p2': 'Les pertes par commutation utilisent l’estimation classique E = ½·V·I·t<sub>sw</sub> à chaque fermeture et ouverture. Augmenter f<sub>s</sub> réduit l’ondulation mais multiplie ces pertes : c’est le compromis de tout concepteur de convertisseur.',
      'about.ctrl': 'Boucle de tension',
      'about.ctrl.p1': 'Une fois par période, D = D<sub>ff</sub> + K<sub>i</sub>·∫(V<sub>ref</sub> − V<sub>out</sub>). L’anticipation D<sub>ff</sub> vient du rapport de conversion ; l’intégrale corrige l’effet des pertes.',
      'about.ctrl.p2': 'K<sub>i</sub> est réglé à partir du circuit : la coupure est placée sous la résonance LC avec 6 dB de marge au pic, sous le zéro à partie réelle positive du boost, et bien sous f<sub>s</sub> ; en conduction discontinue, elle suit le pôle unique du système. Poussez la vitesse de la boucle au-delà de ×1 pour voir la marge disparaître.',
      'foot': 'Labo des convertisseurs DC-DC · Ahmed Amine Ouqlani · Licence MIT'
    }
  };

  const KEY = 'dcdc-lab-lang';
  const listeners = [];
  let lang = 'en';

  function t(key, vars) {
    let s = (STR[lang] && STR[lang][key] !== undefined) ? STR[lang][key] : (STR.en[key] !== undefined ? STR.en[key] : key);
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function pick(obj) { return obj ? (obj[lang] || obj.en) : ''; }

  function apply() {
    document.documentElement.lang = lang;
    document.title = t('page.title');
    document.querySelectorAll('[data-i18n]').forEach(function (el) { el.innerHTML = t(el.getAttribute('data-i18n')); });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')).replace(/<[^>]+>/g, '')); });
    document.querySelectorAll('[data-set-lang]').forEach(function (b) {
      const on = b.getAttribute('data-set-lang') === lang;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function set(next) {
    lang = next === 'fr' ? 'fr' : 'en';
    try { localStorage.setItem(KEY, lang); } catch (e) { /* storage unavailable */ }
    apply();
    listeners.forEach(function (fn) { fn(lang); });
  }

  function initial() {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (q === 'fr' || q === 'en') return q;
    try { const saved = localStorage.getItem(KEY); if (saved === 'fr' || saved === 'en') return saved; } catch (e) { /* ignore */ }
    return (navigator.language || 'en').toLowerCase().indexOf('fr') === 0 ? 'fr' : 'en';
  }

  root.I18N = {
    t: t, pick: pick, set: set,
    get lang() { return lang; },
    onChange: function (fn) { listeners.push(fn); },
    init: function () {
      lang = initial();
      document.querySelectorAll('[data-set-lang]').forEach(function (b) {
        b.addEventListener('click', function () { set(b.getAttribute('data-set-lang')); });
      });
      apply();
    }
  };
})(window);
