import { ApiError, getBoard, updateCard } from "@/lib/api";

describe("api", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends changes as JSON", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ columns: [] })));

    await expect(updateCard(3, { column_id: 2, position: 0 })).resolves.toEqual({ columns: [] });
    expect(fetchMock).toHaveBeenCalledWith("/api/cards/3", {
      method: "PATCH",
      body: '{"column_id":2,"position":0}',
      headers: { "Content-Type": "application/json" },
    });
  });

  it.each([401, 404, 500])("throws ApiError with status %i", async (status) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status }));

    await expect(getBoard()).rejects.toEqual(expect.objectContaining({ status }));
    await expect(getBoard()).rejects.toBeInstanceOf(ApiError);
  });

  it("passes network errors through", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(getBoard()).rejects.toThrow("Failed to fetch");
  });
});
