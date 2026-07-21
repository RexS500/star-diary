import { adminErrorResponse, requireAdmin } from "../../../admin-auth";
import { getAdminOverview } from "../../../admin-service";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireAdmin();
    return Response.json(await getAdminOverview(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
