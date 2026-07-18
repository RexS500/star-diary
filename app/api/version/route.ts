export async function GET() {
  return Response.json(
    { version: __STAR_DIARY_VERSION__, build: __STAR_DIARY_BUILD_ID__ },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
  );
}
