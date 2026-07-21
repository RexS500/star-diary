import { requireAdmin } from "../../admin-auth";
import { getAdminAuditLogs } from "../../admin-service";
import { AdminPageHeader, AdminTable, statusBadge } from "../admin-ui";

export default async function AdminAuditPage() {
  await requireAdmin();
  const logs = await getAdminAuditLogs();
  return <>
    <AdminPageHeader eyebrow="ADMIN AUDIT" title="管理員稽核紀錄" description="所有高風險操作都必須附理由並永久留下操作者、目標、時間與結果。"/>
    <section className="admin-panel">
      <AdminTable rows={logs as Array<Record<string, unknown>>} empty="尚無管理員高風險操作紀錄。" columns={[
        { key: "created_at", label: "時間" },
        { key: "admin_email", label: "管理員" },
        { key: "action_type", label: "操作" },
        { key: "target_type", label: "目標類型" },
        { key: "target_id", label: "目標編號" },
        { key: "reason", label: "原因" },
        { key: "result_status", label: "結果", render: row => statusBadge(row.result_status) },
      ]}/>
    </section>
  </>;
}
