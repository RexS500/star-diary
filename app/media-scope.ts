export type MediaKind = "avatars" | "rewards";

export function buildFamilyMediaKey(
  familyId: string,
  kind: MediaKind,
  id = crypto.randomUUID(),
) {
  return `families/${familyId}/${kind}/${id}.webp`;
}

export function mediaKeyBelongsToFamily(key: string, familyId: string) {
  return key.startsWith(`families/${familyId}/`);
}

export function isFamilyScopedMediaKey(key: string) {
  return key.startsWith("families/");
}

export function mediaKeyFromUrl(value: string) {
  try {
    const parsed = new URL(value, "https://star-diary.local");
    return parsed.pathname === "/api/media" ? parsed.searchParams.get("key") : null;
  } catch {
    return null;
  }
}

export function stateReferencesMediaKey(value: unknown, key: string): boolean {
  if (typeof value === "string") return mediaKeyFromUrl(value) === key;
  if (Array.isArray(value)) return value.some(item => stateReferencesMediaKey(item, key));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(item => stateReferencesMediaKey(item, key));
  }
  return false;
}

export function mediaKeysInState(value: unknown, keys = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    const key = mediaKeyFromUrl(value);
    if (key) keys.add(key);
    return keys;
  }
  if (Array.isArray(value)) {
    for (const item of value) mediaKeysInState(item, keys);
    return keys;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) mediaKeysInState(item, keys);
  }
  return keys;
}
