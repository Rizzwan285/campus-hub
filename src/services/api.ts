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
