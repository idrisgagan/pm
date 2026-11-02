import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/components/LoginForm";

const respond = (status: number, body?: unknown) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), { status })
  );

const fillAndSubmit = async (username: string, password: string) => {
  await userEvent.type(screen.getByLabelText("Username"), username);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
};

describe("LoginForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("signs in with valid credentials", async () => {
    const fetchMock = respond(200, { username: "user" });
    const onSignedIn = vi.fn();
    render(<LoginForm onSignedIn={onSignedIn} />);

    await fillAndSubmit("user", "password");

    expect(onSignedIn).toHaveBeenCalledWith({ username: "user" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ username: "user", password: "password" }),
      })
    );
  });

  it("shows an error for wrong credentials", async () => {
    respond(401, { detail: "Invalid username or password" });
    const onSignedIn = vi.fn();
    render(<LoginForm onSignedIn={onSignedIn} />);

    await fillAndSubmit("user", "wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid username or password."
    );
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("shows a different error when the server cannot be reached", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    render(<LoginForm onSignedIn={vi.fn()} />);

    await fillAndSubmit("user", "password");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach the server. Try again."
    );
  });

  it("requires both fields", async () => {
    const fetchMock = respond(200, { username: "user" });
    render(<LoginForm onSignedIn={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
