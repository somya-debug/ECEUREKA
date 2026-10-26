// Integrity checks for the problem bank in index.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engine } from './helpers.mjs';

const { PROBLEMS } = engine;
const TYPES = ['LED', 'RES', 'BTN', 'BUZ', 'LDR', 'POT', 'RGB', 'SEG', 'PIR', 'SRV', 'SR'];
const ORDER = { 'Easy': 0, 'Medium': 1, 'Hard': 2, 'Nearly Impossible': 3 };

test('ids are unique and URL-safe', () => {
  const ids = PROBLEMS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach((id) => assert.match(id, /^[a-z0-9-]+$/));
});

test('list is sorted by difficulty', () => {
  for (let i = 1; i < PROBLEMS.length; i++) assert.ok(ORDER[PROBLEMS[i - 1].difficulty] <= ORDER[PROBLEMS[i].difficulty]);
});

test('every difficulty has problems', () => {
  Object.keys(ORDER).forEach((d) => assert.ok(PROBLEMS.some((p) => p.difficulty === d), d));
});

for (const p of PROBLEMS) {
  test(`${p.id}: well-formed`, () => {
    assert.ok(ORDER[p.difficulty] !== undefined, 'difficulty');
    assert.ok(p.title && p.statement.length && p.starter, 'title, statement, starter');
    Object.keys(p.limits).forEach((t) => assert.ok(TYPES.includes(t), `unknown part type ${t}`));
    const total = Object.values(p.limits).reduce((a, b) => a + b, 0);
    assert.ok(p.ref > 0 && p.ref <= total, 'ref must be reachable with the parts provided');
    assert.ok(p.tests.length >= 2, 'at least two tests');
    assert.ok(p.tests.some((t) => !t.hidden), 'at least one visible test');
    assert.ok(p.tests.some((t) => t.hidden), 'at least one hidden test');
    assert.ok((p.hints || []).length >= 2, 'at least two hints');
    p.tests.forEach((t) => {
      assert.equal(typeof t.check, 'function');
      assert.ok(t.duration > 0 && t.duration <= 15000, `${t.name}: duration`);
      // checks are stringified into a worker, so they must not close over outer variables
      assert.doesNotThrow(() => new Function('return (' + t.check.toString() + ')')(), `${t.name}: check must be self-contained`);
    });
  });
}
