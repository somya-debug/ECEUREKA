// Loads the judge and the problem bank out of the single-file app (index.html) so they can run in Node.
// The browser app stays the single source of truth: nothing is duplicated into separate .js files.
import { readFileSync } from 'node:fs';
import { config } from './env.mjs';

const START = '<script>';
const END = "if (typeof module !== 'undefined') module.exports = { PROBLEMS: PROBLEMS };";

export function loadEngine(appPath = config.app) {
  const html = readFileSync(appPath, 'utf8');
  const s = html.indexOf(START), e = html.indexOf(END);
  if (s < 0 || e < 0) throw new Error(`Could not find the judge/problem section in ${appPath}`);
  const src = html.slice(s + START.length, e) +
    '\nmodule.exports = { judge: judge, pressedAt: pressedAt, scoreFor: scoreFor, ratingFor: ratingFor, PROBLEMS: PROBLEMS };';
  const mod = { exports: {} };
  new Function('module', src)(mod);
  return mod.exports;
}

// Build the job object exactly like the browser does before posting it to the Web Worker.
export function toJob(problem, sample) {
  return {
    circuit: { parts: sample.circuit.parts.map((p) => ({ id: p.id, type: p.type })), wires: sample.circuit.wires },
    code: sample.code,
    limits: problem.limits,
    tests: problem.tests.map((t) => ({
      name: t.name, hidden: !!t.hidden, duration: t.duration,
      input: t.input || null, inputs: t.inputs || null, analog: t.analog || null,
      check: t.check.toString()
    }))
  };
}
