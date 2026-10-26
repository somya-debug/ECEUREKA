// Judge one or more sample files from the command line.
// Usage: npm run judge -- samples/solutions/charlie-six.json [more.json ...]
import { readFileSync } from 'node:fs';
import { loadEngine, toJob } from './load-engine.mjs';
import { config } from './env.mjs';

const files = process.argv.slice(2);
if (!files.length) { console.error('Usage: npm run judge -- <sample.json> [...]'); process.exit(2); }
const { judge, scoreFor, PROBLEMS } = loadEngine();
let failed = 0;
for (const f of files) {
  const sample = JSON.parse(readFileSync(f, 'utf8'));
  const problem = PROBLEMS.find((p) => p.id === sample.problem);
  if (!problem) { console.error(`${f}: unknown problem "${sample.problem}"`); failed++; continue; }
  const r = judge(toJob(problem, sample));
  const score = r.verdict === 'Accepted' ? scoreFor(r.used, problem.ref) : 0;
  const want = sample.expected && sample.expected.verdict;
  if (want && want !== r.verdict) failed++;
  console.log(`${f}\n  ${problem.title}: ${r.verdict}  parts ${r.used}/${problem.ref} optimal  score ${score}%` + (want ? `  (expected ${want})` : ''));
  r.issues.forEach((m) => console.log('  issue:', m));
  if (config.verbose) r.warnings.forEach((m) => console.log('  warning:', m));
  r.tests.forEach((t) => console.log(`  ${t.pass ? '✔' : '✘'} ${t.hidden ? '[hidden] ' : ''}${t.name}${t.message ? ' — ' + t.message : ''}`));
}
process.exit(failed ? 1 : 0);
