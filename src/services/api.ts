/**
 * Thin client for the Campus Hub API (see server/).
 *
 * Every consumer treats the API as an upgrade over the bundled static data:
 * when VITE_API_URL is unset or the server is unreachable, callers fall back
 * to the constants in src/data, so the app keeps working offline and on
 * static-only hosting.
 */

const REQUEST_TIMEOUT_MS = 6000;

export class ApiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiUnavailableError';
  }
}

/** An error the server returned deliberately, with its status and message. */
export class ApiError extends Error {
  readonly status: number;
  readonly payload: Record<string, unknown>;

  constructor(status: number, message: string, payload: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

/**
 * Reads the session token without importing the auth store, which would create
 * a cycle (the store imports this module). Kept in sync by the store's own
 * persistence, so localStorage is the single source of truth.
 */
function readStoredToken(): string | null {
  try {
    const raw = localStorage.getItem('campus-auth');
    if (!raw) return null;
    return (JSON.parse(raw)?.state?.token as string | undefined) ?? null;
  } catch {
    return null;
  }
}

function storeToken(token: string): void {
  try {
    const raw = localStorage.getItem('campus-auth');
    const parsed = raw ? JSON.parse(raw) : { state: {}, version: 0 };
    parsed.state = { ...parsed.state, token };
    localStorage.setItem('campus-auth', JSON.stringify(parsed));
  } catch {
    // A full or unavailable localStorage only costs us the sliding renewal.
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Longer than the read timeout: writes are rarer and worth waiting for. */
  timeoutMs?: number;
}

/**
 * Authenticated request. Attaches the stored session token, and picks up a
 * renewed one from `X-Session-Token` so an active user never gets signed out
 * mid-session.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const apiUrl = getApiUrl();
  if (!apiUrl) {
    throw new ApiUnavailableError('VITE_API_URL is not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);

  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = readStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  try {
    const response = await fetch(`${apiUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });

    const renewed = response.headers.get('X-Session-Token');
    if (renewed) storeToken(renewed);

    if (response.status === 204) return undefined as T;

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new ApiError(
        response.status,
        typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status})`,
        payload,
      );
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiUnavailableError(
      `${options.method ?? 'GET'} ${path} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

// Read lazily so tests can override the env before the first call.
export function getApiUrl(): string | undefined {
  const url = import.meta.env.VITE_API_URL as string | undefined;
  return url && url.length > 0 ? url.replace(/\/$/, '') : undefined;
}

export function isApiConfigured(): boolean {
  return getApiUrl() !== undefined;
}

export async function fetchJson<T>(path: string): Promise<T> {
  const apiUrl = getApiUrl();
  if (!apiUrl) {
    throw new ApiUnavailableError('VITE_API_URL is not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${apiUrl}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new ApiUnavailableError(`GET ${path} responded ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiUnavailableError) throw error;
    throw new ApiUnavailableError(
      `GET ${path} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
