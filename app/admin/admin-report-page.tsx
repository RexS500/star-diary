import { requireAdmin } from "../admin-auth";
import { getAdminReport, normalizeAdminRange, type AdminReportKind } from "../admin-service";
import { AdminBars, AdminMetric, AdminPageHeader, AdminRangeForm, AdminTable, formatBytes, formatNumber } from "./admin-ui";

type ReportSearchParams = Promise<{ start?: string; end?: string }> | undefined;

const reportMeta: Record<AdminReportKind, { eyebrow: string; title: string; description: string }> = {
  users: { eyebrow: "USER REPORT", title: "使用者報表", description: "新增家庭、使用者、DAU、WAU、MAU 與七日留存。" },
  features: { eyebrow: "FEATURE REPORT", title: "功能使用報表", description: "任務、星星、兌換、圖片與 Excel 匯出等匿名使用事件。" },
  stars: { eyebrow: "STAR REPORT", title: "星星報表", description: "每日加星、扣星、淨星星與異常大額變動。" },
  resources: { eyebrow: "RESOURCE REPORT", title: "系統資源報表", description: "第一階段顯示 D1 自行記錄的資料筆數、請求、錯誤與 R2 容量。" },
  errors: { eyebrow: "ERROR REPORT", title: "錯誤異常報表", description: "登入、家庭、圖片、API 與 Worker 例外的分類與原始數字。" },
};

const eventLabels: Record<string, string> = {
  family_created: "建立家庭", member_created: "新增成員", daily_task_created: "建立每日任務",
  daily_task_completed: "完成每日任務", challenge_task_completed: "完成挑戰任務",
  star_add: "加星", star_deduct: "扣星", special_reward: "特殊獎勵",
  redemption_completed: "獎勵兌換", image_uploaded: "圖片上傳", excel_exported: "Excel 匯出",
};

export async function AdminReportPage({ kind, searchParams }: { kind: AdminReportKind; searchParams?: ReportSearchParams }) {
  await requireAdmin();
  const params = await searchParams;
  const range = normalizeAdminRange(params?.start, params?.end);
  const report = await getAdminReport(kind, range) as Record<string, unknown>;
  const meta = reportMeta[kind];
  return <>
    <AdminPageHeader eyebrow={meta.eyebrow} title={meta.title} description={meta.description}/>
    <AdminRangeForm range={range}/>
    {kind === "users" ? <UserReport report={report}/> : null}
    {kind === "features" ? <FeatureReport report={report}/> : null}
    {kind === "stars" ? <StarReport report={report}/> : null}
    {kind === "resources" ? <ResourceReport report={report}/> : null}
    {kind === "errors" ? <ErrorReport report={report}/> : null}
  </>;
}

function UserReport({ report }: { report: Record<string, unknown> }) {
  const summary = report.summary as Record<string, number>;
  const rows = report.rows as Array<Record<string, unknown>>;
  return <>
    <section className="admin-metric-grid admin-report-metrics">
      <AdminMetric label="WAU" value={formatNumber(summary.wau)} helper="截止區間結束日近 7 天" tone="green"/>
      <AdminMetric label="MAU" value={formatNumber(summary.mau)} helper="截止區間結束日近 30 天" tone="blue"/>
      <AdminMetric label="七日留存" value={`${formatNumber(summary.sevenDayRetention)}%`} helper="追蹤啟用後的 cohort" tone="gold"/>
      <AdminMetric label="平均家庭成員" value={formatNumber(summary.averageMembers)} tone="slate"/>
      <AdminMetric label="平均孩子數" value={formatNumber(summary.averageChildren)} tone="slate"/>
    </section>
    <ReportPanel title="每日活躍使用者趨勢"><AdminBars items={rows.map(row => ({ label: String(row.day).slice(5), value: Number(row.dau || 0) }))}/></ReportPanel>
    <ReportPanel title="原始數字"><AdminTable rows={rows} columns={[
      { key: "day", label: "日期" }, { key: "newFamilies", label: "新增家庭" },
      { key: "newUsers", label: "新增使用者" }, { key: "dau", label: "DAU" },
    ]}/></ReportPanel>
  </>;
}

