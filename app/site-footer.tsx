import Link from "next/link";

const legalLinks = [
  ["/legal", "法律中心"],
  ["/legal/privacy", "隱私權政策"],
  ["/legal/terms", "服務條款"],
  ["/legal/contact", "聯絡我們"],
  ["/legal/changelog", "更新日誌"],
] as const;

export function SiteFooter() {
  return <footer className="site-footer">
    <div>
      <p><strong>星星日記</strong><span>Family Star Diary</span></p>
      <nav aria-label="法律與客服連結">{legalLinks.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav>
      <small>© {new Date().getFullYear()} Family Star Diary. All rights reserved.</small>
    </div>
  </footer>;
}

