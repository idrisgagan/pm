# Code review

Date: 2026-11-01. Scope: the whole repo at commit `ae223d6`.

This replaces the review of `5facb0a`. `main` was reset to `upstream/main`, the course starter. That code is still on the `before_yolo` branch, locally and on `origin`.

## Summary

The repo is now the course starting point. It is a frontend-only Kanban demo of about 600 lines of app code, with the build plan in `docs/PLAN.md`. The backend, Docker setup, scripts and AI chat from the previous review are gone. Every finding in that review referred to code that no longer exists.

The starter is in good shape. Lint is clean, the build passes, and all 6 unit tests and 3 end-to-end tests pass. There are no High findings.

**Update, same day:** every Critical, High and Medium item is closed. M1, M2, M4 and L1 are fixed. M3 is fixed except one moderate advisory in the lint toolchain, which no released version fixes and which is accepted below. See "Fix log". Before starting Part 2, read "Rebuild checklist" at the end. It lists the bugs found in the previous build, so the rebuild can avoid them.

## Fix log

| Finding | Change | Verified by |
|---|---|---|
| M1 | `next` and `eslint-config-next` 16.1.6 → 16.4.3, then `npm audit fix` | `npm audit --omit=dev`: 0 vulnerabilities |
| L1 | `src/test/vitest.d.ts` references `vitest/globals`. Required by M1: Next 16.4.3 type-checks test files during `next build`, so the 17 test errors failed the build. | `tsc --noEmit`: 0 errors. `npm run build` passes |
| M2 | Added `KeyboardSensor` with `sortableKeyboardCoordinates` | New Playwright tests for keyboard reorder and keyboard move between columns. Both fail without the change and pass with it. |
| M4 (new) | Added `id="kanban-board"` to `DndContext` | New Playwright test checks that the card's `aria-describedby` points to the instructions. The hydration warning no longer appears in the dev server log. |
| M3 | `vitest` and `@vitest/coverage-v8` 3.2.4 → 5.0.5. `@types/node` ^20 → ^24, because vitest 5 requires ^22 or >=24. | Full `npm audit`: 0 critical, 0 high. The 16 remaining moderate entries all come from the one `minimatch` advisory (accepted, see M3). |
| M3 follow-on | `src/test/vitest.d.ts` adds jest-dom's matchers to Vitest 5's `Matchers<R, T>` interface. jest-dom 7.0.1, the latest, still extends the old one-parameter `Assertion<T>`. Without this, `toBeInTheDocument` and `toHaveValue` failed type checks, and `next build` failed. | `tsc --noEmit`: 0 errors. A temporary probe confirmed real matchers type-check and a made-up matcher is rejected. |

Final retest, after all fixes:

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run lint` | Clean |
| `npm run build` (Next.js 16.4.3) | Passes |
| `vitest run --coverage` (5.0.5) | 6 of 6 passed, 82.75% line coverage |
| `playwright test --repeat-each=3` | 18 of 18 passed (6 tests × 3), no hydration warning |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm audit` (including dev tools) | 0 critical, 0 high, 16 moderate (all `minimatch`, accepted) |

## What I checked and how

| Check | Result |
|---|---|
| Read every tracked file except `package-lock.json` | Done |
| `npm run lint` | Clean |
| `npm run build` | Passes. Static output for `/` |
| `npx tsc --noEmit` | 17 errors, all in the two test files |
| `vitest run --coverage` | 6 passed, 77% line coverage (this count includes config files, see L2) |
| `playwright test` (dev server on port 3000) | 3 passed |
| `npm audit --omit=dev` | 6 advisories: 1 critical, 4 high, 1 moderate |
| Keyboard behaviour | Temporary Vitest probe (deleted) and dnd-kit source |

Findings marked "from code" were read, not reproduced.

## Medium

### M1. Next.js 16.1.6 has known security advisories (fixed)

- **Where:** `frontend/package.json:21` (`next`), `:37` (`eslint-config-next`)
- **Evidence:** `npm audit` reports:
  - `next`: critical. The fix is `next@16.4.3`, not a major version.
  - `postcss` and `sharp`: high. Both come in through `next` and are fixed by the same upgrade.
  - `nanoid` and `source-map-js`: high. Transitive, and `npm audit fix` fixes them.
  - `baseline-browser-mapping`: moderate. Transitive, and `npm audit fix` fixes it.
