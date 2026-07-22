import { env } from "cloudflare:workers";
import { auth } from "../../../auth";
import { createCsrfToken, csrfResponseCookie, validSameOriginCsrfRequest } from "../../csrf";

export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "private, no-store" };
const categories = new Set(["bug", "feature", "remote_support", "partnership", "other"]);

type SupportRequestInput = {
  category?: unknown;
  contactName?: unknown;
  replyEmail?: unknown;
  subject?: unknown;
  message?: unknown;
  privacyAccepted?: unknown;
  website?: unknown;
};

function normalizedText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

async function hashNetworkIdentifier(request: Request) {
  const address = request.headers.get("cf-connecting-ip")?.trim();
  if (!address) return null;
  const data = new TextEncoder().encode(`${env.AUTH_SECRET}:support:${address}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: Request) {
  const csrfToken = createCsrfToken();
  return Response.json(
    { csrfToken },
    { headers: { ...responseHeaders, "Set-Cookie": csrfResponseCookie(csrfToken, request.url) } },
  );
}

export async function POST(request: Request) {
  if (!await validSameOriginCsrfRequest(request)) {
    return Response.json({ error: "安全驗證已失效，請重新整理後再試一次。" }, { status: 403, headers: responseHeaders });
  }

  let input: SupportRequestInput;
  try {
    input = await request.json() as SupportRequestInput;
  } catch {
    return Response.json({ error: "客服表單格式不正確。" }, { status: 422, headers: responseHeaders });
  }

  // Honeypot: acknowledge bots without storing their payload.
  if (normalizedText(input.website, 120)) {
    return Response.json({ success: true, requestId: crypto.randomUUID() }, { status: 201, headers: responseHeaders });
  }

  const category = normalizedText(input.category, 32);
  const contactName = normalizedText(input.contactName, 80);
  const replyEmail = normalizedText(input.replyEmail, 254).toLocaleLowerCase("en-US");
  const subject = normalizedText(input.subject, 120);
  const message = normalizedText(input.message, 3000);

  if (!categories.has(category)) {
    return Response.json({ error: "請選擇客服分類。" }, { status: 422, headers: responseHeaders });
  }
  if (contactName.length < 1 || !validEmail(replyEmail) || subject.length < 3 || message.length < 10) {
    return Response.json({ error: "請完整填寫聯絡名稱、有效 Email、主旨與至少 10 個字的說明。" }, { status: 422, headers: responseHeaders });
  }
  if (input.privacyAccepted !== true) {
    return Response.json({ error: "請確認已閱讀客服資料處理說明。" }, { status: 422, headers: responseHeaders });
  }

  const ipHash = await hashNetworkIdentifier(request);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const rateRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM support_requests
      WHERE created_at >= ? AND (lower(reply_email) = ? OR (? IS NOT NULL AND ip_hash = ?))`,
  ).bind(oneHourAgo, replyEmail, ipHash, ipHash).first<{ total: number }>();
  if (Number(rateRow?.total || 0) >= 5) {
    return Response.json({ error: "短時間內提交次數過多，請稍後再試。" }, { status: 429, headers: responseHeaders });
  }

  const session = await auth();
  const userId = session?.user?.id || null;
  const membership = userId
    ? await env.DB.prepare(
      `SELECT family_id FROM family_members
        WHERE user_id = ? AND status = 'active'
        ORDER BY created_at LIMIT 1`,
    ).bind(userId).first<{ family_id: string }>()
    : null;
  const now = new Date().toISOString();
  const requestId = crypto.randomUUID();
  const userAgent = normalizedText(request.headers.get("user-agent"), 300) || null;

  await env.DB.prepare(
    `INSERT INTO support_requests
      (id, user_id, family_id, category, contact_name, reply_email, subject, message,
       status, ip_hash, user_agent, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)`,
  ).bind(
    requestId,
    userId,
    membership?.family_id || null,
    category,
    contactName,
    replyEmail,
    subject,
    message,
    ipHash,
    userAgent,
    now,
    now,
  ).run();

  return Response.json(
    { success: true, requestId, message: "客服單已送出。" },
    { status: 201, headers: responseHeaders },
  );
}
