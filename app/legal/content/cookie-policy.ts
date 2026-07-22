import { LEGAL_CENTER_VERSION, LEGAL_LAST_UPDATED } from "./config";
import type { LegalDocument } from "./types";

export const cookiePolicy: LegalDocument = {
  slug: "cookies",
  title: "Cookie 政策",
  englishTitle: "Cookie Policy",
  description: "說明星星日記使用 Cookie、瀏覽器儲存空間及 PWA 快取的方式與目的。",
  version: LEGAL_CENTER_VERSION,
  lastUpdated: LEGAL_LAST_UPDATED,
  effectiveDate: "2026-07-22",
  status: "effective",
  readingMinutes: 6,
  summary: [
    "星星日記只使用提供登入、安全驗證、偏好設定及 PWA 離線能力所必要的技術。",
    "目前不使用廣告追蹤 Cookie，也不出售或出租 Cookie 所取得的資料。",
    "停用必要 Cookie 可能使 Google 登入、家庭資料同步或安全驗證無法正常運作。",
  ],
  sections: [
    {
      id: "scope",
      title: "適用範圍",
      outline: [],
      paragraphs: [
        "本政策適用於 Family Star Diary（星星日記）網站及安裝至裝置主畫面的 PWA。Cookie 是網站寫入瀏覽器的小型資料；Local Storage、Session Storage 與 Service Worker Cache 則是瀏覽器提供的不同儲存機制。",
        "本政策應與隱私權政策一併閱讀。若未來新增分析、行銷或其他非必要追蹤技術，星星日記會先更新本政策，並依適用規範提供適當告知或選擇。",
      ],
    },
    {
      id: "cookies",
      title: "必要 Cookie",
      outline: [],
      paragraphs: [
        "星星日記使用必要 Cookie 維持 Auth.js 登入工作階段、完成 Google OAuth 登入流程、防止跨站請求偽造（CSRF）及保存短效流程狀態。登入工作階段最長可維持約 30 日，但可能因登出、帳號狀態變更、安全事件或系統維護而提前失效。",
        "OAuth 與安全驗證 Cookie 具有短效、HttpOnly、Secure（HTTPS 環境）及 SameSite 等適當屬性時，瀏覽器端程式無法直接讀取其內容。這些 Cookie 不用於廣告投放。",
      ],
      bullets: [
        "登入與保持登入狀態。",
        "Google OAuth 重新導向及狀態驗證。",
        "CSRF 與其他安全性防護。",
        "避免未授權請求或重複提交。",
      ],
    },
    {
      id: "browser-storage",
      title: "Local Storage 與 Session Storage",
      outline: [],
      paragraphs: [
        "星星日記可能使用 Local Storage 保存裝置端偏好，例如 PWA 安裝提示是否已關閉、目前介面偏好或不具敏感性的暫存狀態；Session Storage 可能用於單一瀏覽工作階段內的短效流程資訊。",
        "家庭的正式孩子、任務、星星、獎勵及成員權限資料以伺服器端 D1 資料為準，不以 Local Storage 作為唯一正式保存來源。星星日記不會將 Google 密碼、家長密碼明文或 OAuth 用戶端密鑰寫入瀏覽器儲存空間。",
      ],
    },
    {
      id: "pwa-cache",
      title: "PWA 與 Service Worker 快取",
      outline: [],
      paragraphs: [
        "為提供較快的第二次開啟速度及基本離線畫面，Service Worker 會快取 Logo、圖示、樣式、程式碼及其他靜態資源。家庭 API、登入回應及經常變動的私人頁面採網路優先或不快取策略，避免舊資料長時間覆蓋最新家庭狀態。",
        "新版程式可用時，系統可能提示使用者重新整理。更新快取不會刻意清除 Auth.js 登入工作階段。使用者亦可透過瀏覽器網站資料設定或移除並重新安裝 PWA 清除裝置端快取。",
      ],
    },
    {
      id: "third-party",
      title: "第三方技術",
      outline: [],
      paragraphs: [
        "Google 在 OAuth 登入流程中可能依其政策設定必要 Cookie；Cloudflare 可能為安全、網路傳輸與服務維運處理技術資訊。這些第三方依其各自政策處理資料，星星日記不會控制其所有 Cookie。",
        "目前星星日記沒有導入第三方廣告網路或跨網站行為追蹤工具。若日後導入非必要分析工具，將另行告知其名稱、目的、保存期間與拒絕方式。",
      ],
      links: [
        { label: "Google 隱私權政策", href: "https://policies.google.com/privacy" },
        { label: "Cloudflare 隱私權政策", href: "https://www.cloudflare.com/privacypolicy/" },
      ],
    },
    {
      id: "controls",
      title: "使用者控制方式",
      outline: [],
      paragraphs: [
        "使用者可透過瀏覽器設定查看、限制或刪除 Cookie 與網站資料，也可移除 PWA。刪除網站資料後可能需要重新登入，部分偏好設定及離線資源亦會重設。",
        "若瀏覽器完全封鎖必要 Cookie，Google 登入、邀請接受、家庭權限驗證或寫入資料等功能可能無法使用。這類影響是維持帳號安全所必要，而非拒絕非必要追蹤的懲罰。",
      ],
    },
    {
      id: "changes",
      title: "政策更新",
      outline: [],
      paragraphs: [
        "星星日記會依功能、第三方服務及法律要求更新本政策，並在本頁標示版本與最後更新日期。涉及使用者權益的重要變更，將以服務內合理方式告知。",
      ],
    },
  ],
};
