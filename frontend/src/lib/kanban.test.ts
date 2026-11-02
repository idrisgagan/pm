import { fromApi, moveCard, toApiId, type Column } from "@/lib/kanban";

describe("fromApi", () => {
  it("tags ids and keeps card order", () => {
    const board = fromApi({
      columns: [
        {
          id: 3,
          title: "A",
          cards: [
            { id: 3, title: "Second", details: "" },
            { id: 1, title: "First", details: "x" },
          ],
        },
      ],
    });

    expect(board.columns).toEqual([{ id: "column-3", title: "A", cardIds: ["card-3", "card-1"] }]);
    expect(board.cards["card-1"]).toEqual({ id: "card-1", title: "First", details: "x" });
  });

  it("reads the number back from a tagged id", () => {
    expect(toApiId("card-12")).toBe(12);
    expect(toApiId("column-3")).toBe(3);
  });
});

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });
});
