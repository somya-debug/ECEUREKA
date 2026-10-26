# CircuitCode — "LeetCode for hardware" (prototype)

Students get a problem, a limited parts bin, and a virtual Arduino. They wire a circuit, write firmware, and submit.
The judge simulates the circuit + firmware against hidden tests, then scores by **how few components** they used.

## Run it

No build step. Open `index.html` in a browser (or `python3 -m http.server` in this folder).
Progress and submissions are kept in `localStorage`.

Run the judge tests: `node test/run.js` (17 cases: reference solutions must be Accepted at 100%, bad attempts must be rejected).

## Files

| File | What it does |
|---|---|
| `judge.js` | The judge. Netlist -> digital circuit solver -> Arduino-style firmware sim with a virtual clock -> hidden tests -> verdict. Also runs in Node. |
| `problems.js` | Problem bank: statement, part limits, reference component count, visible + hidden tests. |
| `app.js` | UI: problem list, SVG circuit editor (click pin -> click pin to wire, drag parts), code editor, results with timelines. |
| `index.html`, `style.css` | Shell and styling. |
| `test/run.js` | Judge regression tests. |

## How judging works

1. **Limits** — parts used must not exceed what the problem provides.
2. **Netlist** — wires merge pins into nets (union-find).
3. **Electrical model** — 5V / HIGH pins are sources, GND / LOW pins are sinks. Resistors and pressed buttons conduct.
   An LED is lit when anode sees a source and cathode sees a sink. **No resistor in the path = burned LED**, and a zero-ohm
   path from supply to ground = **short circuit**. Reading an unconnected input = **floating pin** error.
4. **Firmware** — runs against `pinMode/digitalWrite/digitalRead/delay/millis` on a virtual clock (every call costs 10 µs, `delay` costs its length),
   so results are deterministic.
5. **Tests** — each test supplies a button timeline (with optional contact bounce) and a `check(H)` function that inspects LED states over time.
   Hidden tests report only "Failed a hidden test case" so people can't hardcode answers.
6. **Score** = `optimal parts / your parts`, capped at 100%. Failing circuits score 0.

## Known limits of the prototype (and what to do next)

- Firmware is **JavaScript with the Arduino API**, not C++. Next step: compile real `.ino` with `arduino-cli` on the server and execute the hex in
  [`avr8js`](https://github.com/wokwi/avr8js) (Uno) or `rp2040js` (Pico). The pin/time hooks in `judge.js` are the seam to replace.
- The circuit model is **digital only** (no analog values, pots, transistors, op-amps). Add ngspice (WASM) for analog problems.
- Judging runs **in the browser**, so hidden tests and answers are visible to anyone who opens devtools. For real use, move `judge()` + tests behind an API
  (job queue + sandboxed workers) and keep tests/reference solutions server-side. Add auth, a global leaderboard and a database.
- The Web Worker only guards against hung firmware (8 s timeout); it is not a security sandbox.
- Single button input per test; add more input channels (several buttons, sensors, serial) in `pressedAt`/`runTest`.
- The editor is a plain textarea; swap in Monaco/CodeMirror for syntax highlighting.

## Adding a problem

Append to `PROBLEMS` in `problems.js`: set `limits`, `ref`, a `statement`, a `starter`, and tests.
Then add a reference solution + a couple of wrong attempts to `test/run.js` and confirm the reference scores 100%.
