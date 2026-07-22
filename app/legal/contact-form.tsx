"use client";

import { useEffect, useState } from "react";

type FormStatus = "idle" | "loading" | "submitting" | "success" | "error";

const initialFields = {
  category: "bug",
  contactName: "",
  replyEmail: "",
  subject: "",
  message: "",
  privacyAccepted: false,
  website: "",
};

export function ContactForm() {
  const [csrfToken, setCsrfToken] = useState("");
  const [fields, setFields] = useState(initialFields);
  const [status, setStatus] = useState<FormStatus>("loading");
  const [feedback, setFeedback] = useState("");
  const [requestId, setRequestId] = useState("");

  async function prepareForm() {
    setStatus("loading");
    setFeedback("");
    try {
      const response = await fetch("/api/support", { cache: "no-store", credentials: "same-origin" });
      const data = await response.json() as { csrfToken?: string; error?: string };
      if (!response.ok || !data.csrfToken) throw new Error(data.error || "無法啟用客服表單");
      setCsrfToken(data.csrfToken);
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setFeedback(error instanceof Error ? error.message : "無法啟用客服表單，請稍後再試。");
    }
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/support", { cache: "no-store", credentials: "same-origin" })
      .then(async response => {
        const data = await response.json() as { csrfToken?: string; error?: string };
        if (!response.ok || !data.csrfToken) throw new Error(data.error || "無法啟用客服表單");
        if (!active) return;
        setCsrfToken(data.csrfToken);
        setStatus("idle");
      })
      .catch(error => {
        if (!active) return;
        setStatus("error");
        setFeedback(error instanceof Error ? error.message : "無法啟用客服表單，請稍後再試。");
      });
    return () => { active = false; };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken || status === "submitting") return;
    setStatus("submitting");
    setFeedback("");
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-star-diary-csrf": csrfToken },
        body: JSON.stringify(fields),
      });
      const data = await response.json() as { error?: string; message?: string; requestId?: string };
      if (!response.ok) throw new Error(data.error || "客服單送出失敗");
      setRequestId(data.requestId || "");
      setFeedback(data.message || "客服單已送出。");
      setFields(initialFields);
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setFeedback(error instanceof Error ? error.message : "客服單送出失敗，請稍後再試。");
    }
  }

  return <section className="legal-contact-form" aria-labelledby="legal-contact-form-title">
    <header>
      <p className="legal-kicker">SUPPORT REQUEST</p>
      <h2 id="legal-contact-form-title">站內客服表單</h2>
      <p>請勿填入任何密碼、Secret、API Key 或完整邀請連結。</p>
    </header>

    {status === "success" ? <div className="legal-form-success" role="status">
      <strong>✓ {feedback}</strong>
      {requestId ? <p>客服單編號：<code>{requestId}</code></p> : null}
      <button type="button" onClick={() => { setRequestId(""); void prepareForm(); }}>再送一筆</button>
    </div> : <form onSubmit={submit}>
      <label>客服分類
        <select value={fields.category} onChange={event => setFields(current => ({ ...current, category: event.target.value }))}>
          <option value="bug">Bug</option>
          <option value="feature">功能建議</option>
          <option value="remote_support">遠端協助</option>
          <option value="partnership">合作提案</option>
          <option value="other">其他</option>
        </select>
      </label>
      <div className="legal-form-row">
        <label>聯絡名稱<input required maxLength={80} autoComplete="name" value={fields.contactName} onChange={event => setFields(current => ({ ...current, contactName: event.target.value }))}/></label>
        <label>回覆 Email<input required maxLength={254} type="email" autoComplete="email" inputMode="email" value={fields.replyEmail} onChange={event => setFields(current => ({ ...current, replyEmail: event.target.value }))}/></label>
      </div>
      <label>主旨<input required minLength={3} maxLength={120} value={fields.subject} onChange={event => setFields(current => ({ ...current, subject: event.target.value }))}/></label>
      <label>問題說明<textarea required minLength={10} maxLength={3000} rows={7} value={fields.message} onChange={event => setFields(current => ({ ...current, message: event.target.value }))}/><small>{fields.message.length}/3000</small></label>
      <label className="legal-form-honeypot" aria-hidden="true">網站<input tabIndex={-1} autoComplete="off" value={fields.website} onChange={event => setFields(current => ({ ...current, website: event.target.value }))}/></label>
      {fields.category === "remote_support" ? <p className="legal-form-note">提交客服單不會授予管理員查看家庭內容的權限；如確有需要，會再說明範圍並請 Owner 明確授權。</p> : null}
      <label className="legal-form-consent"><input required type="checkbox" checked={fields.privacyAccepted} onChange={event => setFields(current => ({ ...current, privacyAccepted: event.target.checked }))}/><span>我已閱讀本頁客服資料處理說明，並同意為處理本次詢問使用所填資料。</span></label>
      {feedback ? <p className="legal-form-error" role="alert">{feedback}</p> : null}
      <div className="legal-form-actions">
        {status === "error" && !csrfToken ? <button type="button" onClick={() => void prepareForm()}>重新載入表單</button> : null}
        <button className="primary" type="submit" disabled={!csrfToken || status === "loading" || status === "submitting" || !fields.privacyAccepted}>{status === "submitting" ? "送出中…" : status === "loading" ? "表單載入中…" : "送出客服單"}</button>
      </div>
    </form>}
  </section>;
}
