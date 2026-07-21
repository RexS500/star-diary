import { auth } from "../auth";
import { FamilyAccessError, getFamilyForAuthenticatedUser, normalizeAccountEmail } from "./family-access";
import { AccountAccessError, LoginScreen } from "./login-screen";
import StarHome from "./star-home";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    const parameters = await searchParams;
    return <LoginScreen errorCode={parameters?.error || ""}/>;
  }

  const account = {
    id: session.user.id,
    email: normalizeAccountEmail(session.user.email),
    name: session.user.name || null,
    image: session.user.image || null,
  };
  let familyAccess: Awaited<ReturnType<typeof getFamilyForAuthenticatedUser>>;
  try {
    familyAccess = await getFamilyForAuthenticatedUser(account);
  } catch (error) {
    if (error instanceof FamilyAccessError) {
      return <AccountAccessError email={account.email} message={error.message}/>;
    }
    throw error;
  }
  return <StarHome account={{
    ...account,
    role: familyAccess.role,
    boundChildId: familyAccess.boundChildId,
    childAccountMode: familyAccess.childAccountMode,
  }}/>;
}
