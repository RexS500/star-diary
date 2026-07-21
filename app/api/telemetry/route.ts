import { FamilyAccessError, familyAccessErrorResponse, requireFamilyMembership } from "../../family-access";
import { recordOperationalEvent } from "../../operations-telemetry";

export async function POST(request: Request) {
  try {
    const family = await requireFamilyMembership("read");
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      return Response.json({ error: "Invalid origin" }, { status: 403 });
    }
    const body = await request.json() as { eventType?: string; dedupeKey?: string };
    if (body.eventType !== "excel_exported") {
      return Response.json({ error: "Unsupported event" }, { status: 422 });
    }
    await recordOperationalEvent({
      eventType: "excel_exported",
      familyId: family.familyId,
      userId: family.user.id,
      dedupeKey: typeof body.dedupeKey === "string" ? body.dedupeKey.slice(0, 160) : null,
    });
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof FamilyAccessError) return familyAccessErrorResponse(error);
    return Response.json({ error: "Unable to record event" }, { status: 500 });
  }
}
