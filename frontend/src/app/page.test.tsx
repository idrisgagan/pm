import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";

// Answers each API path with a status, like the backend would.
const mockApi = (routes: Record<string, number>) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const status = routes[String(input)] ?? 404;
    const body = status === 200 ? JSON.stringify({ username: "user" }) : null;
    return new Response(body, { status });
  });

describe("Home", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the login form when signed out", async () => {
    mockApi({ "/api/me": 401 });
    render(<Home />);

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Kanban Studio")).not.toBeInTheDocument();
  });

  it("shows the board when already signed in", async () => {
    mockApi({ "/api/me": 200 });
    render(<Home />);

    expect(await screen.findByText("Kanban Studio")).toBeInTheDocument();
  });

  it("shows the board after signing in", async () => {
    mockApi({ "/api/me": 401, "/api/login": 200 });
    render(<Home />);

    await userEvent.type(await screen.findByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Kanban Studio")).toBeInTheDocument();
  });

  it("returns to the login form after signing out", async () => {
    const fetchMock = mockApi({ "/api/me": 200, "/api/logout": 204 });
    render(<Home />);

    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/logout", expect.objectContaining({ method: "POST" }));
  });

  it("still signs out on screen if the logout request fails", async () => {
    mockApi({ "/api/me": 200, "/api/logout": 500 });
    render(<Home />);

    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});
