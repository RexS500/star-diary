import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("legal center uses a shared dynamic route and independent document modules", () => {
  const registry = read("app/legal/content/index.ts");
  const route = read("app/legal/[slug]/page.tsx");
  const documents = [
    "privacy-policy",
    "terms-of-service",
    "children-privacy",
    "cookie-policy",
    "third-party-services",
    "copyright",
    "disclaimer",
    "contact-policy",
    "legal-changelog",
  ];
  for (const document of documents) {
    assert.match(registry, new RegExp(`\\./${document}`));
    const source = read(`app/legal/content/${document}.ts`);
    assert.ok(source.includes('status: "effective"'));
    assert.ok(source.includes('effectiveDate: "2026-07-22"'));
  }
  assert.match(route, /generateStaticParams/);
  assert.match(route, /getLegalDocument/);
  assert.match(route, /LegalDocumentLayout/);
  assert.match(route, /ContactForm/);
});

test("the public legal version is effective without inventing a company", () => {
  const config = read("app/legal/content/config.ts");
  const home = read("app/legal/page.tsx");
  const privacy = read("app/legal/content/privacy-policy.ts");
  const changelog = read("app/legal/content/legal-changelog.ts");
  assert.match(config, /LEGAL_CENTER_VERSION = "1\.0\.0 Beta"/);
  assert.match(home, /v1\.0\.0 Beta・現行有效/);
  assert.match(privacy, /目前由個人開發與維運/);
  assert.match(privacy, /對外服務及個人資料蒐集主體名稱使用 Family Star Diary（星星日記）/);
  assert.doesNotMatch(privacy, /有限公司|股份有限公司/);
  assert.match(changelog, /v1\.0\.0 Beta — 首次正式生效/);
});

test("legal documents contain substantive drafts instead of outline-only placeholders", () => {
  const privacy = read("app/legal/content/privacy-policy.ts");
  const terms = read("app/legal/content/terms-of-service.ts");
  const children = read("app/legal/content/children-privacy.ts");
  const cookies = read("app/legal/content/cookie-policy.ts");
  const thirdParties = read("app/legal/content/third-party-services.ts");
  for (const source of [privacy, terms, children, cookies, thirdParties]) {
    assert.match(source, /paragraphs:/);
    assert.match(source, /readingMinutes:/);
  }
  assert.match(privacy, /管理員不得因好奇/);
  assert.match(privacy, /不將使用者裝置上選取的原始檔案另行上傳或保存/);
  assert.match(terms, /Google/);
  assert.match(children, /親權、監護權、照顧責任/);
  assert.match(cookies, /不使用廣告追蹤 Cookie/);
});

test("contact form is D1-backed and protected against cross-site submission", () => {
  const form = read("app/legal/contact-form.tsx");
  const route = read("app/api/support/route.ts");
  const migration = read("drizzle/0007_legal_support_requests.sql");
  assert.match(form, /站內客服表單/);
  assert.match(form, /x-star-diary-csrf/);
  assert.match(route, /validSameOriginCsrfRequest/);
  assert.match(route, /support_requests/);
  assert.match(route, /privacyAccepted/);
  assert.match(route, /ipHash/);
  assert.match(migration, /CREATE TABLE "support_requests"/);
  assert.match(migration, /ON DELETE SET NULL/);
});

test("legal pages expose canonical and Open Graph metadata", () => {
  const metadata = read("app/legal/metadata.ts");
  const home = read("app/legal/page.tsx");
  assert.match(metadata, /alternates: \{ canonical: url \}/);
  assert.match(metadata, /openGraph/);
  assert.match(metadata, /locale: "zh_TW"/);
  assert.match(home, /legalMetadata/);
});

test("all pages receive the shared legal footer and accessible legal layout", () => {
  const root = read("app/layout.tsx");
  const footer = read("app/site-footer.tsx");
  const layout = read("app/legal/layout.tsx");
  const styles = read("app/globals.css");
  for (const label of ["法律中心", "隱私權政策", "服務條款", "聯絡我們", "更新日誌"]) {
    assert.ok(footer.includes(label));
  }
  assert.match(root, /<SiteFooter\/>/);
  assert.match(layout, /legal-skip-link/);
  assert.match(layout, /aria-label="法律中心主要導覽"/);
  assert.match(styles, /\.legal-card-grid/);
  assert.match(styles, /@media\(max-width:620px\)/);
});
