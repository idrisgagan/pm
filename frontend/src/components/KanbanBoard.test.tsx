import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { ApiBoard } from "@/lib/api";

const serverBoard = (backlog = "Backlog"): ApiBoard => ({
  version: 0,
  columns: [
    { id: 1, title: backlog, cards: [{ id: 7, title: "First card", details: "Notes" }] },
    { id: 2, title: "Done", cards: [] },
  ],
});

type Reply = { status?: number; body?: unknown };

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

  it("edits a card title and saves on Enter", async () => {
    const renamed = serverBoard();
    renamed.columns[0].cards[0].title = "Better title";
    const fetchMock = mockApi({ "PATCH /api/cards/7": { body: renamed } });
    const column = await renderBoard();

    await userEvent.click(within(column).getByRole("button", { name: "Edit First card" }));
    const input = within(column).getByLabelText("Card title");
    await userEvent.clear(input);
    await userEvent.type(input, "Better title{Enter}");

    expect(sentRequests(fetchMock, "PATCH")).toEqual([["/api/cards/7", { title: "Better title" }]]);
    expect(within(column).getByTestId("card-7")).toHaveTextContent("Better title");
  });

  it("edits details over several lines and saves on blur", async () => {
    const fetchMock = mockApi();
    const column = await renderBoard();

    await userEvent.click(within(column).getByRole("button", { name: "Edit details of First card" }));
    const textarea = within(column).getByLabelText("Card details");
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Line one{Shift>}{Enter}{/Shift}Line two");
    expect(sentRequests(fetchMock, "PATCH")).toEqual([]);
    await userEvent.tab();

    expect(sentRequests(fetchMock, "PATCH")).toEqual([
      ["/api/cards/7", { details: "Line one\nLine two" }],
    ]);
  });

  it.each([
    ["Escape cancels", "Draft{Escape}"],
    ["an empty title is not saved", "{Enter}"],
  ])("%s a card title edit", async (_, keys) => {
    const fetchMock = mockApi();
    const column = await renderBoard();

    await userEvent.click(within(column).getByRole("button", { name: "Edit First card" }));
    await userEvent.clear(within(column).getByLabelText("Card title"));
    await userEvent.keyboard(keys);

    expect(sentRequests(fetchMock, "PATCH")).toEqual([]);
    expect(within(column).getByTestId("card-7")).toHaveTextContent("First card");
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

  it("keeps a failed save's message when an earlier save succeeds", async () => {
    let answerRename: (response: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = `${init?.method ?? "GET"} ${String(input)}`;
      if (request === "PATCH /api/columns/1") {
        return new Promise<Response>((resolve) => (answerRename = resolve));
      }
      if (request === "PATCH /api/cards/7") {
        return new Response(null, { status: 500 });
      }
      return new Response(JSON.stringify(serverBoard()), { status: 200 });
    });
    const column = await renderBoard();

    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Todo");
    await userEvent.tab();

    await userEvent.click(within(column).getByRole("button", { name: "Edit First card" }));
    const title = within(column).getByLabelText("Card title");
    await userEvent.clear(title);
    await userEvent.type(title, "Never{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save your change");
    await act(async () => {
      answerRename(new Response(JSON.stringify({ ...serverBoard("Todo"), version: 1 }), { status: 200 }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save your change");
  });

  it("keeps a failed save's message when a save that started with it succeeds", async () => {
    let answerEdit: (response: Response) => void = () => {};
    let answerRename: (response: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = `${init?.method ?? "GET"} ${String(input)}`;
      if (request === "PATCH /api/cards/7") {
        return new Promise<Response>((resolve) => (answerEdit = resolve));
      }
      if (request === "PATCH /api/columns/1") {
        return new Promise<Response>((resolve) => (answerRename = resolve));
      }
      return new Response(JSON.stringify(serverBoard()), { status: 200 });
    });
    const column = await renderBoard();

    await userEvent.click(within(column).getByRole("button", { name: "Edit First card" }));
    const title = within(column).getByLabelText("Card title");
    await userEvent.clear(title);
    await userEvent.type(title, "Never{Enter}");

    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Todo");
    await userEvent.tab();

    await act(async () => answerEdit(new Response(null, { status: 500 })));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save your change");
    await act(async () => {
      answerRename(
        new Response(JSON.stringify({ ...serverBoard("Todo"), version: 1 }), { status: 200 })
      );
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save your change");
  });

  it("does not write a stale edit field over a newer title from chat", async () => {
    const changed = serverBoard();
    changed.columns[0].cards[0].title = "AI title";
    const fetchMock = mockApi({
      "POST /api/chat": { body: { reply: "Renamed.", applied: [], skipped: [], board: changed } },
    });
    const column = await renderBoard();

    await userEvent.click(within(column).getByRole("button", { name: "Edit First card" }));
    // Send without focusing the box, which would blur the open edit field.
    const box = screen.getByLabelText("Message");
    fireEvent.change(box, { target: { value: "Rename it" } });
    fireEvent.keyDown(box, { key: "Enter" });

    await vi.waitFor(() =>
      expect(within(column).getByLabelText("Card title")).toHaveValue("AI title")
    );
    await userEvent.tab();

    expect(sentRequests(fetchMock, "PATCH")).toEqual([]);
  });

  it("keeps a pending delete when a chat reply brings the old board back", async () => {
    let answerDelete: (response: Response) => void = () => {};
    const oldBoard = serverBoard();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = `${init?.method ?? "GET"} ${String(input)}`;
      if (request === "DELETE /api/cards/7") {
        return new Promise<Response>((resolve) => (answerDelete = resolve));
      }
      if (request === "POST /api/chat") {
        return new Response(
          JSON.stringify({ reply: "Here is the board.", applied: [], skipped: [], board: oldBoard }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify(oldBoard), { status: 200 });
    });
    const column = await renderBoard();

    await userEvent.click(within(column).getByRole("button", { name: "Delete First card" }));
    expect(within(column).queryByTestId("card-7")).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Message"), "Show the board{Enter}");
    expect(await screen.findByText("Here is the board.")).toBeInTheDocument();
    expect(within(column).queryByTestId("card-7")).not.toBeInTheDocument();

    const empty = serverBoard();
    empty.columns[0].cards = [];
    await act(async () => {
      answerDelete(new Response(JSON.stringify(empty), { status: 200 }));
    });
    expect(within(column).queryByTestId("card-7")).not.toBeInTheDocument();
  });

  it("keeps both edits when two saves are in flight", async () => {
    const answers: ((response: Response) => void)[] = [];
    const twoCards = serverBoard();
    twoCards.columns[0].cards.push({ id: 8, title: "Second card", details: "" });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = `${init?.method ?? "GET"} ${String(input)}`;
      if (request.startsWith("PATCH /api/cards/")) {
        return new Promise<Response>((resolve) => answers.push(resolve));
      }
      return new Response(JSON.stringify(twoCards), { status: 200 });
    });
    render(<KanbanBoard onSignOut={vi.fn()} />);
    const column = await screen.findByTestId("column-1");

    // autoFocus would blur the first field when the second opens, so hold
    // focus still while opening both.
    const focus = vi
      .spyOn(HTMLElement.prototype, "focus")
      .mockImplementation(() => undefined);
    const titleButtons = within(column).getAllByTestId("card-title");
    act(() => {
      titleButtons.forEach((button) =>
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      );
    });
    focus.mockRestore();
    const inputs = within(column).getAllByLabelText("Card title");
    expect(inputs).toHaveLength(2);
    fireEvent.change(inputs[0], { target: { value: "First edited" } });
    fireEvent.change(inputs[1], { target: { value: "Second edited" } });

    act(() => {
      inputs[0].dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      inputs[1].dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });

    expect(within(column).getByRole("button", { name: "Edit First edited" })).toBeInTheDocument();
    expect(within(column).getByRole("button", { name: "Edit Second edited" })).toBeInTheDocument();
    expect(answers).toHaveLength(2);
    await act(async () => {
      answers.forEach((answer) => answer(new Response(JSON.stringify(twoCards), { status: 200 })));
    });
  });

  it("does not nest a button or a field inside a button", async () => {
    mockApi();
    const column = await renderBoard();
    await userEvent.click(within(column).getByRole("button", { name: "Edit First card" }));

    for (const button of screen.getAllByRole("button")) {
      expect(button.querySelector("button, input, textarea")).toBeNull();
    }
  });

  it("replaces the board with the one in a chat reply and keeps the draft", async () => {
    const changed = serverBoard();
    changed.columns[1].cards.push({ id: 9, title: "From the AI", details: "" });
    const fetchMock = mockApi({
      "POST /api/chat": { body: { reply: "Added it.", applied: [], skipped: [], board: changed } },
    });
    await renderBoard();
    const box = screen.getByLabelText("Message");

    await userEvent.type(box, "Add a card to Done{Enter}");
    await userEvent.type(box, "Next question");

    expect(await within(screen.getByTestId("column-2")).findByTestId("card-9")).toHaveTextContent(
      "From the AI"
    );
    expect(screen.getByText("Added it.")).toBeInTheDocument();
    expect(box).toHaveValue("Next question");
    expect(screen.queryByText("Loading board...")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([path]) => path === "/api/board")).toHaveLength(1);
  });

  it("keeps a newer reply when an older one arrives after it", async () => {
    const board = (version: number, backlog: string, title: string): ApiBoard => ({
      version,
      columns: [{ id: 1, title: backlog, cards: [{ id: 7, title, details: "" }] }],
    });
    let answerRename: (response: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = `${init?.method ?? "GET"} ${String(input)}`;
      if (request === "PATCH /api/columns/1") {
        return new Promise<Response>((resolve) => (answerRename = resolve));
      }
      if (request === "PATCH /api/cards/7") {
        // The server applied the rename first, then this edit.
        return new Response(JSON.stringify(board(2, "Todo", "Second")));
      }
      return new Response(JSON.stringify(board(0, "Backlog", "First")));
    });
    const column = await renderBoard();

    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Todo");
    await userEvent.tab();
    await userEvent.click(within(column).getByRole("button", { name: "Edit First" }));
    const title = within(column).getByLabelText("Card title");
    await userEvent.clear(title);
    await userEvent.type(title, "Second{Enter}");
    expect(await within(column).findByRole("button", { name: "Edit Second" })).toBeInTheDocument();

    // The rename's reply, the board from before the edit, arrives last.
    await act(async () => answerRename(new Response(JSON.stringify(board(1, "Todo", "First")))));

    expect(within(column).getByRole("button", { name: "Edit Second" })).toBeInTheDocument();
    expect(within(column).getByLabelText("Column title")).toHaveValue("Todo");
  });

  it("signs out when the session has ended", async () => {
    mockApi({ "DELETE /api/cards/7": { status: 401 } });
    const onSignOut = vi.fn();
    const column = await renderBoard(onSignOut);

    await userEvent.click(within(column).getByRole("button", { name: "Delete First card" }));

    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
