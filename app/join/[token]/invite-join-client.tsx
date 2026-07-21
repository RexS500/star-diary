"use client";

import { signIn } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";

type InvitationView = {
  familyName: string;
  role: "parent" | "child";
  childName: string | null;
  childAccountMode: "personal" | "shared" | null;
  operableChildNames: string[];
  expiresAt: string;
};

function countdownLabel(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function InviteJoinClient({
  token,
  invitation,
  authenticated,
}: {
  token: string;
  invitation: InvitationView;
  authenticated: boolean;
}) {
  const [remaining, setRemaining] = useState(() => Date.parse(invitation.expiresAt) - Date.now());
  const [busy, setBusy] = useState(authenticated);
  const [error, setError] = useState("");
  const accepted = useRef(false);
  const expired = remaining <= 0;
  const callbackUrl = useMemo(() => `/join/${token}`, [token]);

  useEffect(() => {
    const update = () => setRemaining(Date.parse(invitation.expiresAt) - Date.now());
    const timer = window.setInterval(update, 1000);
    update();
    return () => window.clearInterval(timer);
  }, [invitation.expiresAt]);

  useEffect(() => {
    if (!authenticated || accepted.current || expired) return;
    accepted.current = true;
    setBusy(true);
    void fetch(`/api/invitations/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    }).then(async response => {
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "無法接受邀請");
      window.location.replace("/");
    }).catch(value => {
      setError(value instanceof Error ? value.message : "無法接受邀請");
      setBusy(false);
    });
  }, [authenticated, expired, token]);

  return <main className="invite-join-page">
    <section className="invite-join-card" aria-busy={busy}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/star-diary-logo.jpg" alt="" width={96} height={96}/>
      <p className="eyebrow">FAMILY INVITATION</p>
      <h1>加入星星日記家庭</h1>
      <div className="invite-join-summary">
        <p>你將加入<strong>{invitation.familyName}</strong></p>
        <p>角色<strong>{invitation.role === "parent" ? "Parent" : "Child"}</strong></p>
        {invitation.role === "child" && <p>帳號模式<strong>{invitation.childAccountMode === "shared" ? "家庭共用帳號" : "個人孩子帳號"}</strong></p>}
        {invitation.role === "child" && invitation.childAccountMode === "personal" && <p>綁定孩子<strong>{invitation.childName}</strong></p>}
        {invitation.role === "child" && invitation.childAccountMode === "shared" && <p>可操作孩子<strong>{invitation.operableChildNames.join("、") || "目前僅可查看"}</strong></p>}
        <p>邀請剩餘時間<strong className={expired ? "is-expired" : ""}>{expired ? "已失效" : countdownLabel(remaining)}</strong></p>
      </div>
      {error && <p className="account-login-error" role="alert">{error}</p>}
      {!authenticated && <button
        type="button"
        className="google-login-button"
        disabled={busy || expired}
        onClick={() => {
          setBusy(true);
          void signIn("google", { callbackUrl }, { prompt: "select_account" }).catch(() => setBusy(false));
        }}
      >
        <span aria-hidden="true">G</span>
        {expired ? "邀請已失效" : busy ? "正在前往 Google…" : "使用 Google 帳號登入"}
      </button>}
      {authenticated && !error && <p className="invite-accepting" role="status">{expired ? "邀請已失效" : "正在確認家庭資格與權限…"}</p>}
      <small>角色、帳號模式、綁定孩子與權限均由邀請決定，接受邀請者無法自行更換。</small>
    </section>
  </main>;
}
