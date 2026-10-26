# Contributing

Thanks for helping! The whole app is `index.html`. There is no build step and there are no dependencies.

## Workflow

1. Fork the repo and create a branch.
2. Make your change in `index.html` (or docs, samples, tests).
3. Run `npm test`. It must stay green.
4. If you added or changed a problem, run `npm run catalog` and commit the regenerated `samples/problems.json` and `docs/PROBLEMS.md`. CI checks that they are up to date.
5. Open a pull request (or merge request) describing what you changed and why.

## Adding a problem

1. **Write it.** Add an object to the `PROBLEMS` array in `index.html` (search for `var PROBLEMS = [`). The fields are documented in [docs/TECHNICAL_DESIGN.md §8](docs/TECHNICAL_DESIGN.md#8-problem-format). Checklist:
   - `id` is unique, lower-case, with hyphens. It appears in URLs.
   - At least one visible and one hidden test. Hidden tests should target shortcuts: blocking `delay()`, bounce, timing edges, unusual inputs.
   - `check()` functions are **self-contained**: they are stringified into a Web Worker, so they cannot use outer variables.
   - Visible test messages say what was expected *and when* (for example "At t=1500ms the LED should be ON").
   - Two or three hints, from a nudge to almost the answer.
2. **Prove it is solvable at `ref`.** Add `samples/solutions/<id>.json` with a circuit using exactly `ref` parts. `npm test` will fail until it is Accepted at 100%.
3. **Prove the obvious wrong answers fail.** Add one or more `samples/negative/*.json` for the mistakes you expect.
4. **Regenerate the catalog** with `npm run catalog`.

Use `CC_FILTER=<id> npm run test:samples` and `npm run judge -- samples/solutions/<id>.json` for a fast loop while you work.

## Adding a part type

A new part touches four places in `index.html`:

1. In `judge()`, the `PINS` table (plus `OPTIONAL` if some pins may stay unwired).
2. In `judge()`, the `switch (p.type)` that turns parts into loads, edges or sources, and `volts()` if the part matters for analogue reads.
3. In the app, `PART_DEFS` (pin positions, labels, box) and `partBody()` (its SVG drawing).
4. The help page (`renderHelp`) and the type list in `tests/bank.test.mjs`.

Add an engine test for the new behaviour in `tests/engine.test.mjs`.

## Style

- Plain ES5-style JavaScript inside `index.html`, so the judge can be stringified into a worker and run anywhere.
- Keep the judge deterministic: no `Math.random`, no wall-clock time.
- User-facing text uses sentence case, plain verbs and no jargon the problem has not introduced.