function FeatureReport({ report }: { report: Record<string, unknown> }) {
  const rows = report.rows as Array<Record<string, unknown>>;
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(String(row.event_type), (totals.get(String(row.event_type)) || 0) + Number(row.count || 0));
  return <>
    <ReportPanel title="功能使用次數"><AdminBars items={[...totals].sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ label: eventLabels[key] || key, value }))}/></ReportPanel>
    <ReportPanel title="原始數字"><AdminTable rows={rows} empty="此日期區間尚未記錄功能使用事件。" columns={[
      { key: "day", label: "日期" },
      { key: "event_type", label: "功能", render: row => eventLabels[String(row.event_type)] || String(row.event_type) },
      { key: "count", label: "次數" }, { key: "amount", label: "數量／星星／Bytes" },
    ]}/></ReportPanel>
  </>;
}

function StarReport({ report }: { report: Record<string, unknown> }) {
  const rows = report.rows as Array<Record<string, unknown>>;
  const anomalies = report.anomalies as Array<Record<string, unknown>>;
  return <>
    <ReportPanel title="每日淨星星"><AdminBars items={rows.map(row => ({ label: String(row.day).slice(5), value: Number(row.net || 0), tone: Number(row.net || 0) < 0 ? "red" : "" }))}/></ReportPanel>
    <ReportPanel title="每日原始數字"><AdminTable rows={rows} columns={[
      { key: "day", label: "日期" }, { key: "added", label: "加星總數" },
      { key: "deducted", label: "扣星總數" }, { key: "net", label: "淨星星" },
    ]}/></ReportPanel>
    <ReportPanel title="異常星星變動"><AdminTable rows={anomalies} empty="沒有偵測到單筆 100 顆以上的異常變動。" columns={[
      { key: "occurred_at", label: "時間" }, { key: "event_type", label: "類型" },
      { key: "amount", label: "星星" }, { key: "source", label: "來源" },
    ]}/></ReportPanel>
  </>;
}

function ResourceReport({ report }: { report: Record<string, unknown> }) {
  const metrics = report.metrics as Record<string, number>;
  const deferred = report.deferredCloudflareMetrics as string[];
  return <>
    <section className="admin-metric-grid admin-report-metrics">
      <AdminMetric label="D1 使用者列" value={formatNumber(metrics.users)} tone="blue"/>
      <AdminMetric label="D1 家庭列" value={formatNumber(metrics.families)} tone="blue"/>
      <AdminMetric label="家庭資料列" value={formatNumber(metrics.familyStateRows)} tone="blue"/>
      <AdminMetric label="營運事件列" value={formatNumber(metrics.featureEvents)} tone="green"/>
      <AdminMetric label="R2 圖片物件" value={formatNumber(metrics.r2Objects)} tone="gold"/>
      <AdminMetric label="R2 已記錄容量" value={formatBytes(metrics.r2RecordedBytes)} tone="gold"/>
      <AdminMetric label="應用程式記錄請求" value={formatNumber(metrics.recordedRequests)} tone="slate"/>
      <AdminMetric label="應用程式錯誤率" value={`${formatNumber(metrics.recordedErrorRate)}%`} tone={metrics.recordedErrors ? "red" : "green"}/>
    </section>
    <aside className="admin-note"><strong>第二階段 Cloudflare 補充指標</strong><span>{deferred.join("、")}。這些不會取代 D1 營運報表。</span></aside>
  </>;
}

function ErrorReport({ report }: { report: Record<string, unknown> }) {
  const summary = report.summary as Array<Record<string, unknown>>;
  const rows = report.rows as Array<Record<string, unknown>>;
  return <>
    <ReportPanel title="錯誤分類"><AdminBars items={summary.map(row => ({ label: String(row.category), value: Number(row.count || 0), tone: "red" }))}/></ReportPanel>
    <ReportPanel title="錯誤原始數字"><AdminTable rows={rows} empty="此日期區間沒有系統錯誤。" columns={[
      { key: "occurred_at", label: "發生時間" }, { key: "category", label: "分類" },
      { key: "error_code", label: "錯誤代碼" }, { key: "route", label: "路由" },
      { key: "status_code", label: "狀態碼" }, { key: "message", label: "摘要" },
      { key: "resolved_at", label: "已處理" },
    ]}/></ReportPanel>
  </>;
}

function ReportPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="admin-panel admin-report-panel"><div className="admin-panel-heading"><div><h2>{title}</h2></div></div>{children}</section>;
}
