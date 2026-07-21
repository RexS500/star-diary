import { env } from "cloudflare:workers";
import { taipeiDayKey } from "./operations-telemetry";

export type AdminDateRange = { start: string; end: string };
export type AdminReportKind = "users" | "features" | "stars" | "resources" | "errors";

type CountRow = { value: number | null };
type AnyRow = Record<string, string | number | null>;

function rows<T>(result: D1Result) {
  return (result.results || []) as T[];
}

function scalar(result: D1Result) {
  return Number(rows<CountRow>(result)[0]?.value || 0);
}

function addDays(dayKey: string, days: number) {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function normalizeAdminRange(start?: string, end?: string): AdminDateRange {
  const today = taipeiDayKey();
  const safeEnd = /^\d{4}-\d{2}-\d{2}$/.test(end || "") ? end! : today;
  const safeStart = /^\d{4}-\d{2}-\d{2}$/.test(start || "") ? start! : addDays(safeEnd, -29);
  if (safeStart > safeEnd) return { start: safeEnd, end: safeEnd };
  if (new Date(`${safeEnd}T00:00:00Z`).getTime() - new Date(`${safeStart}T00:00:00Z`).getTime() > 366 * 86400000) {
    return { start: addDays(safeEnd, -365), end: safeEnd };
  }
  return { start: safeStart, end: safeEnd };
}

export function rangeDays(range: AdminDateRange) {
  const result: string[] = [];
  for (let day = range.start; day <= range.end; day = addDays(day, 1)) result.push(day);
  return result;
}

export async function getAdminOverview() {
  const today = taipeiDayKey();
  const results = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS value FROM families"),
    env.DB.prepare("SELECT COUNT(*) AS value FROM users"),
    env.DB.prepare("SELECT COUNT(*) AS value FROM user_daily_activity WHERE activity_date = ?").bind(today),
    env.DB.prepare("SELECT COUNT(*) AS value FROM families WHERE substr(created_at, 1, 10) = ?").bind(today),
    env.DB.prepare("SELECT COUNT(*) AS value FROM family_members WHERE substr(created_at, 1, 10) = ?").bind(today),
    env.DB.prepare("SELECT COALESCE(SUM(quantity), 0) AS value FROM feature_usage_events WHERE day_key = ? AND event_type = 'star_add'").bind(today),
    env.DB.prepare("SELECT COALESCE(SUM(quantity), 0) AS value FROM feature_usage_events WHERE day_key = ? AND event_type = 'star_deduct'").bind(today),
    env.DB.prepare("SELECT COALESCE(SUM(quantity), 0) AS value FROM feature_usage_events WHERE day_key = ? AND event_type = 'redemption_completed'").bind(today),
    env.DB.prepare("SELECT COUNT(*) AS value FROM media_objects"),
    env.DB.prepare("SELECT COALESCE(SUM(size_bytes), 0) AS value FROM media_objects"),
    env.DB.prepare(
      `SELECT id, category, message, route, status_code, occurred_at
         FROM system_error_logs
        WHERE resolved_at IS NULL
        ORDER BY occurred_at DESC LIMIT 8`,
    ),
  ]);
  return {
    today,
    totals: {
      families: scalar(results[0]),
      users: scalar(results[1]),
      todayActiveUsers: scalar(results[2]),
      todayFamilies: scalar(results[3]),
      todayMembers: scalar(results[4]),
      todayStarAdds: scalar(results[5]),
      todayStarDeducts: scalar(results[6]),
      todayRedemptions: scalar(results[7]),
      mediaObjects: scalar(results[8]),
      mediaBytes: scalar(results[9]),
    },
    recentErrors: rows<AnyRow>(results[10]),
  };
}

export async function getAdminFamilies() {
  const [result] = await env.DB.batch([env.DB.prepare(
    `SELECT f.id, f.name, f.created_at, f.updated_at, f.last_activity_at,
            f.status, f.is_test,
            COALESCE((SELECT u.email FROM family_members fm
              JOIN users u ON u.id = fm.user_id
              WHERE fm.family_id = f.id AND fm.role = 'owner'
              ORDER BY fm.created_at LIMIT 1), '') AS owner_email,
            (SELECT COUNT(*) FROM family_members fm WHERE fm.family_id = f.id) AS member_count,
            (SELECT COUNT(*) FROM media_objects mo WHERE mo.family_id = f.id) AS media_count,
            (SELECT COALESCE(SUM(mo.size_bytes), 0) FROM media_objects mo WHERE mo.family_id = f.id) AS media_bytes,
            COALESCE(json_array_length(json_extract(fs.data, '$.children')), 0) AS child_count
       FROM families f
       LEFT JOIN family_state fs ON fs.family_id = f.id
      ORDER BY COALESCE(f.last_activity_at, f.updated_at, f.created_at) DESC`,
  )]);
  return rows<AnyRow>(result);
}

