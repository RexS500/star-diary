import { env } from "cloudflare:workers";
import { normalizeAccountEmail, requireAuthenticatedUser } from "./family-access";
import { recordUserActivity } from "./operations-telemetry";

export type AdminIdentity = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

export class AdminAccessError extends Error {
  constructor(message: string, public status: 401 | 403 = 403) {
    super(message);
  }
}

export function configuredAdminEmails(value = env.ADMIN_EMAILS) {
  return new Set(
    String(value || "")
      .split(/[\s,;]+/)
      .map(normalizeAccountEmail)
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string, configured = configuredAdminEmails()) {
  return configured.has(normalizeAccountEmail(email));
}

export async function requireAdmin(): Promise<AdminIdentity> {
  const user = await requireAuthenticatedUser();
  if (!isAdminEmail(user.email)) {
    throw new AdminAccessError("此 Google 帳號沒有管理後台權限。", 403);
  }
  const row = await env.DB.prepare(
    "SELECT status FROM users WHERE id = ?",
  ).bind(user.id).first<{ status: string | null }>();
  if (row?.status === "disabled") {
    throw new AdminAccessError("此管理員帳號已停用。", 403);
  }
  await recordUserActivity(user.id);
  return user;
}

export function adminErrorResponse(error: unknown) {
  const status = error instanceof AdminAccessError ? error.status : 500;
  const message = error instanceof AdminAccessError
    ? error.message
    : "管理後台暫時無法處理要求。";
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}
