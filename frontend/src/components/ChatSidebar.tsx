import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import clsx from "clsx";
import { ApiError, chat, type ApiBoard, type ChatAction, type ChatReply } from "@/lib/api";

// The backend accepts at most 20 history messages of up to 4,000 characters.
const HISTORY_LIMIT = 20;
const HISTORY_CONTENT_LIMIT = 4000;

type Entry = { role: "user" | "assistant"; content: string; note?: string };

// An action with every field null tells the user nothing, so it is not shown.
const isEmpty = (action: ChatAction) =>
  Object.entries(action).every(([key, value]) => key === "type" || value === null);

const skippedNote = (skipped: ChatReply["skipped"]) => {
  const reasons = skipped.filter(({ action }) => !isEmpty(action)).map(({ reason }) => reason);
  if (reasons.length === 0) {
    return undefined;
  }
  const changes = reasons.length === 1 ? "1 change" : `${reasons.length} changes`;
  return `${changes} could not be made: ${reasons.join("; ")}.`;
};

const errorText = (error: unknown) => {
  if (!(error instanceof ApiError)) {
    return "Could not reach the server.";
  }
  return error.status === 503 ? "AI is not configured." : "The AI could not answer. Try again.";
};

type ChatSidebarProps = {
  onBoard: (board: ApiBoard) => void;
  // Called when the session has ended, so the login form shows.
  onSignOut: () => void;
};

export const ChatSidebar = ({ onBoard, onSignOut }: ChatSidebarProps) => {
  const [messages, setMessages] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, pending]);

  const send = async () => {
    const message = draft.trim();
    if (!message || pending) {
      return;
    }
    const history = messages
      .slice(-HISTORY_LIMIT)
      .map(({ role, content }) => ({ role, content: content.slice(0, HISTORY_CONTENT_LIMIT) }));
    const sent = [...messages, { role: "user" as const, content: message }];
    setMessages(sent);
    setDraft("");
    setError(null);
    setPending(true);
    try {
      const reply = await chat(message, history);
      onBoard(reply.board);
      setMessages([...sent, { role: "assistant", content: reply.reply, note: skippedNote(reply.skipped) }]);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSignOut();
        return;
      }
      // Take the message back out and return it to the box, so Enter retries
      // it. Anything typed while waiting is kept after it.
      setMessages(messages);
      setDraft((typed) => (typed ? `${message}\n${typed}` : message));
      setError(errorText(error));
    } finally {
      setPending(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <aside
      aria-label="AI chat"
      className="flex min-h-[420px] flex-col rounded-3xl border border-[var(--stroke)] bg-white/80 p-5 shadow-[var(--shadow)] backdrop-blur 2xl:sticky 2xl:top-6 2xl:h-[calc(100vh-3rem)]"
    >
      <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
      <h2 className="mt-3 font-display text-xl font-semibold text-[var(--navy-dark)]">AI assistant</h2>
      <p className="mt-1 text-sm text-[var(--gray-text)]">
        Ask it to add, edit, move or delete cards.
      </p>

      <div ref={listRef} role="log" className="mt-4 flex-1 space-y-3 overflow-y-auto">
        {messages.map((entry, index) => (
          <div
            key={index}
            className={clsx(
              "rounded-2xl px-4 py-3 text-sm",
              entry.role === "user"
                ? "ml-6 bg-[var(--navy-dark)] text-white"
                : "mr-6 border border-[var(--stroke)] bg-[var(--surface)] text-[var(--navy-dark)]"
            )}
          >
            {/* Label color by role, so it reads on both bubble colors. */}
            <p
              className={clsx(
                "text-[10px] font-semibold uppercase tracking-[0.2em]",
                entry.role === "user" ? "text-[var(--accent-yellow)]" : "text-[var(--secondary-purple)]"
              )}
            >
              {entry.role === "user" ? "You" : "AI"}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{entry.content}</p>
            {entry.note ? <p className="mt-2 text-xs text-[var(--gray-text)]">{entry.note}</p> : null}
          </div>
        ))}
        {pending ? (
          <p role="status" className="mr-6 text-sm text-[var(--gray-text)]">
            Thinking...
          </p>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-2xl border border-[var(--accent-yellow)] px-4 py-2 text-sm font-semibold text-[var(--navy-dark)]"
        >
          {error}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2">
        <textarea
          aria-label="Message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the AI to change the board"
          maxLength={2000}
          rows={3}
          className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="self-end rounded-full bg-[var(--secondary-purple)] px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </aside>
  );
};
