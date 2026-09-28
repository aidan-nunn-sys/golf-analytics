import type { Token } from "./types";

const BASE = "/api";
const TOKEN_KEY = "golf.token";

let unauthorizedHandler: () => void = () => {};
export function onUnauthorized(fn: () => void): () => void {
  unauthorizedHandler = fn;
  return () => { if (unauthorizedHandler === fn) unauthorizedHandler = () => {}; };
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) unauthorizedHandler();
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : Array.isArray(body.detail)
        ? body.detail.map((item: { loc?: (string | number)[]; msg?: string }) => `${item.loc?.slice(1).join(" · ") || "Request"}: ${item.msg || "Invalid value"}`).join(". ")
        : "The request could not be completed.";
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders(), ...(signal ? { signal } : {}) });
  return handle<T>(res);
}

export async function apiSend<T>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    ...(signal ? { signal } : {}),
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle<T>(res);
}

export async function apiLogin(username: string, password: string): Promise<Token> {
  const form = new URLSearchParams({ username, password });
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  return handle<Token>(res);
}
