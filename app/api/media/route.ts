import { env } from "cloudflare:workers";
import {
  FamilyAccessError,
  assertResourceBelongsToFamily,
  familyAccessErrorResponse,
  requireFamilyMembership,
} from "../../family-access";
import {
  buildFamilyMediaKey,
  isFamilyScopedMediaKey,
  mediaKeyBelongsToFamily,
  stateReferencesMediaKey,
  type MediaKind,
} from "../../media-scope";
import { recordOperationalError, recordOperationalEvent, requestTraceId } from "../../operations-telemetry";
import { MAX_SMALL_IMAGE_DIMENSION, MAX_STORED_IMAGE_BYTES, validateStoredWebp } from "../../webp-validation";

type FamilyStateRow = { data: string };
type MediaRow = { family_id: string };

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

async function legacyKeyBelongsToFamily(key: string, familyId: string) {
  const row = await env.DB.prepare(
    "SELECT data FROM family_state WHERE family_id = ?",
  ).bind(familyId).first<FamilyStateRow>();
  if (!row) return false;
  try {
    return stateReferencesMediaKey(JSON.parse(row.data), key);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  let uploadedKey = "";
  try {
    const family = await requireFamilyMembership("write");
    const form = await req.formData();
    const file = form.get("file");
    const kind: MediaKind = form.get("kind") === "reward" ? "rewards" : "avatars";
    if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
      return Response.json({ error: "請先選擇圖片" }, { status: 400, headers: privateHeaders });
    }
    const filename = "name" in file && typeof file.name === "string" ? file.name : "";
    if (file.type.toLowerCase() !== "image/webp") {
      return Response.json({ error: "圖片必須先壓縮並轉換成 WebP" }, { status: 415, headers: privateHeaders });
    }
    if (!filename.toLowerCase().endsWith(".webp")) {
      return Response.json({ error: "圖片副檔名必須是 .webp" }, { status: 415, headers: privateHeaders });
    }
    if (file.size > MAX_STORED_IMAGE_BYTES) {
      return Response.json({ error: "壓縮後圖片必須小於 500 KB" }, { status: 413, headers: privateHeaders });
    }
    const bytes = await file.arrayBuffer();
    try {
      validateStoredWebp(bytes, MAX_SMALL_IMAGE_DIMENSION);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "圖片內容不符合安全規格" },
        { status: 415, headers: privateHeaders },
      );
    }

    uploadedKey = buildFamilyMediaKey(family.familyId, kind);
    await env.MEDIA.put(uploadedKey, bytes, {
      httpMetadata: { contentType: "image/webp" },
    });
    try {
      await env.DB.prepare(
        `INSERT INTO media_objects
           (family_id, object_key, kind, created_by_user_id, created_at, size_bytes, content_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        family.familyId,
        uploadedKey,
        kind,
        family.user.id,
        new Date().toISOString(),
        bytes.byteLength,
        "image/webp",
      ).run();
    } catch (error) {
      await env.MEDIA.delete(uploadedKey).catch(() => undefined);
      uploadedKey = "";
      throw error;
    }
    await recordOperationalEvent({
      eventType: "image_uploaded",
      familyId: family.familyId,
      userId: family.user.id,
      amount: bytes.byteLength,
      source: kind,
      dedupeKey: `image_uploaded:${uploadedKey}`,
    });
    return Response.json(
      { url: `/api/media?key=${encodeURIComponent(uploadedKey)}&v=${Date.now()}` },
      { headers: privateHeaders },
    );
  } catch (error) {
    if (error instanceof FamilyAccessError) return familyAccessErrorResponse(error);
    if (uploadedKey) await env.MEDIA.delete(uploadedKey).catch(() => undefined);
    await recordOperationalError({
      category: "image_upload_failed",
      error,
      route: "/api/media",
      method: "POST",
      statusCode: 500,
      requestId: requestTraceId(req),
    });
    return Response.json(
      { error: "圖片上傳失敗，請稍後再試" },
      { status: 500, headers: privateHeaders },
    );
  }
}

export async function GET(req: Request) {
  try {
    const family = await requireFamilyMembership("read");
    const key = new URL(req.url).searchParams.get("key");
    if (!key) return new Response("Not found", { status: 404, headers: privateHeaders });

    const owned = mediaKeyBelongsToFamily(key, family.familyId) ||
      (!isFamilyScopedMediaKey(key) && await legacyKeyBelongsToFamily(key, family.familyId));
    if (!owned) return new Response("Not found", { status: 404, headers: privateHeaders });

    const object = await env.MEDIA.get(key);
    if (!object) return new Response("Not found", { status: 404, headers: privateHeaders });
    return new Response(object.body, {
      headers: {
        ...privateHeaders,
        "Content-Type": object.httpMetadata?.contentType || "image/jpeg",
      },
    });
  } catch (error) {
    if (error instanceof FamilyAccessError) return familyAccessErrorResponse(error);
    return new Response("Not found", { status: 404, headers: privateHeaders });
  }
}

export async function DELETE(req: Request) {
  try {
    const family = await requireFamilyMembership("write");
    const key = new URL(req.url).searchParams.get("key");
    if (!key || !mediaKeyBelongsToFamily(key, family.familyId)) {
      return new Response("Not found", { status: 404, headers: privateHeaders });
    }
    const row = await env.DB.prepare(
      "SELECT family_id FROM media_objects WHERE object_key = ?",
    ).bind(key).first<MediaRow>();
    assertResourceBelongsToFamily(row?.family_id, family.familyId);
    await env.MEDIA.delete(key);
    await env.DB.prepare(
      "DELETE FROM media_objects WHERE family_id = ? AND object_key = ?",
    ).bind(family.familyId, key).run();
    return new Response(null, { status: 204, headers: privateHeaders });
  } catch (error) {
    if (error instanceof FamilyAccessError) return familyAccessErrorResponse(error);
    return new Response("Not found", { status: 404, headers: privateHeaders });
  }
}