export async function getAdminUsers() {
  const [result] = await env.DB.batch([env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.created_at, u.last_login_at,
            u.login_count, u.status,
            COALESCE(f.name, '') AS family_name,
            COALESCE(fm.role, '') AS family_role,
            COALESCE(fm.family_id, '') AS family_id
       FROM users u
       LEFT JOIN family_members fm ON fm.user_id = u.id AND fm.status = 'active'
       LEFT JOIN families f ON f.id = fm.family_id
      ORDER BY COALESCE(u.last_login_at, u.created_at, '') DESC`,
  )]);
  return rows<AnyRow>(result);
}

export async function getAdminAuditLogs(limit = 100) {
  const [result] = await env.DB.batch([env.DB.prepare(
    `SELECT aal.id, aal.action_type, aal.target_type, aal.target_id,
            aal.reason, aal.created_at, aal.result_status,
            COALESCE(u.email, aal.admin_user_id) AS admin_email
       FROM admin_audit_logs aal
       LEFT JOIN users u ON u.id = aal.admin_user_id
      ORDER BY aal.created_at DESC LIMIT ?`,
  ).bind(Math.max(1, Math.min(500, Math.trunc(limit))))]);
  return rows<AnyRow>(result);
}

export async function getUserOperationsReport(range: AdminDateRange) {
  const results = await env.DB.batch([
    env.DB.prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS value
         FROM families WHERE substr(created_at, 1, 10) BETWEEN ? AND ? GROUP BY day`,
    ).bind(range.start, range.end),
    env.DB.prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS value
         FROM users WHERE substr(created_at, 1, 10) BETWEEN ? AND ? GROUP BY day`,
    ).bind(range.start, range.end),
    env.DB.prepare(
      `SELECT activity_date AS day, COUNT(*) AS value
         FROM user_daily_activity WHERE activity_date BETWEEN ? AND ? GROUP BY activity_date`,
    ).bind(range.start, range.end),
    env.DB.prepare(
      "SELECT COUNT(DISTINCT user_id) AS value FROM user_daily_activity WHERE activity_date BETWEEN date(?, '-6 days') AND ?",
    ).bind(range.end, range.end),
    env.DB.prepare(
      "SELECT COUNT(DISTINCT user_id) AS value FROM user_daily_activity WHERE activity_date BETWEEN date(?, '-29 days') AND ?",
    ).bind(range.end, range.end),
    env.DB.prepare(
      `SELECT AVG(member_count) AS value FROM (
         SELECT COUNT(*) AS member_count FROM family_members GROUP BY family_id
       )`,
    ),
    env.DB.prepare(
      `SELECT AVG(COALESCE(json_array_length(json_extract(data, '$.children')), 0)) AS value
         FROM family_state`,
    ),
    env.DB.prepare(
      `SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE
          ROUND(100.0 * SUM(CASE WHEN EXISTS (
            SELECT 1 FROM user_daily_activity uda
             WHERE uda.user_id = u.id
               AND uda.activity_date = date(substr(u.created_at, 1, 10), '+7 days')
          ) THEN 1 ELSE 0 END) / COUNT(*), 1) END AS value
         FROM users u
        WHERE substr(u.created_at, 1, 10) BETWEEN ? AND date(?, '-7 days')`,
    ).bind(range.start, range.end),
  ]);
  const maps = results.slice(0, 3).map(result => new Map(rows<{ day: string; value: number }>(result).map(row => [row.day, Number(row.value)])));
  return {
    range,
    summary: {
      wau: scalar(results[3]),
      mau: scalar(results[4]),
      averageMembers: Number(rows<CountRow>(results[5])[0]?.value || 0),
      averageChildren: Number(rows<CountRow>(results[6])[0]?.value || 0),
      sevenDayRetention: scalar(results[7]),
    },
    rows: rangeDays(range).map(day => ({
      day,
      newFamilies: maps[0].get(day) || 0,
      newUsers: maps[1].get(day) || 0,
      dau: maps[2].get(day) || 0,
    })),
  };
}

export async function getFeatureOperationsReport(range: AdminDateRange) {
  const [result] = await env.DB.batch([env.DB.prepare(
    `SELECT day_key AS day, event_type,
            COALESCE(SUM(quantity), 0) AS count,
            COALESCE(SUM(amount), 0) AS amount
       FROM feature_usage_events
      WHERE day_key BETWEEN ? AND ?
      GROUP BY day_key, event_type
      ORDER BY day_key, event_type`,
  ).bind(range.start, range.end)]);
  return { range, rows: rows<AnyRow>(result) };
}

export async function getStarOperationsReport(range: AdminDateRange) {
  const results = await env.DB.batch([
    env.DB.prepare(
      `SELECT day_key AS day,
              COALESCE(SUM(CASE WHEN event_type = 'star_add' THEN amount ELSE 0 END), 0) AS added,
              COALESCE(SUM(CASE WHEN event_type = 'star_deduct' THEN amount ELSE 0 END), 0) AS deducted,
              COALESCE(SUM(CASE WHEN event_type = 'star_add' THEN amount WHEN event_type = 'star_deduct' THEN -amount ELSE 0 END), 0) AS net
         FROM feature_usage_events
        WHERE day_key BETWEEN ? AND ? AND event_type IN ('star_add', 'star_deduct')
        GROUP BY day_key ORDER BY day_key`,
    ).bind(range.start, range.end),
    env.DB.prepare(
      `SELECT day_key AS day, event_type, amount, source, occurred_at
         FROM feature_usage_events
        WHERE day_key BETWEEN ? AND ?
          AND event_type IN ('star_add', 'star_deduct')
          AND ABS(COALESCE(amount, 0)) >= 100
        ORDER BY ABS(amount) DESC LIMIT 100`,
    ).bind(range.start, range.end),
  ]);
  const byDay = new Map(rows<AnyRow>(results[0]).map(row => [String(row.day), row]));
  return {
    range,
    rows: rangeDays(range).map(day => byDay.get(day) || { day, added: 0, deducted: 0, net: 0 }),
    anomalies: rows<AnyRow>(results[1]),
  };
}

export async function getResourceOperationsReport(range: AdminDateRange) {
  const results = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS value FROM users"),
    env.DB.prepare("SELECT COUNT(*) AS value FROM families"),
    env.DB.prepare("SELECT COUNT(*) AS value FROM family_members"),
    env.DB.prepare("SELECT COUNT(*) AS value FROM family_state"),
    env.DB.prepare("SELECT COUNT(*) AS value FROM feature_usage_events"),
    env.DB.prepare("SELECT COUNT(*) AS value FROM system_error_logs"),
    env.DB.prepare("SELECT COUNT(*) AS value FROM media_objects"),
    env.DB.prepare("SELECT COALESCE(SUM(size_bytes), 0) AS value FROM media_objects"),
    env.DB.prepare(
      "SELECT COALESCE(SUM(request_count), 0) AS value FROM user_daily_activity WHERE activity_date BETWEEN ? AND ?",
    ).bind(range.start, range.end),
    env.DB.prepare(
      "SELECT COUNT(*) AS value FROM system_error_logs WHERE substr(occurred_at, 1, 10) BETWEEN ? AND ?",
    ).bind(range.start, range.end),
  ]);
  const requests = scalar(results[8]);
  const errors = scalar(results[9]);
  return {
    range,
    source: "application_d1",
    metrics: {
      users: scalar(results[0]), families: scalar(results[1]), memberships: scalar(results[2]),
      familyStateRows: scalar(results[3]), featureEvents: scalar(results[4]), errorRows: scalar(results[5]),
      r2Objects: scalar(results[6]), r2RecordedBytes: scalar(results[7]), recordedRequests: requests,
      recordedErrors: errors, recordedErrorRate: requests ? Number(((errors / requests) * 100).toFixed(2)) : 0,
    },
    deferredCloudflareMetrics: ["D1 資料庫實際大小", "Workers Requests", "CPU", "Bandwidth", "Cache", "Cloudflare Error Rate", "每月預估成本"],
  };
}

export async function getErrorOperationsReport(range: AdminDateRange) {
  const results = await env.DB.batch([
    env.DB.prepare(
      `SELECT category, COUNT(*) AS count,
              SUM(CASE WHEN resolved_at IS NULL THEN 1 ELSE 0 END) AS unresolved
         FROM system_error_logs
        WHERE substr(occurred_at, 1, 10) BETWEEN ? AND ?
        GROUP BY category ORDER BY count DESC`,
    ).bind(range.start, range.end),
    env.DB.prepare(
      `SELECT id, category, error_code, message, route, status_code, occurred_at, resolved_at
         FROM system_error_logs
        WHERE substr(occurred_at, 1, 10) BETWEEN ? AND ?
        ORDER BY occurred_at DESC LIMIT 200`,
    ).bind(range.start, range.end),
  ]);
  return { range, summary: rows<AnyRow>(results[0]), rows: rows<AnyRow>(results[1]) };
}

export async function getAdminReport(kind: AdminReportKind, range: AdminDateRange) {
  if (kind === "users") return getUserOperationsReport(range);
  if (kind === "features") return getFeatureOperationsReport(range);
  if (kind === "stars") return getStarOperationsReport(range);
  if (kind === "resources") return getResourceOperationsReport(range);
  return getErrorOperationsReport(range);
}
