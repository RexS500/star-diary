const CSRF_COOKIE = "star_diary_csrf";
const CSRF_HEADER = "x-star-diary-csrf";
const CSRF_MAX_AGE_SECONDS = 30 * 60;

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function createCsrfToken() {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export function csrfResponseCookie(token: string, requestUrl: string) {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${CSRF_COOKIE}=${token}; Path=/; Max-Age=${CSRF_MAX_AGE_SECONDS}; HttpOnly; SameSite=Strict${secure}`;
}

export function clearCsrfResponseCookie(requestUrl: string) {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${CSRF_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure}`;
}

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie") || "";
  for (const item of cookies.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === name) return item.slice(separator + 1).trim();
  }
  return "";
}

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function sameToken(left: string, right: string) {
  if (!left || !right) return false;
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function validSameOriginCsrfRequest(request: Request) {
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin && origin !== expectedOrigin) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin && fetchSite && fetchSite !== "same-origin") return false;
  return sameToken(request.headers.get(CSRF_HEADER) || "", cookieValue(request, CSRF_COOKIE));
}
