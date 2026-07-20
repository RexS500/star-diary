"use client";

import { signIn, signOut } from "next-auth/react";
import { useState } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "此 Google 帳號目前無法登入。",
  Configuration: "登入服務尚未完成設定，請聯絡網站管理者。",
  OAuthCallback: "Google 登入回傳失敗，請重新嘗試。",
  OAuthSignin: "無法開啟 Google 登入，請稍後再試。",
  OAuthAccountNotLinked: "此 Email 已連結其他登入方式。",
  Verification: "登入連結已失效，請重新登入。",
};

export function LoginScreen({ errorCode = "" }: { errorCode?: string }) {
  const [busy, setBusy] = useState(false);
  const error = errorCode ? ERROR_MESSAGES[errorCode] || "Google 登入失敗，請重新嘗試。" : "";
  return <main className="account-login-page">
    <section className="account-login-card" aria-labelledby="account-login-title">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/star-diary-logo.jpg" alt="" width={112} height={112}/>
      <p className="eyebrow">FAMILY STAR JOURNAL</p>
      <h1 id="account-login-title">星星日記</h1>
      <p>使用 Google 帳號登入，安全保存家庭紀錄；不同家庭的孩子、星星與照片彼此隔離。</p>
      {error && <p className="account-login-error" role="alert">{error}</p>}
      <button
        type="button"
        className="google-login-button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void signIn("google", { callbackUrl: "/" }, { prompt: "select_account" }).catch(() => setBusy(false));
        }}
      >
        <span aria-hidden="true">G</span>
        {busy ? "正在前往 Google…" : "使用 Google 帳號登入"}
      </button>
      <small>登入後可在其他手機或電腦繼續使用同一個家庭。</small>
    </section>
  </main>;
}

export function AccountAccessError({ email, message }: { email: string; message: string }) {
  return <main className="account-login-page">
    <section className="account-login-card" role="alert">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/star-diary-logo.jpg" alt="" width={112} height={112}/>
      <p className="eyebrow">ACCOUNT ACCESS</p>
      <h1>目前無法開啟家庭資料</h1>
      <p>{message}</p>
      <small>{email}</small>
      <button type="button" className="google-login-button" onClick={() => void signOut({ callbackUrl: "/" })}>
        登出並更換 Google 帳號
      </button>
    </section>
  </main>;
}
