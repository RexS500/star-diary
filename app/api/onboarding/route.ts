import {
  FamilyAccessError,
  familyAccessErrorResponse,
  requireAuthenticatedUser,
} from "../../family-access";
import {
  createFamilyAndOwner,
  familyOnboardingErrorResponse,
} from "../../family-onboarding-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const body = await request.json() as Record<string, unknown>;
    if (body.action !== "create_family") {
      return Response.json({ error: "不支援的操作" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const family = await createFamilyAndOwner(user, {
      familyName: body.familyName,
      childName: body.childName,
      childGender: body.childGender,
    });
    return Response.json({ ok: true, family }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    if (error instanceof FamilyAccessError) return familyAccessErrorResponse(error);
    return familyOnboardingErrorResponse(error);
  }
}
