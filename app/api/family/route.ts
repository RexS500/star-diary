import {
  AccountApiError,
  accountApiErrorResponse,
  forceDeleteCurrentFamily,
} from "../../account-service";
import { clearCsrfResponseCookie, validSameOriginCsrfRequest } from "../../csrf";
import {
  FamilyAccessError,
  familyAccessErrorResponse,
  requireFamilyMembership,
} from "../../family-access";

export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function DELETE(request: Request) {
  try {
    // family_id is intentionally derived from the authenticated membership.
    // No client-supplied family id is read by this endpoint.
    const family = await requireFamilyMembership("read");
    if (!await validSameOriginCsrfRequest(request)) {
      throw new AccountApiError("刪除確認已失效，請重新整理帳號管理頁後再試", 403);
    }
    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      throw new AccountApiError("永久刪除確認資料不完整", 422);
    }
    const result = await forceDeleteCurrentFamily(family, {
      familyNameConfirmation: body.familyNameConfirmation,
      confirmed: body.confirmed,
      mode: body.mode,
    });
    return Response.json(result, {
      headers: {
        ...privateHeaders,
        "Set-Cookie": clearCsrfResponseCookie(request.url),
      },
    });
  } catch (error) {
    if (error instanceof FamilyAccessError) return familyAccessErrorResponse(error);
    return accountApiErrorResponse(error);
  }
}
