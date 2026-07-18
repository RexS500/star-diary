export async function GET() {
  return Response.json(
    { version: __APP_VERSION__, build: __APP_BUILD_ID__ },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
  );
}
