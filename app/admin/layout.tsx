import type { ReactNode } from "react";
import Link from "next/link";
import { getOptionalAdmin } from "../admin-auth";
import { adminNavItems } from "./admin-ui";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await getOptionalAdmin();
  if (admin) return <div className="admin-shell">
      <header className="admin-topbar">
        <Link className="admin-brand" href="/admin"><span aria-hidden="true">⭐</span><span><strong>星星日記</strong><small>營運管理中心</small></span></Link>
        <div className="admin-identity"><span>{admin.name || "管理員"}</span><small>{admin.email}</small><Link href="/">返回星星日記</Link></div>
      </header>
      <nav className="admin-nav" aria-label="管理後台導覽">
        {adminNavItems.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
      </nav>
      <main className="admin-main">{children}</main>
    </div>;
  return <main className="admin-denied">
      <section>
        <span aria-hidden="true">🔒</span>
        <p>ADMIN ACCESS</p>
        <h1>沒有管理後台權限</h1>
        <div>此區僅開放指定的 Google 管理員帳號，權限由伺服器驗證。</div>
        <Link href="/">返回星星日記</Link>
      </section>
    </main>;
}
