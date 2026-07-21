import {
  AccountApiError,
  accountApiErrorResponse,
  cancelFamilyInvitation,
  createFamilyInvitation,
  deleteEmptyFamily,
  getAccountManagementSnapshot,
  leaveCurrentFamily,
  removeFamilyMember,
  updateMemberChildPermissions,
} from "../../account-service";
import {
  FamilyAccessError,
  familyAccessErrorResponse,
  requireFamilyMembership,
} from "../../family-access";

export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const family = await requireFamilyMembership("read");
    return Response.json(await getAccountManagementSnapshot(family), { headers: privateHeaders });
  } catch (error) {
    if (error instanceof FamilyAccessError) return familyAccessErrorResponse(error);
    return accountApiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const family = await requireFamilyMembership("read");
    const body = await req.json() as Record<string, unknown>;
    if (body.action === "create_invitation") {
      const invitation = await createFamilyInvitation(
        family,
        { role: body.role, childId: body.childId },
        new URL(req.url).origin,
      );
      return Response.json({ ok: true, invitation }, { status: 201, headers: privateHeaders });
    }
    if (body.action === "cancel_invitation") {
      if (typeof body.invitationId !== "string") throw new AccountApiError("邀請資料不完整", 422);
      await cancelFamilyInvitation(family, body.invitationId);
      return Response.json({ ok: true }, { headers: privateHeaders });
    }
    if (body.action === "update_child_permissions") {
      const permissions = await updateMemberChildPermissions(family, {
        userId: body.userId,
        preset: body.preset,
        permissions: body.permissions,
      });
      return Response.json({ ok: true, permissions }, { headers: privateHeaders });
    }
    if (body.action === "remove_member") {
      if (typeof body.userId !== "string") throw new AccountApiError("家庭成員資料不完整", 422);
      await removeFamilyMember(family, body.userId);
      return Response.json({ ok: true }, { headers: privateHeaders });
    }
    if (body.action === "leave_family") {
      await leaveCurrentFamily(family);
      return Response.json({ ok: true, signedOut: true }, { headers: privateHeaders });
    }
    if (body.action === "delete_empty_family") {
      await deleteEmptyFamily(family);
      return Response.json({ ok: true, signedOut: true }, { headers: privateHeaders });
    }
    throw new AccountApiError("不支援的帳號管理操作", 422);
  } catch (error) {
    if (error instanceof FamilyAccessError) return familyAccessErrorResponse(error);
    return accountApiErrorResponse(error);
  }
}
