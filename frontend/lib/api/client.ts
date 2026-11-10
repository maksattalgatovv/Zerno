/** Centralised HTTP client. All backend calls go through `api`. */

const TOKEN_KEY = "zerno.token";

let language = "en";

export function setApiLanguage(value: string) {
  language = value;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage can be blocked. The session then lasts only for this page view.
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly fields?: { field: string; message: string }[],
  ) {
    super(message);
  }
}

type Options = { method?: string; body?: unknown; form?: FormData };

async function send(path: string, { method = "GET", body, form }: Options): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = { "Accept-Language": language };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError("network", 0, "network");
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    if (response.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event("zerno:signed-out"));
    }
    throw new ApiError(data?.detail ?? "error", response.status, data?.code ?? "unknown", data?.fields);
  }
  return response;
}

export async function api<T = void>(path: string, options: Options = {}): Promise<T> {
  const response = await send(path, options);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function downloadFile(path: string, filename: string): Promise<void> {
  const response = await send(path, {});
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
