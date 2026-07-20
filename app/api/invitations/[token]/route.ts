import {
  acceptFamilyInvitation,
  accountApiErrorResponse,
  getInvitationByToken,
} from "../../../account-service";
import {
  FamilyAccessError,
  familyAccessErrorResponse,
  requireAuthenticatedUser,
} from "../../../family-access";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };
const publicHeaders = { "Cache-Control": "no-store" };

export async function GET(_req: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    return Response.json({ invitation: await getInvitationByToken(token) }, { headers: publicHeaders });
  } catch (error) {
    return accountApiErrorResponse(error);
  }
}

export async function POST(_req: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const user = await requireAuthenticatedUser();
    const membership = await acceptFamilyInvitation(token, user);
    return Response.json({ ok: true, membership }, { headers: publicHeaders });
  } catch (error) {
    if (error instanceof FamilyAccessError) return familyAccessErrorResponse(error);
    return accountApiErrorResponse(error);
  }
}
