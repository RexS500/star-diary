import type { ReactNode } from "react";
import Link from "next/link";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return <div className="legal-shell">
    <a className="legal-skip-link" href="#legal-main">跳至主要內容</a>
    <header className="legal-topbar">
      <Link className="legal-brand" href="/legal" aria-label="星星日記法律中心首頁">
        <span aria-hidden="true">⭐</span>
        <span><strong>星星日記</strong><small>LEGAL CENTER</small></span>
      </Link>
      <nav aria-label="法律中心主要導覽">
        <Link href="/legal">法律中心</Link>
        <Link href="/legal/privacy">隱私權</Link>
        <Link href="/legal/terms">服務條款</Link>
        <Link href="/legal/contact">聯絡我們</Link>
      </nav>
      <Link className="legal-back-app" href="/">返回星星日記</Link>
    </header>
    {children}
  </div>;
}

