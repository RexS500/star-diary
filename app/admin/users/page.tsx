import { requireAdmin } from "../../admin-auth";
import { getAdminUsers } from "../../admin-service";
import { AdminPageHeader, AdminTable, statusBadge } from "../admin-ui";

export default async function AdminUsersPage() {
  await requireAdmin();
  const users = await getAdminUsers();
  return <>
    <AdminPageHeader eyebrow="USER MANAGEMENT" title="使用者管理" description="檢視 Google 帳號、家庭角色與登入活動；不提供直接修改私人家庭內容的功能。"/>
    <section className="admin-panel">
      <div className="admin-panel-heading"><div><p>GOOGLE ACCOUNTS</p><h2>全部使用者 <small>{users.length}</small></h2></div></div>
      <AdminTable rows={users as Array<Record<string, unknown>>} columns={[
        { key: "email", label: "Google 帳號" },
        { key: "name", label: "顯示名稱" },
        { key: "family_name", label: "所屬家庭" },
        { key: "family_role", label: "家庭角色" },
        { key: "created_at", label: "建立時間" },
        { key: "last_login_at", label: "最後登入" },
        { key: "login_count", label: "登入次數" },
        { key: "status", label: "狀態", render: row => statusBadge(row.status) },
      ]}/>
    </section>
  </>;
}
