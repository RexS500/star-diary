import { LEGAL_CENTER_VERSION, LEGAL_LAST_UPDATED } from "./config";
import type { LegalDocument } from "./types";

export const contactPolicy: LegalDocument = {
  slug: "contact",
  title: "聯絡我們",
  englishTitle: "Contact Us",
  description: "透過站內客服表單回報問題、提出建議、申請遠端協助或洽談合作。",
  version: LEGAL_CENTER_VERSION,
  lastUpdated: LEGAL_LAST_UPDATED,
  effectiveDate: "2026-07-22",
  status: "effective",
  readingMinutes: 5,
  summary: [
    "客服分類包含 Bug、功能建議、遠端協助、合作提案及其他。",
    "請只提供處理問題所需資料，不要提交密碼、OAuth Secret、API Key 或完整邀請 token。",
    "選擇遠端協助不等於授權管理員查看家庭內容；必要時仍須另行明確授權。",
  ],
  sections: [
    {
      id: "categories",
      title: "客服分類",
      outline: [],
      bullets: [
        "Bug：功能錯誤、資料顯示異常、登入或同步問題。",
        "功能建議：提出新功能或使用體驗改善方向。",
        "遠端協助：需要營運人員協助診斷特定家庭問題。",
        "合作提案：商務、教育或產品合作。",
        "其他：無法歸入以上類型的詢問。",
      ],
    },
    {
      id: "form",
      title: "客服表單與必要資料",
      outline: [],
      paragraphs: [
        "客服表單會要求分類、聯絡名稱、回覆電子郵件、主旨及問題說明。若使用者已登入，系統可將客服單與目前使用者及家庭識別碼關聯，以便在獲得必要授權後診斷問題；未登入者亦可提交一般詢問。",
        "為防止濫用及調查錯誤，系統可能保存提交時間、瀏覽器 User-Agent、經單向雜湊處理的網路識別資訊及客服單狀態。客服單內容只用於回覆、修復、資安與品質改善。",
      ],
    },
    {
      id: "safe-reporting",
      title: "安全回報方式",
      outline: [],
      bullets: [
        "可提供：錯誤發生時間、裝置與瀏覽器、操作步驟、錯誤文字及已遮蔽敏感資訊的截圖。",
        "請勿提供：Google 密碼、家長密碼、AUTH_SECRET、Google OAuth Secret、Cloudflare API Token、完整邀請連結或信用卡資料。",
        "孩子照片或家庭紀錄僅在確實需要且家長理解目的時提供；請優先遮蔽不相關內容。",
      ],
    },
    {
      id: "remote-support",
      title: "遠端協助與管理員存取",
      outline: [],
      paragraphs: [
        "提交「遠端協助」客服單本身不會授予管理員查看私人家庭內容的權限。若診斷確實需要查看必要資料，星星日記應說明目的、範圍與期限，並由 Owner 或有權家長透過專用支援授權機制明確同意。",
        "授權應採最小範圍、限時及可撤銷原則，相關高風險管理操作應留下稽核紀錄。管理員不得因好奇、測試便利或與案件無關的目的存取家庭內容。",
      ],
    },
    {
      id: "handling",
      title: "處理方式與回覆",
      outline: [],
      paragraphs: [
        "客服單會依安全性、資料正確性與影響人數安排優先順序。星星日記會合理努力回覆，但在尚未公布正式服務水準前，不承諾固定回覆時限。若資料不足，可能請使用者補充資訊。",
        "功能建議可能被納入產品規劃，但提交建議不表示一定採用，也不因此建立報酬或共同著作關係。合作提案會依實際營運能力評估。",
      ],
    },
    {
      id: "privacy",
      title: "客服資料保存與權利",
      outline: [],
      paragraphs: [
        "客服資料保留至案件結束及合理的除錯、稽核或爭議處理期間；超過目的所需或依法應刪除時，將刪除或去識別化。若客服資料需提供 Google、Cloudflare 或其他服務商協助，會以必要範圍為限。",
        "使用者可透過新的客服單請求查詢、更正或刪除其客服資料；星星日記會先採合理方式核對身分。法律要求或安全稽核所需資料可能在必要期間內保留。",
      ],
    },
  ],
};
