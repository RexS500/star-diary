"use client";

import { signOut } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import {
  canRemoveFamilyMember,
  effectiveInvitationStatus,
  isFamilyManager,
  normalizeChildPermissions,
  permissionPresetFor,
  type ChildPermission,
  type FamilyMemberRole,
  type InvitationRole,
  type InvitationStatus,
  type PermissionPreset,
} from "./account-management-logic";

type ChildSummary = { id: string; name: string };
type MemberView = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: FamilyMemberRole;
  childId: string | null;
  childName: string | null;
  joinedAt: string;
  status: "active" | "disabled";
  permissions: ChildPermission[];
};
type InvitationView = {
  id: string;
  familyName: string;
  role: InvitationRole;
  childId: string | null;
  childName: string | null;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  cancelledAt: string | null;
  inviteUrl?: string;
};
type AccountSnapshot = {
  family: { id: string; name: string };
  currentUser: { id: string; role: FamilyMemberRole };
  children: ChildSummary[];
  members: MemberView[];
  activeInvitations: InvitationView[];
  invitationHistory: InvitationView[];
  familyExit: {
    memberCount: number;
    isEmpty: boolean;
    canLeave: boolean;
    canDeleteEmptyFamily: boolean;
    blockedReason: string | null;
  };
};

const roleLabel: Record<FamilyMemberRole, string> = { owner: "Owner", parent: "Parent", child: "Child" };
const statusLabel: Record<InvitationStatus, string> = { pending: "有效", accepted: "已使用", expired: "已失效", cancelled: "已取消" };

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function countdownLabel(expiresAt: string, now: number) {
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function AccountManagement({ onMessage }: { onMessage: (message: string) => void }) {
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [clock, setClock] = useState(0);
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteRole, setInviteRole] = useState<InvitationRole>("parent");
  const [inviteChildId, setInviteChildId] = useState("");
  const [permissionMember, setPermissionMember] = useState<MemberView | null>(null);
  const [permissionPreset, setPermissionPreset] = useState<PermissionPreset>("only_self");
  const [customPermissions, setCustomPermissions] = useState<ChildPermission[]>([]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/account?t=${Date.now()}`, { cache: "no-store" });
      const result = await response.json() as AccountSnapshot & { error?: string };
      if (!response.ok) throw new Error(result.error || "無法讀取帳號資料");
      setSnapshot(result);
      setInviteChildId(current => current || result.children[0]?.id || "");
    } catch (value) {
      setError(value instanceof Error ? value.message : "無法讀取帳號資料");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void fetch(`/api/account?t=${Date.now()}`, { cache: "no-store" })
      .then(async response => {
        const result = await response.json() as AccountSnapshot & { error?: string };
        if (!response.ok) throw new Error(result.error || "無法讀取帳號資料");
        if (!active) return;
        setSnapshot(result);
        setInviteChildId(result.children[0]?.id || "");
      })
      .catch(value => { if (active) setError(value instanceof Error ? value.message : "無法讀取帳號資料"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => setClock(Date.now()), 0);
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);

  const invitations = useMemo(() => snapshot ? [...snapshot.activeInvitations, ...snapshot.invitationHistory].map(invitation => ({
    ...invitation,
    status: effectiveInvitationStatus(invitation.status, invitation.expiresAt, clock),
  })) : [], [clock, snapshot]);
  const activeInvitations = invitations.filter(invitation => invitation.status === "pending");
  const invitationHistory = invitations.filter(invitation => invitation.status !== "pending");

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/account", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json() as { error?: string; invitation?: InvitationView; permissions?: ChildPermission[]; signedOut?: boolean };
    if (!response.ok) throw new Error(result.error || "操作失敗");
    return result;
  }

  async function createInvitation() {
    if (inviteRole === "child" && !inviteChildId) return setError("請選擇要綁定的孩子");
    setBusy("create");
    setError("");
    try {
      const result = await post({ action: "create_invitation", role: inviteRole, childId: inviteRole === "child" ? inviteChildId : undefined });
      if (!result.invitation) throw new Error("邀請建立失敗");
      setSnapshot(current => current ? { ...current, activeInvitations: [result.invitation!, ...current.activeInvitations] } : current);
      setInviteModal(false);
      onMessage("邀請已建立，請在 10 分鐘內分享");
    } catch (value) {
      setError(value instanceof Error ? value.message : "邀請建立失敗");
    } finally {
      setBusy("");
    }
  }

  async function copyInvitation(invitation: InvitationView, announce = true) {
    if (!invitation.inviteUrl) return onMessage("邀請連結只在建立當下顯示；請取消後重新建立");
    try {
      await navigator.clipboard.writeText(invitation.inviteUrl);
      if (announce) onMessage("邀請連結已複製");
    } catch {
      onMessage("無法自動複製，請長按連結手動複製");
    }
  }

  async function shareInvitation(invitation: InvitationView) {
    if (!invitation.inviteUrl) return copyInvitation(invitation);
    const text = `邀請你加入 ${invitation.familyName} 的星星日記。請在 10 分鐘內開啟連結並使用 Google 帳號登入。`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "星星日記家庭邀請", text, url: invitation.inviteUrl });
        return;
      } catch (value) {
        if (value instanceof DOMException && value.name === "AbortError") return;
      }
    }
    await copyInvitation(invitation);
  }

  async function cancelInvitation(invitation: InvitationView) {
    if (!confirm("確定取消這個邀請？原連結將立即無法使用。")) return;
    setBusy(invitation.id);
    try {
      await post({ action: "cancel_invitation", invitationId: invitation.id });
      onMessage("邀請已取消");
      await load();
    } catch (value) {
      onMessage(value instanceof Error ? value.message : "取消邀請失敗");
    } finally {
      setBusy("");
    }
  }

  function openPermissions(member: MemberView) {
    if (!snapshot || !member.childId) return;
    const childIds = snapshot.children.map(child => child.id);
    const preset = permissionPresetFor(member.permissions, childIds, member.childId);
    setPermissionMember(member);
    setPermissionPreset(preset);
    setCustomPermissions(normalizeChildPermissions({ childIds, boundChildId: member.childId, preset: "custom", custom: member.permissions }));
  }

  function updateCustomPermission(childId: string, field: "canView" | "canOperate", checked: boolean) {
    setPermissionPreset("custom");
    setCustomPermissions(current => current.map(permission => {
      if (permission.childId !== childId) return permission;
      if (field === "canOperate") return { ...permission, canOperate: checked, canView: checked || permission.canView };
      return { ...permission, canView: checked, canOperate: checked ? permission.canOperate : false };
    }));
  }

  async function savePermissions() {
    if (!permissionMember) return;
    setBusy(`permissions-${permissionMember.userId}`);
    try {
      await post({
        action: "update_child_permissions",
        userId: permissionMember.userId,
        preset: permissionPreset,
        permissions: permissionPreset === "custom" ? customPermissions : undefined,
      });
      setPermissionMember(null);
      onMessage("Child 權限已更新");
      await load();
    } catch (value) {
      onMessage(value instanceof Error ? value.message : "權限更新失敗");
    } finally {
      setBusy("");
    }
  }

  async function removeMember(member: MemberView) {
    if (!confirm(`確定移除 ${member.name}？對方將立即登出並失去家庭存取權。`)) return;
    setBusy(`remove-${member.userId}`);
    try {
      await post({ action: "remove_member", userId: member.userId });
      onMessage("家庭成員已移除");
      await load();
    } catch (value) {
      onMessage(value instanceof Error ? value.message : "移除成員失敗");
    } finally {
      setBusy("");
    }
  }

  async function leaveFamily() {
    if (!snapshot || !confirm(`確定離開「${snapshot.family.name}」？離開後會立即登出，必須重新接受邀請才能回來。`)) return;
    setBusy("leave-family");
    setError("");
    try {
      await post({ action: "leave_family" });
      await signOut({ callbackUrl: "/?switch=1" });
    } catch (value) {
      const message = value instanceof Error ? value.message : "離開家庭失敗";
      setError(message);
      onMessage(message);
      setBusy("");
    }
  }

  async function deleteBlankFamily() {
    if (!snapshot || !confirm(`確定刪除空白家庭「${snapshot.family.name}」？`)) return;
    if (!confirm("最後確認：家庭與空白設定將永久刪除，但 Google 帳號會保留。確定繼續？")) return;
    setBusy("delete-empty-family");
    setError("");
    try {
      await post({ action: "delete_empty_family" });
      await signOut({ callbackUrl: "/?switch=1" });
    } catch (value) {
      const message = value instanceof Error ? value.message : "刪除空白家庭失敗";
      setError(message);
      onMessage(message);
      setBusy("");
    }
  }

  if (loading) return <section className="account-management-loading" aria-label="正在載入帳號管理">正在載入帳號管理…</section>;
  if (!snapshot) return <section className="account-management-error" role="alert"><h2>帳號管理暫時無法開啟</h2><p>{error}</p><button onClick={() => void load()}>重新整理</button></section>;

  const canManageFamily = isFamilyManager(snapshot.currentUser.role);
  return <div className="account-management-page">
    <div className="account-management-heading"><div><p className="eyebrow">FAMILY ACCESS</p><h2>👥 帳號管理</h2><p>{canManageFamily ? "管理 Google 家庭成員、一次性邀請與 Child 可查看／可操作的孩子。" : "查看目前家庭，或安全離開家庭。"}</p></div>{canManageFamily && <button className="primary" onClick={() => setInviteModal(true)}>＋ 邀請成員</button>}</div>
    {error && <p className="account-management-alert" role="alert">{error}</p>}

    {canManageFamily && <>
    <section className="account-section"><div className="account-section-title"><div><h3>家庭成員</h3><p>{snapshot.family.name}・共 {snapshot.members.length} 位</p></div></div><div className="family-member-list">{snapshot.members.map(member => <article className="family-member-card" key={member.userId}>
      <div className="member-identity">{member.image ? <img src={member.image} alt="" referrerPolicy="no-referrer"/> : <span aria-hidden="true">G</span>}<div><strong>{member.name}</strong><small>{member.email}</small></div></div>
      <div className="member-meta"><span className={`member-role role-${member.role}`}>{roleLabel[member.role]}</span><span>{member.status === "active" ? "啟用中" : "已停用"}</span>{member.role === "child" && <span>綁定孩子：{member.childName || "未綁定"}</span>}<small>加入時間：{formatDate(member.joinedAt)}</small></div>
      <div className="member-actions">{member.role === "child" && <button disabled={Boolean(busy)} onClick={() => openPermissions(member)}>編輯權限</button>}{canRemoveFamilyMember(snapshot.currentUser.role, member.role) && <button className="danger" disabled={Boolean(busy)} onClick={() => void removeMember(member)}>{busy === `remove-${member.userId}` ? "移除中…" : "移除成員"}</button>}</div>
    </article>)}</div></section>

    <section className="account-section"><div className="account-section-title"><div><h3>有效邀請</h3><p>邀請建立後 10 分鐘失效，且只能使用一次。</p></div></div>{activeInvitations.length ? <div className="invitation-list">{activeInvitations.map(invitation => <article className="invitation-card is-active" key={invitation.id}>
      <div><strong>{invitation.role === "parent" ? "Parent 邀請" : "Child 邀請"}</strong>{invitation.childName && <span>綁定：{invitation.childName}</span>}<small>建立：{formatDate(invitation.createdAt)}</small></div>
      <div className="invitation-countdown"><span>剩餘</span><strong>{clock ? countdownLabel(invitation.expiresAt, clock) : "10:00"}</strong></div>
      {invitation.inviteUrl ? <input readOnly value={invitation.inviteUrl} aria-label="完整邀請網址" onFocus={event => event.currentTarget.select()}/> : <p className="invite-link-once">為保護安全，連結只在建立當下顯示。</p>}
      <div className="invitation-actions"><button disabled={!invitation.inviteUrl} onClick={() => void copyInvitation(invitation)}>複製連結</button><button disabled={!invitation.inviteUrl} onClick={() => void shareInvitation(invitation)}>分享邀請</button><button className="danger" disabled={busy === invitation.id} onClick={() => void cancelInvitation(invitation)}>{busy === invitation.id ? "取消中…" : "取消邀請"}</button></div>
    </article>)}</div> : <p className="account-empty">目前沒有有效邀請。</p>}</section>

    <section className="account-section"><div className="account-section-title"><div><h3>已失效／已使用邀請</h3><p>舊 token 不會延長或重複使用。</p></div></div>{invitationHistory.length ? <div className="invitation-history">{invitationHistory.map(invitation => <article key={invitation.id}><div><strong>{invitation.role === "parent" ? "Parent" : `Child・${invitation.childName || "指定孩子"}`}</strong><small>{formatDate(invitation.createdAt)}</small></div><span className={`invite-status status-${invitation.status}`}>{statusLabel[invitation.status]}</span></article>)}</div> : <p className="account-empty">目前沒有歷史邀請。</p>}</section>
    </>}

    <section className="account-section family-exit-section"><div className="account-section-title"><div><h3>離開家庭／刪除空白家庭</h3><p>目前角色：{roleLabel[snapshot.currentUser.role]}・{snapshot.family.name}</p></div></div><div className="family-exit-content">
      {snapshot.familyExit.canLeave && <><p>離開後只會解除你的家庭關係並登出；Google user 與 Auth.js 帳號資料會保留。</p><button type="button" className="family-leave-button" disabled={Boolean(busy)} onClick={() => void leaveFamily()}>{busy === "leave-family" ? "離開中…" : "離開家庭"}</button></>}
      {snapshot.familyExit.canDeleteEmptyFamily && <><p>這個家庭只有你一位 Owner，且沒有孩子、星星、任務、獎勵、紀錄、圖片或邀請資料。</p><button type="button" className="family-delete-button" disabled={Boolean(busy)} onClick={() => void deleteBlankFamily()}>{busy === "delete-empty-family" ? "刪除中…" : "刪除空白家庭"}</button></>}
      {!snapshot.familyExit.canLeave && !snapshot.familyExit.canDeleteEmptyFamily && <p className="family-exit-blocked">🔒 {snapshot.familyExit.blockedReason || "目前無法離開或刪除這個家庭。"}</p>}
    </div></section>

    {inviteModal && <div className="modal-back"><section className="modal account-invite-modal" role="dialog" aria-modal="true" aria-labelledby="invite-member-title"><button className="close" aria-label="關閉邀請成員" onClick={() => setInviteModal(false)}>×</button><h2 id="invite-member-title">邀請成員</h2><fieldset><legend>請選擇角色</legend><div className="invite-role-options"><button aria-pressed={inviteRole === "parent"} onClick={() => setInviteRole("parent")}><strong>Parent</strong><span>可管理孩子、任務、星星與 Child 權限</span></button><button aria-pressed={inviteRole === "child"} onClick={() => setInviteRole("child")}><strong>Child</strong><span>依權限查看與操作孩子端功能</span></button></div></fieldset>{inviteRole === "child" && <label>綁定既有孩子<select value={inviteChildId} onChange={event => setInviteChildId(event.target.value)}>{snapshot.children.map(child => <option value={child.id} key={child.id}>{child.name}</option>)}</select></label>}<p className="invite-expiry-note">🔒 連結使用 32 bytes 隨機 token，10 分鐘後自動失效。</p><button className="save" disabled={busy === "create"} onClick={() => void createInvitation()}>{busy === "create" ? "建立中…" : "建立一次性邀請"}</button></section></div>}

    {permissionMember && permissionMember.childId && <div className="modal-back"><section className="modal child-permission-modal" role="dialog" aria-modal="true" aria-labelledby="child-permission-title"><button className="close" aria-label="關閉權限設定" onClick={() => setPermissionMember(null)}>×</button><h2 id="child-permission-title">Child 權限設定</h2><p><strong>{permissionMember.name}</strong>・綁定 {permissionMember.childName}</p><div className="permission-presets">{([
      ["only_self", "只能自己"], ["share_all", "兄弟姊妹共用"], ["view_all", "可查看全部"], ["custom", "自訂"],
    ] as Array<[PermissionPreset, string]>).map(([value, label]) => <button key={value} aria-pressed={permissionPreset === value} onClick={() => {
      setPermissionPreset(value);
      if (value !== "custom") setCustomPermissions(normalizeChildPermissions({ childIds: snapshot.children.map(child => child.id), boundChildId: permissionMember.childId!, preset: value }));
    }}>{label}</button>)}</div><div className="permission-grid"><div className="permission-grid-head"><span>孩子</span><span>可查看</span><span>可操作</span></div>{snapshot.children.map(child => {
      const permission = customPermissions.find(item => item.childId === child.id) || { childId: child.id, canView: false, canOperate: false };
      const isSelf = child.id === permissionMember.childId;
      return <div className="permission-row" key={child.id}><strong>{child.name}{isSelf && <small>綁定</small>}</strong><label><input type="checkbox" checked={permission.canView} disabled={isSelf || permissionPreset !== "custom"} onChange={event => updateCustomPermission(child.id, "canView", event.target.checked)}/><span>可查看</span></label><label><input type="checkbox" checked={permission.canOperate} disabled={isSelf || permissionPreset !== "custom"} onChange={event => updateCustomPermission(child.id, "canOperate", event.target.checked)}/><span>可操作</span></label></div>;
    })}</div><p className="permission-rule-note">可操作會自動包含可查看；綁定孩子會保留查看與操作權限。</p><button className="save" disabled={busy === `permissions-${permissionMember.userId}`} onClick={() => void savePermissions()}>{busy === `permissions-${permissionMember.userId}` ? "儲存中…" : "儲存權限"}</button></section></div>}
  </div>;
}
