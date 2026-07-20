export type MediaKind = "avatars" | "rewards";

export function safeMediaFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "").slice(-100) || "image";
}

export function buildFamilyMediaKey(
  familyId: string,
  kind: MediaKind,
  filename: string,
  id = crypto.randomUUID(),
) {
  return `families/${familyId}/${kind}/${id}-${safeMediaFilename(filename)}`;
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
