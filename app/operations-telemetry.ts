import { env } from "cloudflare:workers";

export type OperationalEventType =
  | "family_created"
  | "member_created"
  | "daily_task_created"
  | "daily_task_completed"
  | "daily_task_graduated"
  | "daily_task_reactivated"
  | "challenge_task_completed"
  | "star_add"
  | "star_deduct"
  | "special_reward"
  | "redemption_completed"
  | "image_uploaded"
  | "excel_exported";

type OperationalEventInput = {
  eventType: OperationalEventType;
  familyId?: string | null;
  userId?: string | null;
  amount?: number | null;
  quantity?: number;
  source?: string | null;
  dedupeKey?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  occurredAt?: string;
};

type OperationalErrorInput = {
  category: string;
  error: unknown;
  route?: string;
  method?: string;
  statusCode?: number;
  familyId?: string | null;
  userId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

const TAIPEI_TIME_ZONE = "Asia/Taipei";

export function taipeiDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIPEI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function safeJson(value: Record<string, string | number | boolean | null> | undefined) {
  if (!value) return null;
  const entries = Object.entries(value).slice(0, 20).map(([key, item]) => [
    key.slice(0, 80),
    typeof item === "string" ? item.slice(0, 240) : item,
  ]);
  return JSON.stringify(Object.fromEntries(entries));
}

function safeErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "Unknown error");
  return raw.replace(/[\r\n\t]+/g, " ").slice(0, 500);
}

export async function recordUserActivity(userId: string, familyId?: string | null) {
  const now = new Date().toISOString();
  const dayKey = taipeiDayKey(new Date(now));
  try {
    const statements = [
      env.DB.prepare(
        `INSERT INTO user_daily_activity
           (activity_date, user_id, first_seen_at, last_seen_at, request_count)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(activity_date, user_id) DO UPDATE SET
           last_seen_at = excluded.last_seen_at,
           request_count = user_daily_activity.request_count + 1`,
      ).bind(dayKey, userId, now, now),
    ];
    if (familyId) {
      statements.push(env.DB.prepare(
        "UPDATE families SET last_activity_at = ? WHERE id = ?",
      ).bind(now, familyId));
    }
    await env.DB.batch(statements);
  } catch (error) {
    console.error("[operations] unable to record activity", safeErrorMessage(error));
  }
}

export async function recordLogin(userId: string) {
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(
      `UPDATE users
          SET created_at = COALESCE(created_at, ?),
              last_login_at = ?,
              login_count = COALESCE(login_count, 0) + 1
        WHERE id = ?`,
    ).bind(now, now, userId).run();
    await recordUserActivity(userId);
  } catch (error) {
    console.error("[operations] unable to record login", safeErrorMessage(error));
  }
}

export async function recordOperationalEvent(input: OperationalEventInput) {
  const occurredAt = input.occurredAt || new Date().toISOString();
  const quantity = Number.isFinite(input.quantity) ? Math.max(1, Math.trunc(input.quantity || 1)) : 1;
  const amount = Number.isFinite(input.amount) ? Math.trunc(input.amount || 0) : null;
  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO feature_usage_events
         (id, event_type, occurred_at, day_key, family_id, user_id,
          amount, quantity, source, dedupe_key, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      input.eventType,
      occurredAt,
      taipeiDayKey(new Date(occurredAt)),
      input.familyId || null,
      input.userId || null,
      amount,
      quantity,
      input.source || null,
      input.dedupeKey || null,
      safeJson(input.metadata),
    ).run();
  } catch (error) {
    console.error("[operations] unable to record event", input.eventType, safeErrorMessage(error));
  }
}

