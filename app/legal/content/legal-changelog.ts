import { LEGAL_CENTER_VERSION, LEGAL_LAST_UPDATED } from "./config";
import type { LegalDocument } from "./types";

export const legalChangelog: LegalDocument = {
  slug: "changelog",
  title: "法律更新紀錄",
  englishTitle: "Legal Changelog",
  description: "記錄法律中心文件的版本、日期、生效狀態與重要實質變更。",
  version: LEGAL_CENTER_VERSION,
  lastUpdated: LEGAL_LAST_UPDATED,
  effectiveDate: "2026-07-22",
  status: "effective",
  readingMinutes: 3,
  summary: [
    "實質影響使用者權利或資料處理的更新會在此留下版本紀錄。",
    "目前有效版本為 v1.0.0 Beta，自 2026 年 7 月 22 日起生效。",
    "單純錯字、排版或不改變意義的修正，可能只更新最後更新日期。",
  ],
  sections: [
    {
      id: "versioning",
      title: "版本規則",
      outline: [],
      paragraphs: [
        "正式生效前使用 0.x 版本；第一個立即生效的公開版本為 v1.0.0 Beta。重大用途、權利義務、營運主體或第三方資料流向變更會提高主要或次要版本，文字澄清與非實質修正則提高修訂版本。Beta 表示服務仍持續改善，不影響本版法律文件已生效。",
      ],
    },
    {
      id: "v1-0-0-beta",
      title: "v1.0.0 Beta — 首次正式生效",
      outline: [],
      paragraphs: [
        "生效日期：2026 年 7 月 22 日。最後更新：2026 年 7 月 22 日。狀態：現行有效。",
        "確認對外服務及個人資料蒐集主體名稱為 Family Star Diary（星星日記），並如實標示目前由個人開發與維運、尚未成立公司。九份法律文件依實際 Google OAuth、Auth.js、Cloudflare Workers、D1、R2、PWA、家庭角色、兒童資料及圖片處理流程正式生效。",
        "本版保留未來調整營運主體、組織型態與聯絡方式的彈性；變更時將透過新版本、更新日期、生效日期及必要通知處理。",
      ],
    },
    {
      id: "v0-9",
      title: "v0.9 — 完整內容草案",
      outline: [],
      paragraphs: [
        "日期：2026 年 7 月 22 日。狀態：尚未生效。",
        "完成隱私權政策、服務條款、兒童資料保護、Cookie 政策、第三方服務說明、智慧財產權聲明、免責聲明、聯絡與客服政策，以及法律更新紀錄的實質內容草案；內容依現有 Google OAuth、Cloudflare Workers、D1、R2、PWA、家庭角色及圖片處理流程撰寫。",
      ],
    },
    {
      id: "v0-1",
      title: "v0.1 — 法律中心架構",
      outline: [],
      paragraphs: [
        "日期：2026 年 7 月 22 日。狀態：已由專案負責人確認架構。",
        "建立 /legal、共用版面、九份獨立內容模組、文件版本欄位、SEO、響應式樣式、無障礙導覽與全站 Footer 入口。",
      ],
    },
    {
      id: "notice",
      title: "重大變更告知",
      outline: [],
      paragraphs: [
        "對個人資料利用目的、第三方分享、兒童資料處理或使用者重要權利義務的實質變更，將在生效前透過法律中心、服務內提示或其他合理方式告知。依法需另行同意者，將於取得同意後適用。",
      ],
    },
  ],
};
