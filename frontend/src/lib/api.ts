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
