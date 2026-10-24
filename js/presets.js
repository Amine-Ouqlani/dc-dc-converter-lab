/*
 * presets.js — ready-made situations, each showing one idea of the course (EN + FR).
 * `set` is applied on top of the defaults of the topology (see converter.js).
 */
(function (root) {
  'use strict';
  const PRESETS = [
    {
      id: 'buck', topology: 'buck', set: {},
      name: { en: 'Buck 12 V → 5 V', fr: 'Buck 12 V → 5 V' },
      note: {
        en: 'A typical step-down supply: continuous conduction, about 1 A of load, ripple of a few tens of mV.',
        fr: 'Une alimentation abaisseuse typique : conduction continue, environ 1 A de charge, ondulation de quelques dizaines de mV.'
      }
    },
    {
      id: 'boost', topology: 'boost', set: {},
      name: { en: 'Boost 5 V → 12 V', fr: 'Boost 5 V → 12 V' },
      note: {
        en: 'Step-up: the inductor stores energy while the switch is ON and releases it to the output through the diode.',
        fr: 'Élévateur : l’inductance stocke l’énergie pendant la fermeture et la restitue à la sortie à travers la diode.'
      }
    },
    {
      id: 'dcm', topology: 'buck', set: { R: 60 },
      name: { en: 'Light load → discontinuous', fr: 'Faible charge → discontinu' },
      note: {
        en: 'With a light load the inductor current falls to zero before the end of each period. The output voltage rises above D·Vin: the CCM formula no longer applies.',
        fr: 'À faible charge, le courant dans l’inductance s’annule avant la fin de chaque période. La tension de sortie dépasse D·Vin : la formule de la conduction continue ne s’applique plus.'
      }
    },
    {
      id: 'high-d', topology: 'boost', set: { d: 0.85, R: 24 },
      name: { en: 'Boost at D = 0.85', fr: 'Boost à D = 0.85' },
      note: {
        en: 'The ideal formula promises 1/(1 − D) = 6.7 × Vin, about 33 V, but the inductor current reaches 8 A and the resistive losses pull the output down to about 28 V. See the characteristic curve.',
        fr: 'La formule idéale promet 1/(1 − D) = 6.7 × Vin, soit environ 33 V, mais le courant dans l’inductance atteint 8 A et les pertes résistives ramènent la sortie à environ 28 V. Voir la caractéristique statique.'
      }
    },
    {
      id: 'high-fs', topology: 'buck', set: { fs: 400e3 },
      name: { en: 'Switching at 400 kHz', fr: 'Découpage à 400 kHz' },
      note: {
        en: 'Eight times the frequency: the current ripple is divided by 8 and the voltage ripple by 64 (it goes as 1/fs²), but the switching losses are multiplied by 8. Compare the bars in "Where the power goes".',
        fr: 'Fréquence multipliée par huit : l’ondulation de courant est divisée par 8 et celle de tension par 64 (elle varie en 1/fs²), mais les pertes par commutation sont multipliées par 8. Comparez les barres du bilan de puissance.'
      }
    },
    {
      id: 'small-l', topology: 'buck', set: { L: 6.8e-6 },
      name: { en: 'Small inductor', fr: 'Petite inductance' },
      note: {
        en: 'L divided by seven: the current ripple becomes huge and the converter enters discontinuous conduction even at full load.',
        fr: 'L divisée par sept : l’ondulation de courant devient énorme et le convertisseur passe en conduction discontinue même à pleine charge.'
      }
    },
    {
      id: 'loop', topology: 'buck', set: { control: 'closed' },
      name: { en: 'Voltage loop', fr: 'Boucle de tension' },
      note: {
        en: 'The loop holds 5 V. Press "Load step" or "Input step" and watch the transient scope: the output dips, then the integral brings it back.',
        fr: 'La boucle maintient 5 V. Appuyez sur « Échelon de charge » ou « Échelon d’entrée » et observez le régime transitoire : la sortie fléchit, puis l’intégrale la ramène.'
      }
    }
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = PRESETS;
  else root.ConverterPresets = PRESETS;
})(typeof window !== 'undefined' ? window : this);
