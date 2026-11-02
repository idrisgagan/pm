<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Frontend

A single-page Kanban board demo. The board lives in React state in the browser, so there is no backend, no persistence, and no login yet. A page refresh resets the board to the seed data.

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
    page.tsx          Renders <KanbanBoard />.
    globals.css       Color tokens and base styles.
  components/
    KanbanBoard.tsx   Owns all board state and the drag-and-drop context.
    KanbanColumn.tsx  One column: editable title, sortable card list, add-card form.
    KanbanCard.tsx    One sortable card with a Remove button.
    KanbanCardPreview.tsx  Card shown under the pointer while dragging.
    NewCardForm.tsx   Collapsible form to add a card (title required, details optional).
  lib/
    kanban.ts         Types, seed data, moveCard, createId.
  test/
    setup.ts          Loads jest-dom matchers.
    vitest.d.ts       Vitest globals types, plus jest-dom matcher types for Vitest 5.
tests/
  kanban.spec.ts      Playwright tests.
```

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
- Cards cannot be edited yet. `AGENTS.md` at the repo root requires editing.

## Test hooks

- Columns: `data-testid="column-<column id>"`, for example `column-col-backlog`.
- Cards: `data-testid="card-<card id>"`, for example `card-card-1`. The prefix repeats because card ids already start with `card-`.
- Column title input: `aria-label="Column title"`. Remove button: `aria-label="Delete <card title>"`.

## Commands

```bash
npm run dev          # Dev server on http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint
npm run test:unit    # Vitest
npm run test:e2e     # Playwright; starts the dev server on 127.0.0.1:3000
npm run test:all     # Both
```

## Tests

- `src/lib/kanban.test.ts`: `moveCard` reorder in a column, move to another column, drop on a column.
- `src/components/KanbanBoard.test.tsx`: renders five columns, renames a column, adds and removes a card.
- `tests/kanban.spec.ts`: page loads, add a card, drag a card to another column, keyboard instructions are linked to cards, keyboard reorder, keyboard move to another column.
