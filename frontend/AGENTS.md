<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Frontend

A single-page Kanban board. Users sign in first, through the backend. The board itself still lives in React state in the browser, so it is not saved: a page refresh or sign-out resets it to the seed data.

The frontend needs the backend for every API call. `npm run dev` shows the login screen but cannot sign in, because nothing answers `/api` on port 3000. To see frontend changes working, rebuild the Docker app with `scripts/start-<os>`.

`next.config.ts` sets `output: "export"`, so `npm run build` writes plain files to `out/`. In Docker, the FastAPI backend serves them at `/`. Static export does not support server features such as API routes, cookies, rewrites or Server Actions. Talk to the backend's `/api` routes instead.

## Stack

- Next.js 16.4.3 (App Router), React 19.2.3, TypeScript (strict)
- Tailwind CSS 4, with color tokens as CSS variables in `src/app/globals.css`
- `@dnd-kit/core` and `@dnd-kit/sortable` for drag and drop
- Vitest 5 + Testing Library (jsdom) for unit tests, Playwright for end-to-end tests

## Layout

```
src/
  app/
    layout.tsx        Root layout. Loads Space Grotesk (display) and Manrope (body) fonts.
    page.tsx          Checks the session with /api/me, then shows LoginForm or KanbanBoard.
    globals.css       Color tokens and base styles.
  components/
    LoginForm.tsx     Username and password form. Calls /api/login and shows errors.
    KanbanBoard.tsx   Owns all board state and the drag-and-drop context. Shows Sign out when given onSignOut.
    KanbanColumn.tsx  One column: editable title, sortable card list, add-card form.
    KanbanCard.tsx    One sortable card with a Remove button.
    KanbanCardPreview.tsx  Card shown under the pointer while dragging.
    NewCardForm.tsx   Collapsible form to add a card (title required, details optional).
  lib/
    api.ts            Calls to the backend: getMe, login, logout. Non-2xx responses throw ApiError with the status.
    kanban.ts         Types, seed data, moveCard, createId.
  test/
    setup.ts          Loads jest-dom matchers.
    vitest.d.ts       Vitest globals types, plus jest-dom matcher types for Vitest 5.
tests/
  helpers.ts          signIn and signInToBoard for Playwright tests.
  auth.spec.ts        Playwright sign-in tests.
  kanban.spec.ts      Playwright board tests. Each signs in first.
```

## Sign-in flow (`src/app/page.tsx`)

- On load, `getMe()` decides: signed in shows the board, any error shows `LoginForm`. Nothing renders while it waits.
- `LoginForm` shows "Invalid username or password." for a 401 and "Could not reach the server. Try again." for anything else.
- Sign out calls `/api/logout` and shows the login form even if that request fails.
- The session cookie is httpOnly, so frontend code cannot read it. Ask `/api/me` instead.

## Data model (`src/lib/kanban.ts`)

- `Card`: `{ id, title, details }`
- `Column`: `{ id, title, cardIds }`. Card order is the order of `cardIds`.
- `BoardData`: `{ columns: Column[], cards: Record<string, Card> }`
- `initialData`: five columns (`col-backlog`, `col-discovery`, `col-progress`, `col-review`, `col-done`) and eight cards (`card-1` to `card-8`).
- `moveCard(columns, activeId, overId)`: returns new columns after a drop. Dropping on a card in the same column moves the dragged card to that card's index. Dropping on a card in another column inserts it above that card. Dropping on a column puts it at the end.
- `createId(prefix)`: random id for new cards, for example `card-k3x9q2lzm8a1`.

## Behavior (`src/components/KanbanBoard.tsx`)

- State: `board` (seeded from `initialData`) and `activeCardId` (the card being dragged).
- Rename column: every keystroke in the column title input updates state. Empty titles are allowed.
- Add card: appended to the end of the column. Empty details become "No details yet."
- Remove card: deletes it from `cards` and from the column's `cardIds`.
- Drag and drop: `PointerSensor` (starts after 6 px of movement) and `KeyboardSensor` with `sortableKeyboardCoordinates`. To move with the keyboard: Tab to a card, Space to pick up, arrow keys to move, Space to drop, Escape to cancel. Collision detection is `closestCorners`, and the move is applied on drag end.
- `DndContext` has a fixed `id="kanban-board"`. Without it, the generated `aria-describedby` id differs between server and browser render, and cards lose their screen-reader instructions.
- Cards cannot be edited yet. `AGENTS.md` at the repo root requires editing (Part 7).

## Test hooks

- Columns: `data-testid="column-<column id>"`, for example `column-col-backlog`.
- Cards: `data-testid="card-<card id>"`, for example `card-card-1`. The prefix repeats because card ids already start with `card-`.
- Column title input: `aria-label="Column title"`. Remove button: `aria-label="Delete <card title>"`.

## Commands

```bash
npm run dev          # Dev server on http://localhost:3000 (no backend, so sign-in fails)
npm run build        # Static export to out/
npm run lint         # ESLint
npm run test:unit    # Vitest
npm run test:e2e     # Playwright against the Docker app on 127.0.0.1:8000; start it first
npm run test:all     # Both
```

Playwright tests run against the Docker app so that `/api` works. Rebuild it with `scripts/start-<os>` before testing frontend changes, or the tests run against the old build.

Keyboard drag tests wait one browser task after picking a card up, because dnd-kit's `KeyboardSensor` adds its arrow-key listener in a `setTimeout`. Keep that wait in any new keyboard test.

Next.js adds an empty `role="alert"` route announcer to every page. Scope alert locators, for example `page.locator("form").getByRole("alert")`.

## Tests

- `src/lib/kanban.test.ts`: `moveCard` reorder in a column, move to another column, drop on a column.
- `src/components/KanbanBoard.test.tsx`: renders five columns, renames a column, adds and removes a card.
- `src/components/LoginForm.test.tsx`: valid sign-in, wrong credentials, server unreachable, both fields required.
- `src/app/page.test.tsx`: signed out shows the form, signed in shows the board, signing in, signing out, signing out when the request fails.
- `tests/auth.spec.ts`: login form first, wrong password, stays signed in after reload, sign out, API returns 401 without a session.
- `tests/kanban.spec.ts`: page loads, add a card, drag a card to another column, keyboard instructions are linked to cards, keyboard reorder, keyboard move to another column.
