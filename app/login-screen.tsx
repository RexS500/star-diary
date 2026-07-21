"use client";

import { signIn, signOut } from "next-auth/react";
import { useState } from "react";
import { authCallbackPath } from "./auth-intent";

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "此 Google 帳號目前無法登入。",
  Configuration: "登入服務尚未完成設定，請聯絡網站管理者。",
  OAuthCallback: "Google 登入回傳失敗，請重新嘗試。",
  OAuthSignin: "無法開啟 Google 登入，請稍後再試。",
  OAuthAccountNotLinked: "此 Email 已連結其他登入方式。",
  Verification: "登入連結已失效，請重新登入。",
};

export function LoginScreen({ errorCode = "" }: { errorCode?: string }) {
  const [busy, setBusy] = useState<"create_family" | "sign_in" | "">("");
  const [localError, setLocalError] = useState("");
  const error = localError || (errorCode ? ERROR_MESSAGES[errorCode] || "Google 登入失敗，請重新嘗試。" : "");
  function googleLogin(intent: "create_family" | "sign_in") {
    setLocalError("");
    setBusy(intent);
    void signIn("google", { callbackUrl: authCallbackPath(intent) }, { prompt: "select_account" })
      .catch(() => {
        setBusy("");
        setLocalError("Google 登入失敗，請檢查網路後再試一次。");
      });
  }
  return <main className="account-login-page">
    <section className="account-login-card" aria-labelledby="account-login-title">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/star-diary-logo.jpg" alt="" width={112} height={112}/>
      <p className="eyebrow">FAMILY STAR JOURNAL</p>
      <h1 id="account-login-title">星星日記</h1>
      <p>使用 Google 帳號安全保存家庭的任務、星星與獎勵紀錄。</p>
      {error && <p className="account-login-error" role="alert">{error}</p>}
      <div className="login-choice-grid">
        <section className="login-choice login-choice-new">
          <span aria-hidden="true">✨</span>
          <h2>第一次使用星星日記？</h2>
          <p>使用 Google 帳號建立新的家庭，建立者會成為 Owner，之後可以邀請其他家長與孩子。</p>
          <button type="button" className="google-login-button" disabled={Boolean(busy)} onClick={() => googleLogin("create_family")}><b aria-hidden="true">G</b>{busy === "create_family" ? "正在前往 Google…" : "建立新的星星日記家庭"}</button>
        </section>
        <section className="login-choice">
          <span aria-hidden="true">👨‍👩‍👧‍👦</span>
          <h2>已經是家庭成員？</h2>
          <p>使用原本加入家庭的 Google 帳號登入。若帳號尚未加入家庭，系統不會自動建立空白家庭。</p>
          <button type="button" className="google-login-button secondary-google" disabled={Boolean(busy)} onClick={() => googleLogin("sign_in")}><b aria-hidden="true">G</b>{busy === "sign_in" ? "正在前往 Google…" : "登入既有家庭"}</button>
        </section>
      </div>
      <aside className="login-invite-help"><strong>收到家庭邀請？</strong><span>請直接開啟家長傳給你的邀請網址，並在 10 分鐘內使用 Google 帳號登入。</span></aside>
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