export async function recordOperationalError(input: OperationalErrorInput) {
  try {
    await env.DB.prepare(
      `INSERT INTO system_error_logs
         (id, category, error_code, message, route, method, status_code,
          family_id, user_id, request_id, metadata_json, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      input.category.slice(0, 80),
      input.error instanceof Error ? input.error.name.slice(0, 80) : null,
      safeErrorMessage(input.error),
      input.route?.slice(0, 160) || null,
      input.method?.slice(0, 12) || null,
      input.statusCode || null,
      input.familyId || null,
      input.userId || null,
      input.requestId || null,
      safeJson(input.metadata),
      new Date().toISOString(),
    ).run();
  } catch (error) {
    console.error("[operations] unable to record error", safeErrorMessage(error));
  }
}

export function requestTraceId(request: Request) {
  return request.headers.get("cf-ray") || request.headers.get("x-request-id") || crypto.randomUUID();
}

type StateRecord = Record<string, unknown>;
type StateLike = {
  entries?: StateRecord[];
  redemptions?: StateRecord[];
  dailyTasks?: StateRecord[];
  dailyTaskRecords?: StateRecord[];
};

function recordId(value: StateRecord) {
  return typeof value.id === "string" ? value.id : "";
}

function completed(value: StateRecord) {
  return value.status === undefined || value.status === "completed";
}

function newOrNewlyCompleted(before: Map<string, StateRecord>, value: StateRecord) {
  const previous = before.get(recordId(value));
  return completed(value) && (!previous || !completed(previous));
}

function telemetryDate(value: StateRecord) {
  for (const candidate of [value.occurredAt, value.completedAt, value.date]) {
    if (typeof candidate === "string" && Number.isFinite(Date.parse(candidate))) return new Date(candidate).toISOString();
  }
  return undefined;
}

/** Records aggregate-safe state mutations without copying child names, task titles, notes, or images. */
export async function recordFamilyStateDiff(input: {
  before: StateLike;
  after: StateLike;
  familyId: string;
  userId: string;
}) {
  const beforeEntries = new Map((input.before.entries || []).map(item => [recordId(item), item]));
  const beforeRedemptions = new Map((input.before.redemptions || []).map(item => [recordId(item), item]));
  const beforeTasks = new Set((input.before.dailyTasks || []).map(recordId));
  const beforeTaskRecords = new Map((input.before.dailyTaskRecords || []).map(item => [recordId(item), item]));
  const events: Promise<void>[] = [];

  for (const entry of input.after.entries || []) {
    const id = recordId(entry);
    if (!id || entry.revokedAt || !newOrNewlyCompleted(beforeEntries, entry)) continue;
    const amount = Math.max(0, Math.abs(Math.trunc(Number(entry.amount) || 0)));
    const type = entry.type === "deduct" ? "star_deduct" : entry.type === "special" ? "special_reward" : "star_add";
    events.push(recordOperationalEvent({
      eventType: type,
      familyId: input.familyId,
      userId: input.userId,
      amount,
      source: typeof entry.sourceType === "string" ? entry.sourceType : "manual",
      dedupeKey: `state-entry:${input.familyId}:${id}:completed`,
      occurredAt: telemetryDate(entry),
    }));
  }

  for (const redemption of input.after.redemptions || []) {
    const id = recordId(redemption);
    if (!id || !newOrNewlyCompleted(beforeRedemptions, redemption)) continue;
    events.push(recordOperationalEvent({
      eventType: "redemption_completed",
      familyId: input.familyId,
      userId: input.userId,
      amount: Math.max(0, Math.abs(Math.trunc(Number(redemption.cost) || 0))),
      source: typeof redemption.source === "string" ? redemption.source : "star",
      dedupeKey: `state-redemption:${input.familyId}:${id}:completed`,
      occurredAt: telemetryDate(redemption),
    }));
  }

  const newTaskCount = (input.after.dailyTasks || []).filter(task => {
    const id = recordId(task);
    return id && !beforeTasks.has(id);
  }).length;
  if (newTaskCount) {
    events.push(recordOperationalEvent({
      eventType: "daily_task_created",
      familyId: input.familyId,
      userId: input.userId,
      quantity: newTaskCount,
    }));
  }

  for (const taskRecord of input.after.dailyTaskRecords || []) {
    const id = recordId(taskRecord);
    if (!id || taskRecord.status !== "completed") continue;
    const previous = beforeTaskRecords.get(id);
    if (previous?.status === "completed") continue;
    events.push(recordOperationalEvent({
      eventType: "daily_task_completed",
      familyId: input.familyId,
      userId: input.userId,
      source: typeof taskRecord.completedBy === "string" ? taskRecord.completedBy : "unknown",
      dedupeKey: `state-daily-task:${input.familyId}:${id}:completed`,
      occurredAt: telemetryDate(taskRecord),
    }));
  }
  await Promise.all(events);
}
