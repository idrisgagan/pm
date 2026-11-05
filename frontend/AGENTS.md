<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Frontend

A single-page Kanban board with an AI chat sidebar. Users sign in first, through the backend. The board is loaded from and saved to the backend, so every change survives a reload. The AI can change cards through the chat, and the board updates on screen.

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
    KanbanBoard.tsx   Loads the board, saves every change, owns the drag-and-drop context. Lays out the board and the chat.
    ChatSidebar.tsx   AI chat: conversation, message box, errors. Hands the board in each reply to KanbanBoard.
    KanbanColumn.tsx  One column: title that saves on blur, sortable card list, add-card form.
    KanbanCard.tsx    One sortable card. Title and details edit in place. Remove button below them.
    KanbanCardPreview.tsx  Card shown under the pointer while dragging.
    NewCardForm.tsx   Collapsible form to add a card (title required, details optional).
    editKeys.ts       Enter, Escape and Shift+Enter for fields that save on blur.
  lib/
    api.ts            Calls to the backend, including chat(). Non-2xx responses throw ApiError with the status.
    kanban.ts         Types, fromApi, toApiId, moveCard.
  test/
    setup.ts          Loads jest-dom matchers.
    vitest.d.ts       Vitest globals types, plus jest-dom matcher types for Vitest 5.
tests/
  helpers.ts          signIn, signInToBoard, openFreshBoard (signs in and resets the board), and the column, card and cardTitles locators.
  auth.spec.ts        Playwright sign-in tests.
  kanban.spec.ts      Playwright board tests. Each starts from a fresh board.
  chat.spec.ts        Playwright chat tests: two with /api/chat faked in the browser, one live.
