"use client";

import { MAX_STORED_IMAGE_BYTES } from "./webp-validation";

const INPUT_MAX_BYTES = 40 * 1024 * 1024;
const INPUT_MAX_DIMENSION = 1600;
const ACCEPTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

function detectedInputType(bytes: Uint8Array) {
  if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") return "image/webp";
  return null;
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => {
    if (!blob || blob.type !== "image/webp") reject(new Error("此瀏覽器無法安全輸出 WebP，請更新 Safari 或 Chrome"));
    else resolve(blob);
  }, "image/webp", quality));
}

function scaledCanvas(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, maximum: number) {
  const scale = Math.min(1, maximum / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("無法處理圖片");
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

export async function prepareImageForCrop(file: File) {
  if (file.size > INPUT_MAX_BYTES) throw new Error("原始圖片請小於 40 MB");
  const extension = extensionOf(file.name);
  if (!ACCEPTED_EXTENSIONS.has(extension)) throw new Error("請選擇 JPG、PNG 或 WebP 圖片");
  const signature = detectedInputType(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!signature) throw new Error("檔案內容不是有效的 JPG、PNG 或 WebP 圖片");
  if (file.type && !["image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/webp"].includes(file.type.toLowerCase())) {
    throw new Error("圖片 MIME Type 不正確");
  }
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const canvas = scaledCanvas(bitmap, bitmap.width, bitmap.height, INPUT_MAX_DIMENSION);
    const blob = await canvasBlob(canvas, 0.82);
    return new File([blob], `prepared-${crypto.randomUUID()}.webp`, { type: "image/webp", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

export async function encodeCanvasAsStoredWebp(source: HTMLCanvasElement) {
  let canvas = source;
  for (let pass = 0; pass < 8; pass += 1) {
    for (const quality of [0.82, 0.79, 0.76, 0.75]) {
      const blob = await canvasBlob(canvas, quality);
      if (blob.size <= MAX_STORED_IMAGE_BYTES) {
        return new File([blob], `${crypto.randomUUID()}.webp`, { type: "image/webp", lastModified: Date.now() });
      }
    }
    const nextMaximum = Math.max(128, Math.floor(Math.max(canvas.width, canvas.height) * 0.88));
    if (nextMaximum >= Math.max(canvas.width, canvas.height)) break;
    canvas = scaledCanvas(canvas, canvas.width, canvas.height, nextMaximum);
  }
  throw new Error("圖片無法壓縮至 500 KB 以下，請更換較簡單或較小的圖片");
}
