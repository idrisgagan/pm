import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSidebar } from "@/components/ChatSidebar";
import type { ApiBoard, ChatAction, ChatReply } from "@/lib/api";

const board: ApiBoard = { columns: [{ id: 1, title: "Backlog", cards: [] }] };

const action = (fields: Partial<ChatAction>): ChatAction => ({
  type: "delete",
  card_id: null,
  column_id: null,
  title: null,
  details: null,
  position: null,
  ...fields,
});

const reply = (text: string, skipped: ChatReply["skipped"] = []): ChatReply => ({
  reply: text,
  applied: [],
  skipped,
  board,
});

// Each call to /api/chat gets the next response in the list.
const mockChat = (...responses: (ChatReply | number | Error)[]) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    const next = responses.shift();
    if (next instanceof Error) {
      throw next;
    }
    return typeof next === "number"
      ? new Response(null, { status: next })
      : new Response(JSON.stringify(next), { status: 200 });
  });

const sentBodies = (fetchMock: ReturnType<typeof mockChat>) =>
  fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));

const renderSidebar = () => {
  const onBoard = vi.fn();
  const onSignOut = vi.fn();
  render(<ChatSidebar onBoard={onBoard} onSignOut={onSignOut} />);
  return { onBoard, onSignOut, box: screen.getByLabelText("Message") };
};

const log = () => within(screen.getByRole("log"));

describe("ChatSidebar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the message on Enter and shows the reply", async () => {
    const fetchMock = mockChat(reply("Added it."));
    const { box, onBoard } = renderSidebar();

    await userEvent.type(box, "Add a card{Enter}");

    expect(await log().findByText("Added it.")).toBeInTheDocument();
    expect(log().getByText("Add a card")).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/chat");
    expect(sentBodies(fetchMock)).toEqual([{ message: "Add a card", history: [] }]);
    expect(onBoard).toHaveBeenCalledWith(board);
    expect(box).toHaveValue("");
  });

  it("sends the conversation so far as history", async () => {
    const fetchMock = mockChat(reply("First answer."), reply("Second answer."));
    const { box } = renderSidebar();

    await userEvent.type(box, "First{Enter}");
    await log().findByText("First answer.");
    await userEvent.type(box, "Second{Enter}");
    await log().findByText("Second answer.");

    expect(sentBodies(fetchMock)[1]).toEqual({
      message: "Second",
      history: [
        { role: "user", content: "First" },
        { role: "assistant", content: "First answer." },
      ],
    });
  });

  it("sends only the last 20 messages, each cut to 4,000 characters", async () => {
    const long = "x".repeat(4500);
    const fetchMock = mockChat(...Array.from({ length: 12 }, () => reply(long)));
    const { box } = renderSidebar();

    for (let i = 1; i <= 12; i++) {
      await userEvent.type(box, `Message ${i}{Enter}`);
      await vi.waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    }

    // Before the 12th send there are 22 messages, so the first two are left out.
    const { history } = sentBodies(fetchMock)[11];
    expect(history).toHaveLength(20);
    expect(history[0]).toEqual({ role: "user", content: "Message 2" });
    expect(history[19].content).toHaveLength(4000);
  });

  it("adds a new line on Shift+Enter instead of sending", async () => {
    const fetchMock = mockChat(reply("Done."));
    const { box } = renderSidebar();

    await userEvent.type(box, "Line one{Shift>}{Enter}{/Shift}Line two");

    expect(box).toHaveValue("Line one\nLine two");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not send an empty message", async () => {
    const fetchMock = mockChat();
    const { box } = renderSidebar();

    await userEvent.type(box, "   {Enter}");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("disables sending while a reply is pending", async () => {
    let answer: (response: Response) => void = () => {};
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const { box } = renderSidebar();

    await userEvent.type(box, "First{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("Thinking...");
    await userEvent.type(box, "Second{Enter}");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(box).toHaveValue("Second");

    answer(new Response(JSON.stringify(reply("Done.")), { status: 200 }));
    expect(await log().findByText("Done.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
  });

  it.each([
    [502, "The AI could not answer. Try again."],
    [500, "The AI could not answer. Try again."],
    [503, "AI is not configured."],
    [new TypeError("Failed to fetch"), "Could not reach the server."],
  ])("shows an error for %s and puts the message back", async (failure, text) => {
    mockChat(failure);
    const { box, onBoard } = renderSidebar();

    await userEvent.type(box, "Add a card{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(box).toHaveValue("Add a card");
    expect(log().queryByText("Add a card")).not.toBeInTheDocument();
    expect(onBoard).not.toHaveBeenCalled();
  });

  it("keeps text typed while waiting when the reply fails", async () => {
    let answer: (response: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const { box } = renderSidebar();

    await userEvent.type(box, "Add a card{Enter}");
    await userEvent.type(box, "And another");
    answer(new Response(null, { status: 502 }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(box).toHaveValue("Add a card\nAnd another");
  });

  it("retries a failed message and leaves it out of the history", async () => {
    const fetchMock = mockChat(502, reply("Added it."));
    const { box } = renderSidebar();

    await userEvent.type(box, "Add a card{Enter}");
    await screen.findByRole("alert");
    await userEvent.type(box, "{Enter}");

    expect(await log().findByText("Added it.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(sentBodies(fetchMock)).toEqual([
      { message: "Add a card", history: [] },
      { message: "Add a card", history: [] },
    ]);
  });

  it("signs out when the session has ended", async () => {
    mockChat(401);
    const { box, onSignOut } = renderSidebar();

    await userEvent.type(box, "Hello{Enter}");

    await vi.waitFor(() => expect(onSignOut).toHaveBeenCalledOnce());
  });

  it("notes skipped changes under the reply, leaving out empty ones", async () => {
    mockChat(
      reply("Done.", [
        { action: action({ card_id: 99 }), reason: "Card not found" },
        { action: action({ type: "update" }), reason: "Card not found" },
        { action: action({ type: "create", column_id: 1, title: "" }), reason: "title: too short" },
      ])
    );
    const { box } = renderSidebar();

    await userEvent.type(box, "Tidy up{Enter}");

    expect(
      await log().findByText("2 changes could not be made: Card not found; title: too short.")
    ).toBeInTheDocument();
  });

  it("words the note for one skipped change", async () => {
    mockChat(reply("Done.", [{ action: action({ card_id: 99 }), reason: "Card not found" }]));
    const { box } = renderSidebar();

    await userEvent.type(box, "Delete it{Enter}");

    expect(await log().findByText("1 change could not be made: Card not found.")).toBeInTheDocument();
  });

  it("shows no note when the only skipped change is empty", async () => {
    mockChat(reply("Done.", [{ action: action({}), reason: "Card not found" }]));
    const { box } = renderSidebar();

    await userEvent.type(box, "Hello{Enter}");

    await log().findByText("Done.");
    expect(log().queryByText(/could not be made/)).not.toBeInTheDocument();
  });

  it("colors each label by role", async () => {
    mockChat(reply("Hi there."));
    const { box } = renderSidebar();

    await userEvent.type(box, "Hello{Enter}");
    await log().findByText("Hi there.");

    expect(log().getByText("You")).toHaveClass("text-[var(--accent-yellow)]");
    expect(log().getByText("AI")).toHaveClass("text-[var(--secondary-purple)]");
  });
});