```

## Sign-in flow (`src/app/page.tsx`)

- On load, `getMe()` decides: signed in shows the board, any error shows `LoginForm`. Nothing renders while it waits.
- `LoginForm` shows "Invalid username or password." for a 401 and "Could not reach the server. Try again." for anything else.
- Sign out calls `/api/logout` and shows the login form even if that request fails. A 401 from any board call does the same.
- The session cookie is httpOnly, so frontend code cannot read it. Ask `/api/me` instead.

## Data model (`src/lib/kanban.ts`)

- `Card`: `{ id, title, details }`
- `Column`: `{ id, title, cardIds }`. Card order is the order of `cardIds`.
- `BoardData`: `{ columns: Column[], cards: Record<string, Card> }`
- `fromApi(board)`: turns the backend's board into `BoardData`. The backend numbers columns and cards separately, so ids are tagged: column 3 becomes `column-3`, card 3 becomes `card-3`. Drag and drop needs one id space.
- `toApiId(id)`: `"card-3"` back to `3`.
- `moveCard(columns, activeId, overId)`: returns new columns after a drop. Dropping on a card in the same column moves the dragged card to that card's index. Dropping on a card in another column inserts it above that card. Dropping on a column puts it at the end.

## Behavior (`src/components/KanbanBoard.tsx`)

- On mount, loads `GET /api/board`. "Loading board..." shows only until the first load finishes.
- Every change goes through `save`: show the new board, call the API, then replace the board with the server's reply. If the call fails, reload the board in the background and show "Could not save your change. The board was reloaded." in the header. The message clears after the next successful save.
- No API call runs inside a React state updater. Handlers work out the next board from the current one.
- Add card: shows once the server replies, because the card needs its id from the server.
- Rename column: the input is uncontrolled. It saves on blur or Enter, skips empty or unchanged titles, and Escape puts the saved title back. `key={column.title}` resets the input when the saved title changes.
- Edit card: click the title or details. Same keys as rename, plus Shift+Enter for a new line in details. An empty title keeps the old one. Empty details show "No details yet."
- Move card: `moveCard` gives the new order, then one `PATCH /api/cards/{id}` sends the card's new column and position.
- Remove card: `DELETE /api/cards/{id}`.
- Drag and drop: `PointerSensor` (starts after 6 px of movement) and `KeyboardSensor` with `sortableKeyboardCoordinates`. To move with the keyboard: Tab to a card, Space to pick up, arrow keys to move, Space to drop, Escape to cancel. Collision detection is `closestCorners`, and the move is applied on drag end.
- The card is its own activator node (`setActivatorNodeRef`). Without it, Space or Enter on a button or field inside the card picks the card up.
- Edit fields stop `pointerdown` from reaching the card's drag listener, so selecting text does not start a drag. Do not use the sortable's `disabled` option for this: it sets `aria-disabled` on the whole card, which disables the fields inside it for screen readers and Playwright.
- Cards have `aria-label` set to their title. Without it, the card's accessible name is every label inside it joined up.
- `DndContext` has a fixed `id="kanban-board"`. Without it, the generated `aria-describedby` id differs between server and browser render, and cards lose their screen-reader instructions.
- Inputs use the backend's limits: titles 200 characters, details 2,000.
- Card titles use `wrap-anywhere`, and the Remove button sits below the details, so titles get the card's full width and never run under the button in narrow columns.

## AI chat (`src/components/ChatSidebar.tsx`)

- Layout: from Tailwind's `2xl` breakpoint (1536px), the sidebar is a 340px column beside the board and sticks while the page scrolls. Narrower, it sits under the board. Five columns plus the sidebar leave too little room for card titles below 1536px. The page's maximum width is 1800px.
- The root element uses `overflow-clip`, not `overflow-hidden`. `overflow-hidden` makes it a scroll container, and the sidebar would no longer stick.
- The conversation lives in the sidebar's state. Each message sends the earlier ones as `history`, cut to the last 20 messages of up to 4,000 characters each, which are the backend's limits.
- Enter sends, Shift+Enter adds a line. The box takes up to 2,000 characters. While a reply is pending, "Thinking..." shows and Send is disabled. Typing still works.
- A reply's `board` replaces the board through `onBoard`. The board never shows its loading screen again, so the chat draft and conversation stay.
- Skipped actions show as one note under the reply, for example "1 change could not be made: Card not found." Skipped actions with every field null are left out.
- Errors show in the sidebar and leave the board alone. 503 shows "AI is not configured.", any other error status "The AI could not answer. Try again.", and a network failure "Could not reach the server." The message goes back into the box, and anything typed while waiting is kept after it. A 401 signs out.
- Labels are colored by role: "You" in yellow on the navy bubble, "AI" in purple on the light bubble.

## Test hooks

- Columns: `data-testid="column-<id>"`, for example `column-3`. Cards: `data-testid="card-<id>"`. These are also the dnd-kit ids.
- A card is a button named after its title. Inside it: `Edit <title>`, `Edit details of <title>`, `Delete <title>`. Edit fields: `aria-label="Card title"` and `"Card details"`.
- Column title input: `aria-label="Column title"`.
- Chat: the sidebar is `role="complementary"` named "AI chat". Messages are in its `role="log"`. The box is `aria-label="Message"`, the button "Send". "Thinking..." is `role="status"`. Errors are `role="alert"`.

## Commands

```bash
npm run dev          # Dev server on http://localhost:3000 (no backend, so sign-in fails)
npm run build        # Static export to out/
npm run lint         # ESLint
npm run test:unit    # Vitest
npm run test:e2e     # Playwright in a throwaway container on 127.0.0.1:8001
npm run test:all     # Both
```

The live chat test is skipped unless `OPENROUTER_API_KEY` is set in the shell. Playwright passes it into the test container with `docker run -e`. To run it: `set -a; . ../.env; set +a; npm run test:e2e`.

`npm run test:e2e` builds the image from the repo root, tagged `pm-app-e2e`, and runs it on port 8001 with no volume. Every run starts from an empty database, and the app on port 8000 is never touched. Playwright stops the container at the end, and `--rm` removes it. The command uses `sh` syntax, so it has not been run on Windows.

There is one user and one board, so tests run one at a time (`workers: 1`). Board tests call `openFreshBoard`, which resets the board to `SEED` in `tests/helpers.ts` through the API. Card ids change on every reset, so find cards by title, not id.

Keyboard drag tests wait one browser task after picking a card up, because dnd-kit's `KeyboardSensor` adds its arrow-key listener in a `setTimeout`. Keep that wait in any new keyboard test.

Next.js adds an empty `role="alert"` route announcer to every page. Scope alert locators, for example `page.locator("form").getByRole("alert")`, `page.locator("header").getByRole("alert")` or the chat sidebar's `getByRole("alert")`.

## Tests

- `src/components/ChatSidebar.test.tsx`: sends on Enter and shows the reply; sends history; cuts history to 20 messages of 4,000 characters; Shift+Enter adds a line; no empty sends; pending disables sending; error text for 502, 500, 503 and a network failure, with the message put back; text typed while waiting is kept; retry leaves the failed message out of history; 401 signs out; skipped-change notes, with empty actions left out; label colors by role.
- `src/lib/api.test.ts`: changes are sent as JSON, non-2xx throws `ApiError` with the status, network errors pass through.
- `src/lib/kanban.test.ts`: `fromApi` tags ids and keeps order, `toApiId`, and `moveCard` reorder in a column, move to another column, drop on a column.
- `src/components/KanbanBoard.test.tsx`: loads from the server; rename saves once on blur and skips empty titles; card title saves on Enter; details save on blur with Shift+Enter lines; Escape and an empty title do not save; add; remove; a failed save shows the message and reloads; a chat reply replaces the board and keeps the draft; a 401 signs out.
- `src/components/LoginForm.test.tsx`: valid sign-in, wrong credentials, server unreachable, both fields required.
- `src/app/page.test.tsx`: signed out shows the form, signed in shows the board, signing in, signing out, signing out when the request fails, a 401 from the board shows the form.
- `tests/auth.spec.ts`: login form first, wrong password, stays signed in after reload, sign out, API returns 401 without a session.
- `tests/chat.spec.ts`: a card from a faked chat reply appears without a reload; a faked 502 shows the error, puts the message back and leaves the board alone; live: the AI adds a card that is still there after a reload.
- `tests/kanban.spec.ts`: loads the seed board; add, edit, delete, rename, mouse move between columns, keyboard reorder, keyboard move, each checked again after a reload; keyboard instructions linked to cards; a failed save shows the message and the board matches the server.
