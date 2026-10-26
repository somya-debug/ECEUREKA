// Judges every sample in samples/ and compares with its expected verdict.
//   samples/solutions/*.json  reference solutions: must be Accepted with the optimal part count
//   samples/negative/*.json   common mistakes: must fail with the expected verdict and message
// Set CC_FILTER=<text> to run only samples whose problem id or file name contains <text>.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { engine, samples } from './helpers.mjs';
import { toJob } from '../scripts/load-engine.mjs';
import { config } from '../scripts/env.mjs';

const pick = (s) => !config.filter || s.file.includes(config.filter) || s.data.problem.includes(config.filter);
const problemOf = (id) => engine.PROBLEMS.find((p) => p.id === id);

describe('reference solutions', () => {
  test('every problem has a reference solution', { skip: !!config.filter }, () => {
    const have = new Set(samples('solutions').map((s) => s.data.problem));
    engine.PROBLEMS.forEach((p) => assert.ok(have.has(p.id), `missing samples/solutions/${p.id}.json`));
  });
  for (const s of samples('solutions').filter(pick)) {
    test(`${s.data.problem} is Accepted at the optimal part count`, () => {
      const p = problemOf(s.data.problem);
      assert.ok(p, `unknown problem ${s.data.problem}`);
      const r = engine.judge(toJob(p, s.data));
      const failing = r.tests.filter((t) => !t.pass).map((t) => `${t.name}: ${t.message}`).join('; ');
      assert.equal(r.verdict, 'Accepted', failing || r.issues.join('; '));
      assert.equal(r.used, p.ref, 'part count should match the problem\'s optimal');
      assert.equal(engine.scoreFor(r.used, p.ref), 100);
    });
  }
});

describe('common mistakes are rejected', () => {
  for (const s of samples('negative').filter(pick)) {
    test(`${s.data.name} (${s.data.problem})`, () => {
      const r = engine.judge(toJob(problemOf(s.data.problem), s.data));
      assert.equal(r.verdict, s.data.expected.verdict);
      if (s.data.expected.messageIncludes) {
        const text = r.issues.concat(r.tests.map((t) => t.message)).join('\n');
        assert.ok(text.includes(s.data.expected.messageIncludes), `expected a message containing "${s.data.expected.messageIncludes}", got:\n${text}`);
      }
    });
  }
});
