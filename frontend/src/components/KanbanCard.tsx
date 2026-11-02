import { useState, type PointerEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { handleEditKeys } from "@/components/editKeys";
import type { Card } from "@/lib/kanban";

type Field = "title" | "details";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onEdit: (cardId: string, changes: Partial<Record<Field, string>>) => void;
};

export const KanbanCard = ({ card, onDelete, onEdit }: KanbanCardProps) => {
  const [editing, setEditing] = useState<Field | null>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  // Keeps the pointer from reaching the card's drag listener, so selecting
  // text with the mouse stays in the field. Disabling the sortable instead
  // would mark the whole card aria-disabled.
  const stopDrag = (event: PointerEvent) => event.stopPropagation();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Saves on blur. An empty title keeps the old one; details may be empty.
  const finishEdit = (field: Field, value: string) => {
    setEditing(null);
    const text = value.trim();
    if ((text || field === "details") && text !== card[field]) {
      onEdit(card.id, { [field]: text });
    }
  };

  return (
    // The card is its own drag handle. Without the activator ref, Space or
    // Enter on any button inside the card picks the card up instead.
    <article
      ref={(node) => {
        setNodeRef(node);
        setActivatorNodeRef(node);
      }}
      style={style}
      className={clsx(
        "rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...attributes}
      {...listeners}
      // Without a label, the card's name is every label inside it joined up.
      aria-label={card.title}
      data-testid={card.id}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing === "title" ? (
            <input
              autoFocus
              defaultValue={card.title}
              maxLength={200}
              aria-label="Card title"
              onPointerDown={stopDrag}
              onBlur={(event) => finishEdit("title", event.currentTarget.value)}
              onKeyDown={(event) => handleEditKeys(event, card.title)}
              className="w-full rounded-lg border border-[var(--primary-blue)] px-2 py-1 font-display text-base font-semibold text-[var(--navy-dark)] outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing("title")}
              aria-label={`Edit ${card.title}`}
              className="w-full cursor-text text-left font-display text-base font-semibold text-[var(--navy-dark)]"
            >
              {card.title}
            </button>
          )}
          {editing === "details" ? (
            <textarea
              autoFocus
              defaultValue={card.details}
              maxLength={2000}
              rows={3}
              aria-label="Card details"
              onPointerDown={stopDrag}
              onBlur={(event) => finishEdit("details", event.currentTarget.value)}
              onKeyDown={(event) => handleEditKeys(event, card.details)}
              className="mt-2 w-full resize-none rounded-lg border border-[var(--primary-blue)] px-2 py-1 text-sm leading-6 text-[var(--gray-text)] outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing("details")}
              aria-label={`Edit details of ${card.title}`}
              className="mt-2 w-full cursor-text whitespace-pre-line text-left text-sm leading-6 text-[var(--gray-text)]"
            >
              {card.details || "No details yet."}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDelete(card.id)}
          className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
          aria-label={`Delete ${card.title}`}
        >
          Remove
        </button>
      </div>
    </article>
  );
};
