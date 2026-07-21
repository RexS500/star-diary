"use client";

/* eslint-disable @next/next/no-img-element */

import { signOut } from "next-auth/react";
import { useState } from "react";
import { authCallbackPath, type AuthIntent } from "./auth-intent";

type SignedInUser = { email: string; name: string | null; image: string | null };

function AccountBar({ account }: { account: SignedInUser }) {
  return <header className="onboarding-account-bar">
    <div>
      {account.image && <img src={account.image} alt="" referrerPolicy="no-referrer"/>}
      <span><strong>{account.name || "Google 使用者"}</strong><small>{account.email}</small></span>
    </div>
    <button type="button" onClick={() => void signOut({ callbackUrl: "/" })}>切換帳號</button>
  </header>;
}

export function NoFamilyAccount({ account, intent }: { account: SignedInUser; intent: AuthIntent }) {
  if (intent === "create_family") return <NewFamilyOnboarding account={account}/>;
  return <NoFamilyMembership account={account}/>;
}

function NoFamilyMembership({ account }: { account: SignedInUser }) {
  const [showInviteHelp, setShowInviteHelp] = useState(false);
  return <main className="family-onboarding-page">
    <AccountBar account={account}/>
    <section className="family-onboarding-card no-family-card">
      <img src="/star-diary-logo.jpg" alt="" width={92} height={92}/>
      <p className="eyebrow">ACCOUNT READY</p>
      <h1>這個帳號尚未加入家庭</h1>
      <p>Google 登入已完成，但星星日記不會自動替你建立空白家庭。</p>
      <div className="no-family-actions">
        <button type="button" className="primary" onClick={() => window.location.assign(authCallbackPath("create_family"))}>建立新的家庭</button>
        <button type="button" className="secondary" onClick={() => setShowInviteHelp(value => !value)}>我有邀請連結</button>
      </div>
      {showInviteHelp && <p className="invite-link-help" role="status">請回到 LINE、訊息或 Email，重新開啟家長傳給你的邀請網址，再使用這個 Google 帳號接受邀請。</p>}
    </section>
  </main>;
}

function NewFamilyOnboarding({ account }: { account: SignedInUser }) {
  const suggestedName = account.name?.trim() ? `${account.name.trim().slice(0, 70)} 的家庭` : "我的家庭";
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [familyName, setFamilyName] = useState(suggestedName);
  const [childName, setChildName] = useState("");
  const [childGender, setChildGender] = useState<"boy" | "girl">("boy");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function nextStep() {
    if (!familyName.trim()) return setError("請輸入家庭名稱");
    setError("");
    setStep(2);
  }
  async function createFamily() {
    if (!childName.trim()) return setError("請輸入第一位孩子的姓名");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create_family", familyName, childName, childGender }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        if (response.status === 409) {
          window.location.replace("/");
          return;
        }
        throw new Error(result.error || "建立家庭失敗");
      }
      setStep(3);
    } catch (value) {
      setError(value instanceof Error ? value.message : "建立家庭失敗，請檢查網路後再試。");
    } finally {
      setBusy(false);
    }
  }

  return <main className="family-onboarding-page">
    <AccountBar account={account}/>
    <section className="family-onboarding-card new-family-wizard" aria-busy={busy}>
      <img src="/star-diary-logo.jpg" alt="" width={92} height={92}/>
      <p className="eyebrow">NEW FAMILY · {step}/3</p>
      {step === 1 && <>
        <h1>建立新的星星日記家庭</h1>
        <p>建立完成後，你會成為 Owner，並可邀請其他家長與孩子。</p>
        <label>家庭名稱<input value={familyName} maxLength={80} autoFocus onChange={event => { setFamilyName(event.target.value); setError(""); }}/></label>
        {error && <p className="account-login-error" role="alert">{error}</p>}
        <button type="button" className="primary" onClick={nextStep}>下一步：新增孩子</button>
      </>}
      {step === 2 && <>
        <h1>新增第一位孩子</h1>
        <p>只需填寫基本資料；頭像、任務與獎勵之後都可以再設定。</p>
        <label>孩子姓名<input value={childName} maxLength={40} autoFocus placeholder="例如：Vanessa" onChange={event => { setChildName(event.target.value); setError(""); }}/></label>
        <fieldset className="onboarding-gender"><legend>預設頭像</legend><button type="button" aria-pressed={childGender === "boy"} onClick={() => setChildGender("boy")}>👦 男生</button><button type="button" aria-pressed={childGender === "girl"} onClick={() => setChildGender("girl")}>👧 女生</button></fieldset>
        {error && <p className="account-login-error" role="alert">{error}</p>}
        <div className="wizard-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setStep(1)}>上一步</button><button type="button" className="primary" disabled={busy} onClick={() => void createFamily()}>{busy ? "建立中…" : "確認建立家庭"}</button></div>
      </>}
      {step === 3 && <>
        <div className="onboarding-complete-icon" aria-hidden="true">✓</div>
        <h1>你的星星日記已建立完成</h1>
        <p>現在可以直接使用，也可以先設定每日任務。</p>
        <div className="no-family-actions"><button type="button" className="primary" onClick={() => window.location.replace("/?setup=dailyTasks")}>開始設定任務</button><button type="button" className="secondary" onClick={() => window.location.replace("/")}>前往首頁</button></div>
      </>}
    </section>
  </main>;
}
