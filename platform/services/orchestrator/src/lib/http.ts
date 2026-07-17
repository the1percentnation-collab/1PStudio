/** Tiny JSON-over-HTTP helper for calls into the ml/render services. */
export async function postJson<T>(baseUrl: string, path: string, body: unknown, timeoutMs = 10 * 60_000): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as T;
}

export const ML_URL = process.env.ML_URL ?? "http://localhost:8000";
export const RENDER_URL = process.env.RENDER_URL ?? "http://localhost:8080";
