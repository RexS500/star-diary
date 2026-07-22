import { LEGAL_CENTER_VERSION, LEGAL_LAST_UPDATED } from "./config";
import type { LegalDocument } from "./types";

export const copyrightPolicy: LegalDocument = {
  slug: "copyright",
  title: "智慧財產權聲明",
  englishTitle: "Copyright & Intellectual Property",
  description: "說明星星日記品牌、程式、介面、文件與使用者內容的權利歸屬及合理使用範圍。",
  version: LEGAL_CENTER_VERSION,
  lastUpdated: LEGAL_LAST_UPDATED,
  effectiveDate: "2026-07-22",
  status: "effective",
  readingMinutes: 5,
  summary: [
    "星星日記的品牌識別、原創程式、介面設計與文件依法受保護。",
    "使用者仍保有自己上傳圖片與輸入家庭內容的權利，並授予提供服務所必要的有限使用權。",
    "開源套件、第三方商標與服務各依其權利人及授權條款處理。",
  ],
  sections: [
    {
      id: "service-ip",
      title: "服務智慧財產",
      outline: [],
      paragraphs: [
        "Family Star Diary、星星日記、Logo、原創視覺、使用者介面、程式碼、資料結構、文件文字及其他具原創性的成果，除另有標示外，由 Family Star Diary（星星日記）的實際開發維運者或合法授權人享有著作權、商標權或其他智慧財產權。未來營運主體改變時，不影響既有權利人或合法受讓人的權利。",
        "本聲明不主張法律不予保護的抽象概念、一般方法、事實或公有領域內容；權利範圍仍以適用法律為準。",
      ],
    },
    {
      id: "license",
      title: "使用者的服務使用權",
      outline: [],
      paragraphs: [
        "在遵守服務條款的前提下，使用者取得可撤回、非專屬、不可轉讓、限個人或家庭使用的服務存取權。此授權不表示移轉任何程式碼、品牌或平台內容的所有權。",
      ],
      bullets: [
        "不得擅自重製、改作或散布星星日記的整體網站、程式或文件。",
        "不得移除權利標示、冒用品牌或使他人誤認為官方服務。",
        "不得未經同意將服務、介面或資料庫內容用於轉售、出租或其他商業利用。",
        "不得規避安全措施、反向工程非公開部分或大量自動擷取服務內容，但法律明確允許者除外。",
      ],
    },
    {
      id: "user-content",
      title: "使用者內容",
      outline: [],
      paragraphs: [
        "使用者對其合法上傳的圖片、任務名稱、獎勵名稱、備註及其他原創內容仍保有原有權利。使用者保證有權上傳及使用該內容，且不侵害他人的著作權、肖像權、隱私權或其他權利。",
        "為提供圖片顯示、資料同步、備份、壓縮、轉換及使用者要求的客服處理，使用者授予星星日記一項非專屬、免權利金、限服務目的且隨資料刪除義務受限制的使用權。星星日記不會因此取得將家庭內容獨立販售或公開展示的權利。",
      ],
    },
    {
      id: "third-party",
      title: "第三方權利與開源軟體",
      outline: [],
      paragraphs: [
        "Google、Cloudflare、瀏覽器與作業系統名稱、商標及服務屬各權利人所有。星星日記使用的開源套件依其個別授權條款提供，本聲明不取代該等授權。",
      ],
    },
    {
      id: "reporting",
      title: "權利通知",
      outline: [],
      paragraphs: [
        "若認為星星日記中的內容侵害您的智慧財產權，請透過站內聯絡表單選擇「其他」，提供權利人身分、受保護作品、疑似侵權位置、權利依據及可聯絡方式。星星日記會在合理範圍內查核並採取適當措施。",
      ],
    },
  ],
};
