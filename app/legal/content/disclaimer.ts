import { LEGAL_CENTER_VERSION, LEGAL_LAST_UPDATED } from "./config";
import type { LegalDocument } from "./types";

export const disclaimer: LegalDocument = {
  slug: "disclaimer",
  title: "免責聲明",
  englishTitle: "Disclaimer",
  description: "說明星星日記的服務性質、第三方依賴、合理風險與營運者仍應負的責任。",
  version: LEGAL_CENTER_VERSION,
  lastUpdated: LEGAL_LAST_UPDATED,
  effectiveDate: "2026-07-22",
  status: "effective",
  readingMinutes: 5,
  summary: [
    "星星日記是家庭習慣與獎勵管理工具，不取代醫療、心理、教育、法律或財務專業意見。",
    "Google、Cloudflare、網路、瀏覽器或裝置故障可能造成登入失敗、延遲或暫時中斷。",
    "本聲明不排除依法不得排除的責任，星星日記仍會採合理安全與修復措施。",
  ],
  sections: [
    {
      id: "service-nature",
      title: "服務性質",
      outline: [],
      paragraphs: [
        "星星日記協助家庭記錄任務、星星與獎勵。家長應依孩子年齡、需求及家庭情況自行判斷任務與獎勵是否適合。官方任務庫僅為可修改的內容建議，不構成專業教育、醫療、心理或行為治療建議。",
      ],
    },
    {
      id: "availability",
      title: "服務可用性",
      outline: [],
      paragraphs: [
        "星星日記會盡合理努力維持服務可用與資料正確，但無法保證服務永不中斷、所有裝置表現一致或任何錯誤可立即修復。例行維護、安全更新、功能部署及不可預見事件可能造成短暫中斷。",
        "如發現統計、星星餘額或同步結果異常，使用者應停止進一步高影響操作並透過客服表單提供必要資訊，以利查核。",
      ],
    },
    {
      id: "third-party",
      title: "第三方服務與外部環境",
      outline: [],
      paragraphs: [
        "Google OAuth、Cloudflare、網際網路服務供應商、瀏覽器、作業系統及使用者裝置由不同供應者控制。其故障、政策變更、網路品質、Cookie 設定、儲存空間不足或舊版瀏覽器限制，可能導致登入失敗、圖片延遲、PWA 更新延遲、資料同步延遲或服務中斷。",
        "星星日記會就自身可控制的程式與設定盡力診斷及修復，但不能代替第三方承諾其服務不中斷，也不對第三方獨立行為作無限制保證。",
      ],
    },
    {
      id: "user-responsibility",
      title: "使用者注意事項",
      outline: [],
      bullets: [
        "確認目前選擇的孩子、日期、星星數與操作內容後再儲存。",
        "妥善保護 Google 帳號、家長模式密碼及邀請連結。",
        "避免在不可信任的共用裝置保持 Owner 或 Parent 登入。",
        "重要家庭決策不應只依賴單一統計圖表或自動建議。",
      ],
    },
    {
      id: "liability",
      title: "責任限制的合理範圍",
      outline: [],
      paragraphs: [
        "在適用法律允許的範圍內，對於非由星星日記故意或重大過失直接造成的間接、附帶或衍生損失，責任得受合理限制。但本聲明不排除消費者依法享有的權利，也不免除因故意、重大過失、個人資料違法處理或其他法律不得預先排除的責任。",
      ],
    },
    {
      id: "incident",
      title: "問題回報與修復",
      outline: [],
      paragraphs: [
        "遇到服務問題時，請透過聯絡頁提供發生時間、裝置與瀏覽器、操作步驟及非敏感截圖。請勿提交 Google 密碼、OAuth 密鑰、家長密碼或完整邀請 token。星星日記會依影響程度安排處理與必要通知。",
      ],
    },
  ],
};
