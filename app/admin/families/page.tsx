import { requireAdmin } from "../../admin-auth";
import { getAdminFamilies } from "../../admin-service";
import { AdminPageHeader, AdminTable, formatBytes, statusBadge } from "../admin-ui";

export default async function AdminFamiliesPage() {
  await requireAdmin();
  const families = await getAdminFamilies();
  return <>
    <AdminPageHeader eyebrow="FAMILY MANAGEMENT" title="家庭管理" description="只顯示營運所需的家庭摘要，不在列表揭露孩子姓名、照片或私人任務內容。"/>
    <section className="admin-panel">
      <div className="admin-panel-heading"><div><p>FAMILIES</p><h2>全部家庭 <small>{families.length}</small></h2></div></div>
      <AdminTable rows={families as Array<Record<string, unknown>>} columns={[
        { key: "id", label: "家庭編號" },
        { key: "name", label: "家庭名稱" },
        { key: "owner_email", label: "建立者 Google 帳號" },
        { key: "member_count", label: "成員" },
        { key: "child_count", label: "孩子數" },
        { key: "created_at", label: "建立時間" },
        { key: "last_activity_at", label: "最後活動" },
        { key: "status", label: "狀態", render: row => statusBadge(row.status) },
        { key: "media_bytes", label: "圖片容量", render: row => formatBytes(row.media_bytes) },
      ]}/>
    </section>
  </>;
}
