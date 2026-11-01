import { vi } from 'vitest';

// Відповідь, схожа на справжню відповідь open.er-api.com
export function ratesBody(base: string, rates: Record<string, number>, nextUpdateUnix = 2_000_000_000) {
  return {
    result: 'success',
    base_code: base,
    time_last_update_unix: 1_700_000_000,
    time_next_update_unix: nextUpdateUnix,
    rates,
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Підробка fetch: відповідь залежить від базової валюти в URL, без мережі
export function fakeFetch(bases: Record<string, ReturnType<typeof ratesBody>>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const base = String(input).split('/').pop()!;
    const body = bases[base];
    return body ? jsonResponse(body) : jsonResponse({ result: 'error', 'error-type': 'unsupported-code' }, 404);
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}