- **Context:** Most `next` advisory titles name server features this app does not use: middleware, Server Actions, image optimization and caching. The plan serves a static export from FastAPI, so the Next.js server will only run during development. Two advisory titles name the dev server: "dev HMR websocket CSRF" and "information disclosure in development server's Model Context Protocol endpoint".
- **Action:** Set `next` and `eslint-config-next` to `16.4.3`, then run `npm install`, `npm audit fix`, and the full test suite.

### M2. Cards cannot be moved with the keyboard (fixed)

- **Where:** `frontend/src/components/KanbanBoard.tsx:22-26`
- **Evidence:** Each card renders with `role="button"`, `tabindex="0"` and `aria-roledescription="sortable"`. dnd-kit's default screen-reader text says: "To pick up a draggable item, press the space bar. While dragging, use the arrow keys to move the item." Only `PointerSensor` is registered, and there is no `KeyboardSensor` in `src`. So keyboard users can focus a card and hear the instructions, but cannot move it (from code).
- **Action:** Add `useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })` from `@dnd-kit/core` and `@dnd-kit/sortable`.

### M3. Dev-only tools have advisories that need major upgrades (new, fixed except one accepted advisory)

- **Where:** `frontend/package.json:35` (`@vitest/coverage-v8`), `:36` (`eslint`), `:41` (`vitest`)
- **Evidence:** The first audit used `--omit=dev`. A full `npm audit` after the M1 fix reports 22 dev-only advisories: 2 critical, 20 moderate.
  - Critical: `vitest` and `tinypool`. Advisory titles include "Prototype Pollution Gadget to RCE" and "Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock". The fix is `vitest` 5, a major version up from 3.
  - Moderate: the ESLint chain, mostly through `minimatch`, plus `glob` and `test-exclude` through `@vitest/coverage-v8`. npm's suggested fixes are `eslint@4.0.0` and `eslint-config-next@0.2.4`. Those are old downgrades. Do not apply them.
- **Context:** These packages run only during tests and linting, not in the app.
- **Done:** Upgraded `vitest` and `@vitest/coverage-v8` to 5.0.5. That clears both critical advisories, the two `@vitest/mocker` advisories and the `glob` advisory.
- **Accepted:** `minimatch` "potential denial of service via globparts amplification" (affected range `<11.0.1`). Installed copies are 3.1.5, 9.0.9 and 10.2.6. They come from `@eslint/eslintrc`, `@eslint/config-array`, `eslint-plugin-import`, `eslint-plugin-react`, `eslint-plugin-jsx-a11y`, `@typescript-eslint/typescript-estree` and `glob`. The latest release of each (as of 2026-11-01, including `eslint` 10.14.0) still depends on `minimatch` ^3 or ^10, so no upgrade fixes it. Forcing 11 with an npm override would break the ^3 users, which call `minimatch` as a function. The advisory needs an attacker-supplied glob pattern. Here the only patterns come from this repo's own lint config, and the code runs only during linting.
- **Recheck:** Run `npm audit` after each ESLint or plugin release, and remove the acceptance once a fixed version is available.

### M4. Screen-reader instructions were not linked to cards (new, fixed)

- **Where:** `frontend/src/components/KanbanBoard.tsx`, the `DndContext`
- **Evidence:** The dev server logged a hydration mismatch on every page load, before and after the M2 change: `aria-describedby` was `DndDescribedBy-1` on the server and `DndDescribedBy-0` in the browser. React keeps the server value, so in the browser each card pointed to `DndDescribedBy-1`, an element that did not exist. Screen readers therefore had no instructions to read.
- **Action:** Give `DndContext` a fixed `id`, so the server and browser generate the same value.

## Low

### L1. Test type errors (fixed)

`tsc --noEmit` reported 17 errors: `TS2304` and `TS2582` for `describe`, `it` and `expect`, in `src/lib/kanban.test.ts` and `src/components/KanbanBoard.test.tsx`. Vitest runs with `globals: true`, but `src/test/vitest.d.ts` referenced `vitest`, not `vitest/globals`. On Next 16.1.6 the build was not affected. On 16.4.3 these errors fail `next build`, so this was fixed as part of M1. The vitest 5 upgrade in M3 needed a further change to the same file (see Fix log).

### L2. Generated files are tracked, linted or counted

- `frontend/test-results/.last-run.json` is committed. Add `/test-results/` to `frontend/.gitignore` and remove the file from git.
- ESLint scans `coverage/`. After a coverage run, lint reported a warning in `coverage/block-navigation.js`. Add `"coverage/**"` to `globalIgnores` in `eslint.config.mjs`.
- The coverage report includes `next.config.ts`, `playwright.config.ts` and `postcss.config.mjs` at 0%, because `vitest.config.ts` has no `coverage.include`. Add `include: ["src/**/*.{ts,tsx}"]`.

