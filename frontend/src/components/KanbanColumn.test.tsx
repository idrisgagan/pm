import { DndContext } from "@dnd-kit/core";
import { render, screen } from "@testing-library/react";
import { KanbanColumn } from "@/components/KanbanColumn";

const renderColumn = (preview = false) => {
  render(
    <DndContext>
      <KanbanColumn
        column={{ id: "column-1", title: "Backlog", cardIds: [] }}
        cards={[]}
        onRename={vi.fn()}
        onAddCard={vi.fn()}
        onDeleteCard={vi.fn()}
        onEditCard={vi.fn()}
        preview={preview}
      />
    </DndContext>
  );
  return screen.getByRole("region", { name: "Backlog" });
};

describe("KanbanColumn", () => {
  it("is exposed as a named region", () => {
    expect(renderColumn()).toBeInTheDocument();
  });

  it("marks the column while a card is dragged over it", () => {
    expect(renderColumn(true)).toHaveAttribute("data-preview", "true");
  });
});
