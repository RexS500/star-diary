import type { ReactNode } from "react";
import type { AdminDateRange } from "../admin-service";

export const adminNavItems = [
  ["/admin", "總覽"],
  ["/admin/families", "家庭管理"],
  ["/admin/users", "使用者管理"],
  ["/admin/reports/users", "使用者報表"],
  ["/admin/reports/features", "功能報表"],
  ["/admin/reports/stars", "星星報表"],
  ["/admin/reports/resources", "資源報表"],
  ["/admin/reports/errors", "錯誤報表"],
  ["/admin/audit", "稽核紀錄"],
] as const;

export function AdminPageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="admin-page-header">
    <p>{eyebrow}</p>
    <h1>{title}</h1>
    <span>{description}</span>
  </header>;
}

export function AdminMetric({ label, value, helper, tone = "blue" }: {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  tone?: "blue" | "green" | "gold" | "red" | "slate";
}) {
  return <article className={`admin-metric admin-metric-${tone}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    {helper ? <small>{helper}</small> : null}
  </article>;
}

export function AdminRangeForm({ range }: { range: AdminDateRange }) {
  return <form className="admin-range-form" method="get">
    <label>開始日期<input type="date" name="start" defaultValue={range.start}/></label>
    <label>結束日期<input type="date" name="end" defaultValue={range.end}/></label>
    <button type="submit">套用日期</button>
  </form>;
}

export function AdminTable({ columns, rows, empty = "目前沒有資料。" }: {
  columns: Array<{ key: string; label: string; render?: (row: Record<string, unknown>) => ReactNode }>;
  rows: Array<Record<string, unknown>>;
  empty?: string;
}) {
  if (!rows.length) return <p className="admin-empty">{empty}</p>;
  return <div className="admin-table-wrap"><table className="admin-table">
    <thead><tr>{columns.map(column => <th key={column.key}>{column.label}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={String(row.id || row.day || index)}>
      {columns.map(column => <td key={column.key}>{column.render ? column.render(row) : formatAdminValue(row[column.key])}</td>)}
    </tr>)}</tbody>
  </table></div>;
}

export function AdminBars({ items }: { items: Array<{ label: string; value: number; tone?: string }> }) {
  const maximum = Math.max(1, ...items.map(item => Math.abs(item.value)));
  return <div className="admin-bars" role="img" aria-label="營運數據圖表">
    {items.map(item => <div className="admin-bar-row" key={item.label}>
      <span>{item.label}</span>
      <div><i className={item.tone || ""} style={{ width: `${Math.max(2, Math.abs(item.value) / maximum * 100)}%` }}/></div>
      <strong>{formatNumber(item.value)}</strong>
    </div>)}
  </div>;
}

export function formatNumber(value: unknown) {
  return Number(value || 0).toLocaleString("zh-TW", { maximumFractionDigits: 1 });
}

export function formatBytes(value: unknown) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes.toLocaleString("zh-TW")} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function formatAdminValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return value.toLocaleString("zh-TW");
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return new Date(text).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  return text;
}

export function statusBadge(value: unknown) {
  const status = String(value || "active");
  return <span className={`admin-status admin-status-${status}`}>{status === "active" ? "啟用" : status === "disabled" ? "停用" : status}</span>;
}
