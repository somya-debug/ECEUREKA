'use strict';
/*
 * problems.js — problem bank.
 *
 * Each problem:
 *   limits : max parts of each type the student may place (LED, RES, BTN, BUZ)
 *   ref    : component count of the best-known solution (score = ref / used, capped at 100)
 *   tests  : { name, hidden, duration(ms), input(button timeline), check(H) }
 *            check() gets the helper object H from judge.js and returns null on success
 *            or a string explaining the failure. check() must be self-contained.
 *
 * In production, hidden tests and reference solutions live on the server only.
 */
var PROBLEMS = [
  {
    id: 'hello-led',
    title: 'Hello, LED',
    difficulty: 'Easy',
    ref: 2,
    limits: { LED: 1, RES: 1 },
    statement: [
      'Light an LED and keep it lit.',
      'Build the circuit with the parts provided, then write firmware that turns the LED on. **Any** digital pin (2–13) may drive it.',
      'Remember: an LED needs a current-limiting resistor, or it burns out.'
    ],
    starter: 'function setup() {\n  // configure pins here\n}\n\nfunction loop() {\n  // runs forever\n}\n',
    tests: [
      { name: 'LED is lit', duration: 1500, input: null,
        check: function (H) { var ts = [100, 700, 1400]; for (var i = 0; i < ts.length; i++) if (!H.anyOn(ts[i])) return 'The LED is off at t=' + ts[i] + 'ms.'; return null; } },
      { name: 'Stays lit', hidden: true, duration: 6000, input: null,
        check: function (H) { return H.anyOn(5900) && H.anyOn(3000) ? null : 'x'; } }
    ]
  },
  {
    id: 'blink-1hz',
    title: 'Blink at 1 Hz',
    difficulty: 'Easy',
    ref: 2,
    limits: { LED: 1, RES: 1 },
    statement: [
      'Make an LED blink: **on for 500 ms, off for 500 ms**, repeating forever.',
      'Timing is checked with a few milliseconds of tolerance.'
    ],
    starter: 'function setup() {\n  \n}\n\nfunction loop() {\n  \n}\n',
    tests: [
      { name: 'Blinks on/off', duration: 3200, input: null,
        check: function (H) {
          var exp = [[250, 1], [750, 0], [1250, 1], [1750, 0]];
          for (var i = 0; i < exp.length; i++) if (H.anyOn(exp[i][0]) !== !!exp[i][1]) return 'Expected LED ' + (exp[i][1] ? 'ON' : 'OFF') + ' at t=' + exp[i][0] + 'ms.';
          return null;
        } },
      { name: 'Timing accuracy', hidden: true, duration: 6200, input: null,
        check: function (H) {
          for (var k = 0; k < 5; k++) {
            var s = k * 1000;
            if (!H.anyOn(s + 30) || !H.anyOn(s + 470) || H.anyOn(s + 530) || H.anyOn(s + 970)) return 'x';
          }
          return null;
        } }
    ]
  },
  {
    id: 'button-light',
    title: 'Button Light',
    difficulty: 'Easy',
    ref: 3,
    limits: { LED: 1, RES: 1, BTN: 1 },
    statement: [
      'The LED must be on **only while the button is held**.',
      'Read the button from pin `2` in your firmware — a circuit that powers the LED straight through the button will not be accepted.',
      'Tip: `pinMode(2, INPUT_PULLUP)` enables the internal pull-up, so the button only needs to connect pin 2 to GND (pressed = `LOW`).'
    ],
    starter: 'function setup() {\n  \n}\n\nfunction loop() {\n  \n}\n',
    tests: [
      { name: 'Follows the button', duration: 3000, input: { windows: [[1000, 2000]] },
        check: function (H) {
          if (!H.read(2)) return 'Your firmware never reads pin 2.';
          if (H.anyOn(500)) return 'LED should be OFF before the button is pressed (t=500ms).';
          if (!H.anyOn(1500)) return 'LED should be ON while the button is held (t=1500ms).';
          if (H.anyOn(2500)) return 'LED should turn OFF after release (t=2500ms).';
          return null;
        } },
      { name: 'Short presses, fast response', hidden: true, duration: 3000,
        input: { windows: [[507, 547], [1013, 1053], [1507, 2507]] },
        check: function (H) {
          var on = [527, 1033, 2000], off = [300, 800, 1300, 2800];
          for (var i = 0; i < on.length; i++) if (!H.anyOn(on[i])) return 'x';
          for (var j = 0; j < off.length; j++) if (H.anyOn(off[j])) return 'x';
          return null;
        } }
    ]
  },
  {
    id: 'alternate',
    title: 'Alternating LEDs',
    difficulty: 'Medium',
    ref: 3,
    limits: { LED: 2, RES: 2 },
    statement: [
      'Two LEDs must **alternate**: LED A on for 250 ms while LED B is off, then swap, forever.',
      'Exactly one LED is lit at any moment (ignore sub-millisecond switching).',
      'You are given two resistors, but a clever layout needs fewer. Fewer components = a higher score.'
    ],
    starter: 'function setup() {\n  \n}\n\nfunction loop() {\n  \n}\n',
    tests: [
      { name: 'LEDs alternate', duration: 3000, input: null,
        check: function (H) {
          if (H.ids.length < 2) return 'Place two LEDs.';
          var prev = null;
          for (var k = 0; k < 10; k++) {
            var tm = 125 + 250 * k;
            if (H.count(tm) !== 1) return 'Exactly one LED must be lit at t=' + tm + 'ms (found ' + H.count(tm) + ').';
            var cur = H.lit(tm);
            if (prev !== null && cur === prev) return 'The LEDs must swap every 250ms (t=' + tm + 'ms).';
            prev = cur;
          }
          return null;
        } },
      { name: 'Switch timing', hidden: true, duration: 4000, input: null,
        check: function (H) {
          for (var k = 1; k < 12; k++) {
            var e = 250 * k;
            var a = H.lit(e - 15), b = H.lit(e + 15);
            if (a === 'none' || b === 'none' || a === b) return 'x';
            if (H.lit(e - 125) !== a || H.lit(e + 125) !== b) return 'x';
          }
          return null;
        } }
    ]
  },
  {
    id: 'toggle-debounce',
    title: 'Toggle with Debounce',
    difficulty: 'Hard',
    ref: 3,
    limits: { LED: 1, RES: 1, BTN: 1 },
    statement: [
      'Each button press must **toggle** the LED (press once = on, press again = off). Holding the button must not toggle repeatedly.',
      'Real buttons *bounce*: for a few milliseconds the contact chatters between pressed and released. The judge simulates this, including on release, with different chatter lengths in the hidden tests.',
      'Read the button on pin `2`. The LED can use any pin.'
    ],
    starter: 'function setup() {\n  \n}\n\nfunction loop() {\n  \n}\n',
    tests: [
      { name: 'Toggles on each press', duration: 4000,
        input: { windows: [[1000, 1300], [2000, 2300], [3000, 3300]], bounce: 12, seg: 2 },
        check: function (H) {
          if (!H.read(2)) return 'Your firmware never reads pin 2.';
          var exp = [[900, 0], [1500, 1], [2500, 0], [3500, 1]];
          for (var i = 0; i < exp.length; i++) if (H.anyOn(exp[i][0]) !== !!exp[i][1]) return 'Expected LED ' + (exp[i][1] ? 'ON' : 'OFF') + ' at t=' + exp[i][0] + 'ms.';
          return null;
        } },
      { name: 'Different bounce, quick taps', hidden: true, duration: 3200,
        input: { windows: [[500, 600], [900, 1400], [1700, 1750], [2500, 2900]], bounce: 20, seg: 3 },
        check: function (H) {
          var exp = [[450, 0], [800, 1], [1200, 0], [2000, 1], [2800, 0]];
          for (var i = 0; i < exp.length; i++) if (H.anyOn(exp[i][0]) !== !!exp[i][1]) return 'x';
          return null;
        } },
      { name: 'Long hold toggles once', hidden: true, duration: 3500,
        input: { windows: [[500, 2500]], bounce: 10, seg: 2 },
        check: function (H) {
          if (H.anyOn(400) || !H.anyOn(1000) || !H.anyOn(2000) || !H.anyOn(3200)) return 'x';
          return null;
        } }
    ]
  }
];

if (typeof module !== 'undefined') module.exports = { PROBLEMS: PROBLEMS };
