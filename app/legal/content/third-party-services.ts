import { LEGAL_CENTER_VERSION, LEGAL_LAST_UPDATED } from "./config";
import type { LegalDocument } from "./types";

export const thirdPartyServices: LegalDocument = {
  slug: "third-party-services",
  title: "第三方服務說明",
  englishTitle: "Third-party Services",
  description: "說明星星日記實際使用的 Google 與 Cloudflare 服務、用途及資料流向。",
  version: LEGAL_CENTER_VERSION,
  lastUpdated: LEGAL_LAST_UPDATED,
  effectiveDate: "2026-07-22",
  status: "effective",
  readingMinutes: 7,
  summary: [
    "Google 用於安全登入；Cloudflare Workers、D1 與 R2 用於執行網站、保存結構化資料與處理後圖片。",
    "星星日記只使用提供現有功能所需的服務，不會聲稱第三方完全受星星日記控制。",
    "資料可能在第三方全球基礎設施中跨境處理；星星日記會採必要性與安全性原則管理。",
  ],
  sections: [
    {
      id: "google",
      title: "Google OAuth",
      outline: [],
      paragraphs: [
        "星星日記使用 Google OAuth 驗證使用者身分。登入時，使用者會在 Google 管理的畫面選擇帳號及確認授權；星星日記不會取得或保存 Google 密碼。",
        "依目前登入範圍，星星日記主要接收 Google 帳號識別碼、顯示名稱、電子郵件地址及個人資料圖片等基本資料，用於建立或辨識使用者、關聯家庭成員及顯示帳號資訊。星星日記目前不要求 Gmail、Google Drive、日曆或聯絡人內容權限。",
        "Google 會依其政策處理 OAuth 與帳號資料。使用者撤銷 Google 授權後，既有服務資料不一定自動刪除；若希望刪除星星日記家庭資料，仍應使用服務內刪除功能或客服管道。",
      ],
      links: [
        { label: "Google OAuth 2.0 說明", href: "https://developers.google.com/identity/protocols/oauth2" },
        { label: "Google API Services 使用者資料政策", href: "https://developers.google.com/terms/api-services-user-data-policy" },
        { label: "Google 隱私權政策", href: "https://policies.google.com/privacy" },
      ],
    },
    {
      id: "workers",
      title: "Cloudflare Workers",
      outline: [],
      paragraphs: [
        "Cloudflare Workers 執行星星日記網站與 API，處理登入後請求、家庭權限驗證、資料讀寫、圖片上傳及 PWA 靜態資源傳送。為提供網路安全與維運，Cloudflare 可能處理 IP 位址、User-Agent、請求時間、路由、錯誤及其他連線中繼資料。",
        "家庭 API 會由後端依登入者 membership 與角色重新驗證，不能只因前端知道資料識別碼而跨家庭讀取。",
      ],
    },
    {
      id: "d1",
      title: "Cloudflare D1",
      outline: [],
      paragraphs: [
        "Cloudflare D1 用於保存帳號與家庭關聯、孩子資料、任務、星星、獎勵、兌換、邀請、設定、稽核與必要營運紀錄等結構化資料。資料依 family_id 等關聯欄位隔離，並由伺服器端權限規則限制存取。",
        "為維護正確性與安全性，星星日記可能保留必要的資料庫備份、migration 紀錄與錯誤紀錄。實際保存期間依資料性質、使用者刪除操作、法律義務及備份週期決定。",
      ],
    },
    {
      id: "r2",
      title: "Cloudflare R2",
      outline: [],
      paragraphs: [
        "Cloudflare R2 用於保存使用者選擇上傳後，已在瀏覽器端裁切、縮放或壓縮的孩子頭像、獎勵圖片及其他目前支援的家庭圖片。星星日記不會把裝置中的原始圖片檔案另行上傳保存。",
        "R2 物件以家庭命名空間及資料庫紀錄關聯。家庭永久刪除時，系統會安排刪除該家庭對應物件；若個別物件清理失敗，會記錄必要資訊供後續重試，不會因此誤刪其他家庭圖片。",
      ],
    },
    {
      id: "pwa",
      title: "PWA、瀏覽器與作業系統",
      outline: [],
      paragraphs: [
        "PWA 是由瀏覽器與作業系統提供的安裝及快取能力，不是額外的資料託管商。裝置可能保存 App 圖示、靜態快取及介面偏好；推送通知目前不是星星日記既有功能。",
        "Safari、Chrome、Edge、Firefox、iOS、iPadOS、Android、Windows 或 macOS 的行為及限制由其供應者控制，可能影響登入、加入主畫面、離線快取或更新速度。",
      ],
    },
    {
      id: "international",
      title: "資料流向與跨境處理",
      outline: [],
      paragraphs: [
        "Google 與 Cloudflare 經營全球基礎設施，資料可能在臺灣以外地區傳輸、備援或處理。星星日記選用第三方服務時，會考量其安全措施、公開政策及服務必要性，並以提供服務所需範圍為限。",
        "第三方服務的獨立處理行為、法令遵循及事故通知由其依契約與政策負責；星星日記仍會就自身可控制的設定、權限、資料最小化及事件處理負責。",
      ],
      links: [
        { label: "Cloudflare 隱私權政策", href: "https://www.cloudflare.com/privacypolicy/" },
        { label: "Cloudflare 資料處理附約", href: "https://www.cloudflare.com/cloudflare-customer-dpa/" },
      ],
    },
    {
      id: "changes",
      title: "服務異動",
      outline: [],
      paragraphs: [
        "若星星日記新增會實質影響資料處理的第三方服務，將更新本頁與隱私權政策。僅有程式套件更新而未改變資料用途時，可能不逐項列出每一個開源相依套件。",
      ],
    },
  ],
};
