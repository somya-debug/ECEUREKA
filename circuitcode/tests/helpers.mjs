import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEngine } from '../scripts/load-engine.mjs';
import { ROOT } from '../scripts/env.mjs';

export const engine = loadEngine();

// Compact circuit builder for unit tests: C('LED1 RES1', 'D3-RES1.1, RES1.2-LED1.A, LED1.K-GND')
// Bare pin names (D3, 5V, GND, A0) refer to the Arduino.
export function C(parts, wires) {
  return {
    parts: parts.split(/\s+/).filter(Boolean).map((id) => ({ id, type: id.replace(/\d+$/, '') })),
    wires: wires.split(/\s*,\s*/).filter(Boolean).map((w) => w.split('-').map((x) => (x.includes('.') ? x : 'mcu.' + x)))
  };
}

// Run firmware against a circuit with one ad-hoc test whose check() returns whatever H reports.
// probe(H) runs inside the judge, so it must be self-contained; its result is passed back in the test message.
export function run(circuit, code, { limits, duration = 1000, input = null, inputs = null, analog = null, probe } = {}) {
  const lim = limits || Object.fromEntries(circuit.parts.map((p) => [p.type, 99]));
  const check = probe
    ? `function (H) { return 'PROBE:' + JSON.stringify((${probe.toString()})(H)); }`
    : 'function () { return null; }';
  const r = engine.judge({ circuit, code, limits: lim, tests: [{ name: 't', duration, input, inputs, analog, check }] });
  const msg = r.tests[0] && r.tests[0].message;
  const value = msg && msg.startsWith('PROBE:') ? JSON.parse(msg.slice(6)) : undefined;
  return { result: r, verdict: r.verdict, message: msg, value };
}

export function samples(dir) {
  const full = resolve(ROOT, 'samples', dir);
  return readdirSync(full).filter((f) => f.endsWith('.json')).sort()
    .map((f) => ({ file: `samples/${dir}/${f}`, data: JSON.parse(readFileSync(resolve(full, f), 'utf8')) }));
}
