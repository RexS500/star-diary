export const AUTH_INTENTS = ["create_family", "sign_in", "accept_invite"] as const;

export type AuthIntent = (typeof AUTH_INTENTS)[number];

export function parseAuthIntent(value: unknown): AuthIntent {
  return AUTH_INTENTS.includes(value as AuthIntent) ? value as AuthIntent : "sign_in";
}

// Auth.js stores callbackUrl with its signed OAuth state. Keeping every value
// on a fixed, same-origin path prevents auth intent from becoming a redirect.
export function authCallbackPath(intent: Exclude<AuthIntent, "accept_invite">) {
  return `/?auth_intent=${intent}`;
}

export function inviteCallbackPath(token: string) {
  return `/join/${encodeURIComponent(token)}`;
}
