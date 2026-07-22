import Link from "next/link";
import { LEGAL_CENTER_VERSION, LEGAL_LAST_UPDATED, LEGAL_STATUS_LABEL } from "./content/config";
import { legalDocuments } from "./content";
import { legalMetadata } from "./metadata";

export const metadata = legalMetadata({
  title: "法律中心",
  description: "集中查閱星星日記的隱私、服務條款、兒童資料保護與相關法律文件。",
  path: "/legal",
});

const documentIcon: Record<string, string> = {
  privacy: "🔐",
  terms: "📄",
  "children-privacy": "👨‍👩‍👧",
  cookies: "🍪",
  "third-party-services": "🔗",
  copyright: "©️",
  disclaimer: "ℹ️",
  contact: "💬",
  changelog: "🕒",
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${year}/${month}/${day}`;
}

export default function LegalCenterPage() {
  return <main id="legal-main" className="legal-main legal-center-main">
    <section className="legal-hero" aria-labelledby="legal-center-title">
      <div>
        <p className="legal-kicker">FAMILY STAR DIARY</p>
        <h1 id="legal-center-title">法律中心</h1>
        <p>集中管理隱私、服務規則、兒童資料保護與第三方服務說明，讓家庭能清楚了解星星日記如何運作。</p>
      </div>
      <dl>
        <div><dt>法律中心版本</dt><dd>v{LEGAL_CENTER_VERSION}</dd></div>
        <div><dt>最後更新</dt><dd><time dateTime={LEGAL_LAST_UPDATED}>{formatDate(LEGAL_LAST_UPDATED)}</time></dd></div>
        <div><dt>目前狀態</dt><dd>{LEGAL_STATUS_LABEL.effective}</dd></div>
      </dl>
    </section>

    <aside className="legal-phase-note" role="note">
      <strong>v1.0.0 Beta・現行有效</strong>
      <p>本法律中心自 2026 年 7 月 22 日起生效。目前服務由個人開發與維運，對外名稱為 Family Star Diary（星星日記）；未來營運主體變更時將另行更新版本與生效資訊。</p>
    </aside>

    <section className="legal-document-index" aria-labelledby="legal-documents-title">
      <header><p className="legal-kicker">DOCUMENT LIBRARY</p><h2 id="legal-documents-title">法律文件</h2><p>每份文件獨立管理，便於版本控制、未來英文版與多語系擴充。</p></header>
      <div className="legal-card-grid">
        {legalDocuments.map(document => <article key={document.slug} className="legal-card">
          <span className="legal-card-icon" aria-hidden="true">{documentIcon[document.slug]}</span>
          <div><small>{document.englishTitle}</small><h3>{document.title}</h3><p>{document.description}</p></div>
          <dl><div><dt>版本</dt><dd>v{document.version}</dd></div><div><dt>章節</dt><dd>{document.sections.length}</dd></div></dl>
          <Link href={`/legal/${document.slug}`} aria-label={`查看${document.title}`}>查看完整文件 <span aria-hidden="true">→</span></Link>
        </article>)}
      </div>
    </section>

    <section className="legal-principles" aria-labelledby="legal-principles-title">
      <header><p className="legal-kicker">DESIGN PRINCIPLES</p><h2 id="legal-principles-title">撰寫與治理原則</h2></header>
      <div><article><strong>保護家庭資料</strong><p>以資料最小化、家庭隔離及兒童資料保護為核心。</p></article><article><strong>符合實際功能</strong><p>只描述目前存在的功能、資料流向與可執行承諾。</p></article><article><strong>保留清楚版本</strong><p>正式變更保留日期、版本、摘要與生效狀態。</p></article><article><strong>兼顧雙方權益</strong><p>避免過度免責，同時清楚界定平台、第三方與使用者責任。</p></article></div>
    </section>
  </main>;
}
