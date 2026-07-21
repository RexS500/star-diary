import { adminErrorResponse, requireAdmin } from "../../../../admin-auth";
import { getAdminReport, normalizeAdminRange, type AdminReportKind } from "../../../../admin-service";

export const dynamic = "force-dynamic";
const kinds = new Set<AdminReportKind>(["users", "features", "stars", "resources", "errors"]);

export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  try {
    await requireAdmin();
    const { kind } = await context.params;
    if (!kinds.has(kind as AdminReportKind)) return Response.json({ error: "未知的報表類型。" }, { status: 404 });
    const url = new URL(request.url);
    const range = normalizeAdminRange(url.searchParams.get("start") || undefined, url.searchParams.get("end") || undefined);
    return Response.json(await getAdminReport(kind as AdminReportKind, range), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
