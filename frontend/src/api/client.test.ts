import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiGet, ApiError, setToken, onUnauthorized } from "./client";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe("client", () => {
  beforeEach(() => setToken(null));

  it("prefixes /api and returns parsed JSON", async () => {
    globalThis.fetch = mockFetch(200, { status: "ok" }) as never;
    const data = await apiGet<{ status: string }>("/health");
    expect(data.status).toBe("ok");
    expect((globalThis.fetch as never as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("/api/health");
  });

  it("throws ApiError on non-2xx", async () => {
    globalThis.fetch = mockFetch(404, { detail: "nope" }) as never;
    await expect(apiGet("/clubs/999/stats")).rejects.toBeInstanceOf(ApiError);
  });

  it("fires the unauthorized handler on 401", async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    globalThis.fetch = mockFetch(401, { detail: "bad" }) as never;
    await expect(apiGet("/auth/me")).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledOnce();
  });
});

it("presents validation errors as readable field messages", async () => {
  globalThis.fetch = mockFetch(422, { detail: [{ loc: ["body", "name"], msg: "String should have at least 1 character" }] }) as never;
  await expect(apiGet("/courses")).rejects.toThrow("name: String should have at least 1 character");
});
