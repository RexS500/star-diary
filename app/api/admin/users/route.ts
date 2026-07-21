import { adminErrorResponse, requireAdmin } from "../../../admin-auth";
import { getAdminUsers } from "../../../admin-service";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireAdmin();
    return Response.json({ users: await getAdminUsers() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
