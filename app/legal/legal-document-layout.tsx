import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL_STATUS_LABEL } from "./content/config";
import type { LegalDocument } from "./content/types";

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

export function LegalDocumentLayout({ document, children }: { document: LegalDocument; children?: ReactNode }) {
  return <main id="legal-main" className="legal-main">
    <nav className="legal-breadcrumb" aria-label="麵包屑">
      <Link href="/">星星日記</Link><span aria-hidden="true">/</span><Link href="/legal">法律中心</Link><span aria-hidden="true">/</span><span aria-current="page">{document.title}</span>
    </nav>

    <article className="legal-document" aria-labelledby="legal-document-title">
      <header className="legal-document-header">
        <div>
          <p className="legal-kicker">{document.englishTitle}</p>
          <h1 id="legal-document-title">{document.title}</h1>
          <p className="legal-description">{document.description}</p>
        </div>
        <span className={`legal-status legal-status-${document.status}`}>{LEGAL_STATUS_LABEL[document.status]}</span>
        <dl className="legal-document-meta">
          <div><dt>文件版本</dt><dd>v{document.version}</dd></div>
          <div><dt>最後更新</dt><dd><time dateTime={document.lastUpdated}>{formatDate(document.lastUpdated)}</time></dd></div>
          <div><dt>生效日期</dt><dd>{document.effectiveDate ? <time dateTime={document.effectiveDate}>{formatDate(document.effectiveDate)}</time> : "尚未生效"}</dd></div>
          {document.readingMinutes ? <div><dt>閱讀時間</dt><dd>約 {document.readingMinutes} 分鐘</dd></div> : null}
        </dl>
      </header>

      {document.status === "draft" ? <aside className="legal-draft-notice" role="note">
        <strong>完整草案・尚未生效</strong>
        <p>本頁已完成實質內容草案，仍待營運者識別資訊、生效日期及正式法律審閱確認；在此之前不視為已生效條款。</p>
      </aside> : null}

      <section className="legal-summary" aria-labelledby="legal-summary-title">
        <h2 id="legal-summary-title">重點摘要</h2>
        <ul>{document.summary.map(item => <li key={item}>{item}</li>)}</ul>
      </section>

      <div className="legal-document-grid">
        <nav className="legal-toc" aria-label={`${document.title}文件目錄`}>
          <strong>文件目錄</strong>
          <ol>{document.sections.map((section, index) => <li key={section.id}><a href={`#${section.id}`}><span>{String(index + 1).padStart(2, "0")}</span>{section.title}</a></li>)}</ol>
        </nav>

        <div className="legal-clauses" aria-label="文件章節">
          {document.sections.map((section, index) => <section key={section.id} id={section.id} tabIndex={-1}>
            <p className="legal-section-number">SECTION {String(index + 1).padStart(2, "0")}</p>
            <h2>{section.title}</h2>
            {section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
            {section.bullets?.length ? <ul>{section.bullets.map(item => <li key={item}>{item}</li>)}</ul> : null}
            {section.links?.length ? <div className="legal-reference-links" aria-label={`${section.title}參考連結`}>{section.links.map(link => <a key={link.href} href={link.href} target="_blank" rel="noreferrer">{link.label}<span aria-hidden="true"> ↗</span></a>)}</div> : null}
            {document.status === "draft" && !section.paragraphs?.length && !section.bullets?.length ? <div className="legal-outline"><strong>待撰寫範圍</strong><ul>{section.outline.map(item => <li key={item}>{item}</li>)}</ul></div> : null}
          </section>)}
        </div>
      </div>

      {children}

      <footer className="legal-document-footer">
        <Link href="/legal">← 返回法律中心</Link>
        <p>正式版本發布後，實質變更將記錄於法律更新紀錄。</p>
      </footer>
    </article>
  </main>;
}
