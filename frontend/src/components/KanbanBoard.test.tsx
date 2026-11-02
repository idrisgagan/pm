import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { ApiBoard } from "@/lib/api";

const serverBoard = (backlog = "Backlog"): ApiBoard => ({
  columns: [
    { id: 1, title: backlog, cards: [{ id: 7, title: "First card", details: "Notes" }] },
    { id: 2, title: "Done", cards: [] },
  ],
});

type Reply = { status?: number; body?: ApiBoard };

// GET /api/board answers with the board. Other requests answer with the reply
// for "METHOD path", or the unchanged board.
const mockApi = (replies: Record<string, Reply> = {}) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const reply = replies[`${init?.method ?? "GET"} ${String(input)}`] ?? {};
    const status = reply.status ?? 200;
    const body = status < 300 ? JSON.stringify(reply.body ?? serverBoard()) : null;
    return new Response(body, { status });
  });

const sentRequests = (fetchMock: ReturnType<typeof mockApi>, method: string) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === method)
    .map(([path, init]) => [path, JSON.parse(String(init?.body ?? "null"))]);

const renderBoard = async (onSignOut = vi.fn()) => {
  render(<KanbanBoard onSignOut={onSignOut} />);
  return screen.findByTestId("column-1");
};

describe("KanbanBoard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the board from the server", async () => {
    mockApi();
    const column = await renderBoard();

    expect(screen.getAllByLabelText("Column title")).toHaveLength(2);
    expect(within(column).getByTestId("card-7")).toHaveTextContent("First card");
  });

  it("saves a column rename once, on blur", async () => {
    const fetchMock = mockApi({ "PATCH /api/columns/1": { body: serverBoard("Todo") } });
    const input = within(await renderBoard()).getByLabelText("Column title");

    await userEvent.clear(input);
    await userEvent.type(input, "Todo");
    expect(sentRequests(fetchMock, "PATCH")).toEqual([]);
    await userEvent.tab();

    expect(sentRequests(fetchMock, "PATCH")).toEqual([["/api/columns/1", { title: "Todo" }]]);
    expect(input).toHaveValue("Todo");
  });

  it("does not save an empty column title", async () => {
    const fetchMock = mockApi();
    const input = within(await renderBoard()).getByLabelText("Column title");

    await userEvent.clear(input);
    await userEvent.tab();

    expect(sentRequests(fetchMock, "PATCH")).toEqual([]);
    expect(input).toHaveValue("Backlog");
  });

  it("adds a card once the server replies", async () => {
    const withCard = serverBoard();
    withCard.columns[0].cards.push({ id: 8, title: "New card", details: "More" });
    const fetchMock = mockApi({ "POST /api/cards": { body: withCard } });
    const column = await renderBoard();

    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "New card");
    await userEvent.type(within(column).getByPlaceholderText(/details/i), "More");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(await within(column).findByTestId("card-8")).toHaveTextContent("New card");
    expect(sentRequests(fetchMock, "POST")).toEqual([
      ["/api/cards", { column_id: 1, title: "New card", details: "More" }],
    ]);
  });

  it("removes a card", async () => {
    const empty = serverBoard();
    empty.columns[0].cards = [];
    const fetchMock = mockApi({ "DELETE /api/cards/7": { body: empty } });
    const column = await renderBoard();

    await userEvent.click(within(column).getByRole("button", { name: "Delete First card" }));

    expect(within(column).queryByTestId("card-7")).not.toBeInTheDocument();
    expect(sentRequests(fetchMock, "DELETE")).toEqual([["/api/cards/7", null]]);
  });

  it("reloads the board and shows a message when a save fails", async () => {
    const fetchMock = mockApi({ "DELETE /api/cards/7": { status: 500 } });
    const column = await renderBoard();

    await userEvent.click(within(column).getByRole("button", { name: "Delete First card" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save your change");
    expect(await within(column).findByTestId("card-7")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([path]) => path === "/api/board")).toHaveLength(2);
  });

  it("signs out when the session has ended", async () => {
    mockApi({ "DELETE /api/cards/7": { status: 401 } });
    const onSignOut = vi.fn();
    const column = await renderBoard(onSignOut);

    await userEvent.click(within(column).getByRole("button", { name: "Delete First card" }));

    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