### L3. Column title can be empty

`KanbanColumn.tsx:44` saves every keystroke, and nothing stops an empty title. The column and the header chip then show no name (from code). This matters more after Part 7. The previous build sent every keystroke to the API, and the API rejected empty titles, which caused rename bugs (see the rebuild checklist). Keep edits local and save on blur or Enter, skipping empty values.

### L4. Drop position between columns

`moveCard` (`kanban.ts:144-151`) puts a card dropped on another column's card above that card. The only way to drop at the bottom of a non-empty column is the empty space below the last card. The board does not show where the card will land until you drop it, because there is no `onDragOver` handler (from code). Fine for the demo. Revisit if users find it awkward.

### L5. Small cleanups

`useMemo(() => board.cards, [board.cards])` at `KanbanBoard.tsx:28` returns the same object it is given, so remove it. `data-testid` values double up the prefix (`card-card-1`, `column-col-review`), because the ids already carry it.

## Plan status (not defects)

- Part 1 asks for `frontend/AGENTS.md`. It did not exist at review time. An untracked copy appeared while the fixes were in progress, and it is not covered by this review. `backend/AGENTS.md` and `scripts/AGENTS.md` are empty files.
- Part 3 needs `output: "export"` in `next.config.ts`, which is currently empty.
- `AGENTS.md` says the API key is in `.env` at the project root. There is no `.env` in this checkout. The root `.gitignore` covers it (line 130).

## Rebuild checklist (from the review of `5facb0a`)

Each item below was reproduced in the previous build. Build them right the first time.

| Part | Do this | Previous bug |
|---|---|---|
| 2 | Use a Node 22 or later image for the frontend build stage (for example `node:24-slim`). vitest 5 requires Node `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` | The previous Dockerfile used `node:20-slim` |
| 2 | Bind Docker to `127.0.0.1:8000:8000` and mount a volume for the SQLite file | The app listened on all interfaces. The database was deleted on every restart. |
| 3 | Serve static files with `StaticFiles(directory=..., html=True)`, or reject any path that resolves outside the folder. Add a test with `..` | `GET /../.env` returned files outside the web folder |
| 6 | Open SQLite with `check_same_thread=False` when using a sync `get_db` dependency. Add a parallel-request test | 8 of 10 overlapping requests returned 500 |
| 6 | Remove the card from its column before computing the target list on a same-column move. Test moving up and down | Moving up did nothing. Moving down put the card one slot short. |
| 6, 9 | Put create, move and delete card in one module, used by both the API and the AI | The same logic was copied 5 times, and the move bug was in both copies |
| 6 | Use a pytest fixture that sets the database path with `monkeypatch` and creates tables per test | Tests depended on run order and wrote to the real database |
| 7 | Refresh the board in the background. Show the loading screen only on first load | Every edit flashed the loading screen and wiped the chat draft |
| 7 | Save column renames on blur or Enter, and skip empty titles | Clearing "Backlog" and typing "Todo" saved "BacklogTodo" |
| 9 | Catch Pydantic `ValidationError`. Accept or strip `card-`/`col-` id prefixes. Return only the actions that were applied | Bad model output returned 500. The chat said "Deleted it." for a card that did not exist. |
| 9 | Send the board once as compact JSON, and cap history length | The board was sent twice per call, with unbounded history |
| 10 | Pick the chat label color by role | "Assistant" label was white on a white bubble |

## Action list

| # | Action | Findings | Status |
|---|---|---|---|
| 1 | Upgrade `next` and `eslint-config-next` to 16.4.3, run `npm audit fix`, rerun tests | M1, L1 | Done |
| 2 | Add `KeyboardSensor` with `sortableKeyboardCoordinates`, and a fixed `DndContext` id | M2, M4 | Done |
| 3 | Upgrade `vitest` and `@vitest/coverage-v8` to 5. Accept the `minimatch` advisory until upstream fixes it | M3 | Done |
| 4 | Ignore `test-results/` and `coverage/`. Set `coverage.include` | L2 | Open |
| 5 | Small cleanups | L5 | Open |
| 6 | Start Part 1 of `docs/PLAN.md`. Use the rebuild checklist when writing the detailed plan | Plan status, checklist | Open |

L3 and L4 can wait until Part 7, when the frontend starts calling the backend.
