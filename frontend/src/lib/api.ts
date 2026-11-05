export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!response.ok) {
    throw new ApiError(response.status, `${init.method ?? "GET"} ${path} failed`);
  }
  return response.status === 204 ? (undefined as T) : response.json();
};

export type User = { username: string };

export const getMe = () => request<User>("/api/me");

export const login = (username: string, password: string) =>
  request<User>("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const logout = () => request<void>("/api/logout", { method: "POST" });

export type ApiCard = { id: number; title: string; details: string };
export type ApiColumn = { id: number; title: string; cards: ApiCard[] };
export type ApiBoard = { columns: ApiColumn[] };

// Fields to change on a card. The backend leaves out the ones not sent.
export type CardChanges = {
  title?: string;
  details?: string;
  column_id?: number;
  position?: number;
};

export const getBoard = () => request<ApiBoard>("/api/board");

export const renameColumn = (columnId: number, title: string) =>
  request<ApiBoard>(`/api/columns/${columnId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });

export const createCard = (columnId: number, title: string, details: string) =>
  request<ApiBoard>("/api/cards", {
    method: "POST",
    body: JSON.stringify({ column_id: columnId, title, details }),
  });

export const updateCard = (cardId: number, changes: CardChanges) =>
  request<ApiBoard>(`/api/cards/${cardId}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });

export const deleteCard = (cardId: number) =>
  request<ApiBoard>(`/api/cards/${cardId}`, { method: "DELETE" });

export type ChatMessage = { role: "user" | "assistant"; content: string };

// A card change the AI asked for. Fields an action does not use are null.
export type ChatAction = {
  type: "create" | "update" | "move" | "delete";
  card_id: number | null;
  column_id: number | null;
  title: string | null;
  details: string | null;
  position: number | null;
};

export type ChatReply = {
  reply: string;
  applied: ChatAction[];
  skipped: { action: ChatAction; reason: string }[];
  board: ApiBoard;
};

export const chat = (message: string, history: ChatMessage[]) =>
  request<ChatReply>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message, history }),
  });
