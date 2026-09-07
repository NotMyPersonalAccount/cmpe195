const KEY = "confusion.clientId";

/**
 * Stable per-browser id. Persisting it means a refresh re-uses the same slot in
 * the room average instead of counting as a second person.
 */
export function getClientId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // Private mode or blocked storage: fall back to a per-tab id.
    return crypto.randomUUID().replace(/-/g, "").slice(0, 32);
  }
}
