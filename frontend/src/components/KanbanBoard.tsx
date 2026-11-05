"use client";

import { useEffect, useEffectEvent, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { ChatSidebar } from "@/components/ChatSidebar";
import {
  ApiError,
  createCard,
  deleteCard,
  getBoard,
  renameColumn,
  updateCard,
  type ApiBoard,
} from "@/lib/api";
import { fromApi, moveCard, toApiId, type BoardData } from "@/lib/kanban";

const SAVE_FAILED = "Could not save your change. The board was reloaded.";
const LOAD_FAILED = "Could not load the board. Reload the page to try again.";

type KanbanBoardProps = {
  // Also called when the session has ended, so the login form shows.
  onSignOut: () => void;
};

export const KanbanBoard = ({ onSignOut }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const isSignedOut = (error: unknown) => error instanceof ApiError && error.status === 401;

  const load = () =>
    getBoard().then(
      (next) => setBoard(fromApi(next)),
      (error) => (isSignedOut(error) ? onSignOut() : setError(LOAD_FAILED))
    );

  const loadOnMount = useEffectEvent(load);
  useEffect(() => {
    loadOnMount();
  }, []);

  // Show the change first, then save it. The server's board replaces the
  // local one, so the screen always ends up matching the database.
  const save = async (next: BoardData, send: () => Promise<ApiBoard>) => {
    setBoard(next);
    try {
      setBoard(fromApi(await send()));
      setError(null);
    } catch (error) {
      if (isSignedOut(error)) {
        onSignOut();
        return;
      }
      setError(SAVE_FAILED);
      await load();
    }
  };

  if (!board) {
    return (
      <p className="p-12 text-sm text-[var(--gray-text)]" role="status">
        {error ?? "Loading board..."}
      </p>
    );
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const cardId = active.id as string;
    const columns = moveCard(board.columns, cardId, over.id as string);
    const column = columns.find((column) => column.cardIds.includes(cardId));
    if (columns === board.columns || !column) {
      return;
    }
    save({ ...board, columns }, () =>
      updateCard(toApiId(cardId), {
        column_id: toApiId(column.id),
        position: column.cardIds.indexOf(cardId),
      })
    );
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    save(
      {
        ...board,
        columns: board.columns.map((column) =>
          column.id === columnId ? { ...column, title } : column
        ),
      },
      () => renameColumn(toApiId(columnId), title)
    );
  };

  // A new card needs its id from the server, so it shows once the server replies.
  const handleAddCard = (columnId: string, title: string, details: string) => {
    save(board, () => createCard(toApiId(columnId), title, details));
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    save(
      {
        cards: Object.fromEntries(
          Object.entries(board.cards).filter(([id]) => id !== cardId)
        ),
        columns: board.columns.map((column) =>
          column.id === columnId
            ? { ...column, cardIds: column.cardIds.filter((id) => id !== cardId) }
            : column
        ),
      },
      () => deleteCard(toApiId(cardId))
    );
  };

  const handleEditCard = (cardId: string, changes: { title?: string; details?: string }) => {
    save(
      { ...board, cards: { ...board.cards, [cardId]: { ...board.cards[cardId], ...changes } } },
      () => updateCard(toApiId(cardId), changes)
    );
  };

  const activeCard = activeCardId ? board.cards[activeCardId] : null;

  return (
    // overflow-clip, not overflow-hidden: hidden makes this a scroll container,
    // and the chat sidebar would no longer stick while the page scrolls.
    <div className="relative overflow-clip">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1800px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <button
                type="button"
                onClick={onSignOut}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)]"
              >
                Sign out
              </button>
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  One board. Five columns. Zero clutter.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
          {error ? (
            <p
              role="alert"
              className="rounded-2xl border border-[var(--accent-yellow)] px-4 py-3 text-sm font-semibold text-[var(--navy-dark)]"
            >
              {error}
            </p>
          ) : null}
        </header>

        {/* The chat sits beside the board only from 2xl (1536px). Narrower,
            five columns plus the sidebar leave too little room for card titles. */}
        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_340px] 2xl:items-start">
          <div className="min-w-0">
            <DndContext
              id="kanban-board"
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <section className="grid gap-6 lg:grid-cols-5">
                {board.columns.map((column) => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    cards={column.cardIds.map((cardId) => board.cards[cardId])}
                    onRename={handleRenameColumn}
                    onAddCard={handleAddCard}
                    onDeleteCard={handleDeleteCard}
                    onEditCard={handleEditCard}
                  />
                ))}
              </section>
              <DragOverlay>
                {activeCard ? (
                  <div className="w-[260px]">
                    <KanbanCardPreview card={activeCard} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
          <ChatSidebar onBoard={(next) => setBoard(fromApi(next))} onSignOut={onSignOut} />
        </div>
      </main>
    </div>
  );
};
