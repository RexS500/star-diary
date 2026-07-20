import { auth } from "../../../auth";
import Link from "next/link";
import { AccountApiError, getInvitationByToken } from "../../account-service";
import { InviteJoinClient } from "./invite-join-client";

export const dynamic = "force-dynamic";

type JoinPageProps = { params: Promise<{ token: string }> };

export default async function JoinFamilyPage({ params }: JoinPageProps) {
  const { token } = await params;
  let result:
    | { invitation: Awaited<ReturnType<typeof getInvitationByToken>>; authenticated: boolean; error?: never }
    | { invitation?: never; authenticated?: never; error: string };
  try {
    const invitation = await getInvitationByToken(token);
    const session = await auth();
    result = { invitation, authenticated: Boolean(session?.user?.id && session.user.email) };
  } catch (error) {
    result = { error: error instanceof AccountApiError ? error.message : "目前無法讀取這個邀請" };
  }
  if ("error" in result) {
    return <main className="invite-join-page">
      <section className="invite-join-card" role="alert">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/star-diary-logo.jpg" alt="" width={96} height={96}/>
        <p className="eyebrow">FAMILY INVITATION</p>
        <h1>邀請無法使用</h1>
        <p>{result.error}</p>
        <Link className="invite-home-link" href="/">返回星星日記</Link>
      </section>
    </main>;
  }
  return <InviteJoinClient
    token={token}
    invitation={result.invitation}
    authenticated={result.authenticated}
  />;
}
