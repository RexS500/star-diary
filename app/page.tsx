import { auth } from "../auth";
import { parseAuthIntent } from "./auth-intent";
import { FamilyAccessError, findFamilyForAuthenticatedUser, normalizeAccountEmail } from "./family-access";
import { NoFamilyAccount } from "./family-onboarding-client";
import { AccountAccessError, LoginScreen } from "./login-screen";
import StarHome from "./star-home";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams?: Promise<{ error?: string; auth_intent?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const session = await auth();
  const parameters = await searchParams;
  const authIntent = parseAuthIntent(parameters?.auth_intent);
  if (!session?.user?.id || !session.user.email) {
    return <LoginScreen errorCode={parameters?.error || ""}/>;
  }

  const account = {
    id: session.user.id,
    email: normalizeAccountEmail(session.user.email),
    name: session.user.name || null,
    image: session.user.image || null,
  };
  let familyAccess: Awaited<ReturnType<typeof findFamilyForAuthenticatedUser>>;
  try {
    familyAccess = await findFamilyForAuthenticatedUser(account);
  } catch (error) {
    if (error instanceof FamilyAccessError) {
      return <AccountAccessError email={account.email} message={error.message}/>;
    }
    throw error;
  }
  if (!familyAccess) return <NoFamilyAccount account={account} intent={authIntent}/>;
  return <StarHome account={{
    ...account,
    role: familyAccess.role,
    boundChildId: familyAccess.boundChildId,
    childAccountMode: familyAccess.childAccountMode,
  }}/>;
}
