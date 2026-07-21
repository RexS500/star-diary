import { getOptionalAdmin } from "../admin-auth";
import { getAdminOverview } from "../admin-service";
import { AdminMetric, AdminPageHeader, AdminTable, formatBytes, formatNumber } from "./admin-ui";

export default async function AdminOverviewPage() {
  if (!await getOptionalAdmin()) return null;
  const data = await getAdminOverview();
  const metrics = [
    ["總家庭數", data.totals.families, "blue"],
    ["總使用者數", data.totals.users, "blue"],
    ["今日登入人數", data.totals.todayActiveUsers, "green"],
    ["今日新增家庭", data.totals.todayFamilies, "green"],
    ["今日新增成員", data.totals.todayMembers, "green"],
    ["今日加星次數", data.totals.todayStarAdds, "gold"],
    ["今日扣星次數", data.totals.todayStarDeducts, "red"],
    ["今日兌換次數", data.totals.todayRedemptions, "gold"],
  ] as const;
  return <>
    <AdminPageHeader eyebrow="OPERATIONS OVERVIEW" title="後台總覽" description={`營運日界線採 Asia/Taipei，目前日期 ${data.today}。所有營運數據均由應用程式寫入 D1。`}/>
    <section className="admin-metric-grid">
      {metrics.map(([label, value, tone]) => <AdminMetric key={label} label={label} value={formatNumber(value)} tone={tone}/>) }
      <AdminMetric label="圖片總數" value={formatNumber(data.totals.mediaObjects)} helper="D1 已登記物件" tone="slate"/>
      <AdminMetric label="R2 已記錄容量" value={formatBytes(data.totals.mediaBytes)} helper="新上傳檔案精確計算" tone="slate"/>
    </section>
    <section className="admin-panel">
      <div className="admin-panel-heading"><div><p>SYSTEM HEALTH</p><h2>最近系統錯誤</h2></div><a href="/admin/reports/errors">查看完整報表</a></div>
      <AdminTable rows={data.recentErrors as Array<Record<string, unknown>>} empty="目前沒有未處理的系統錯誤。" columns={[
        { key: "occurred_at", label: "發生時間" },
        { key: "category", label: "分類" },
        { key: "route", label: "路由" },
        { key: "status_code", label: "狀態碼" },
        { key: "message", label: "錯誤摘要" },
      ]}/>
    </section>
    <aside className="admin-note"><strong>第一階段資料來源</strong><span>營運報表以 D1 的登入活動、功能事件、家庭資料與錯誤紀錄為準。Workers CPU、Bandwidth、Cache 與 Cloudflare 原生請求量將在第二階段補充。</span></aside>
  </>;
}
