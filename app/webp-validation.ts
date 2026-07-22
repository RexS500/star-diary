export const MAX_STORED_IMAGE_BYTES = 500 * 1024;
export const MAX_SMALL_IMAGE_DIMENSION = 512;

export type WebpInspection = {
  width: number;
  height: number;
  chunkTypes: string[];
};

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function uint24le(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function uint32le(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

export function inspectWebp(input: ArrayBuffer | Uint8Array): WebpInspection {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    throw new Error("檔案不是有效的 WebP 圖片");
  }
  if (uint32le(bytes, 4) + 8 !== bytes.length) throw new Error("WebP 檔案長度不正確");

  const chunkTypes: string[] = [];
  let width = 0;
  let height = 0;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const size = uint32le(bytes, offset + 4);
    const dataOffset = offset + 8;
    const end = dataOffset + size;
    if (end > bytes.length) throw new Error("WebP 區塊內容不完整");
    chunkTypes.push(type);

    if (type === "VP8X" && size >= 10) {
      width = uint24le(bytes, dataOffset + 4) + 1;
      height = uint24le(bytes, dataOffset + 7) + 1;
    } else if (type === "VP8L" && size >= 5 && bytes[dataOffset] === 0x2f) {
      const b0 = bytes[dataOffset + 1], b1 = bytes[dataOffset + 2], b2 = bytes[dataOffset + 3], b3 = bytes[dataOffset + 4];
      width = 1 + b0 + ((b1 & 0x3f) << 8);
      height = 1 + ((b1 & 0xc0) >> 6) + (b2 << 2) + ((b3 & 0x0f) << 10);
    } else if (type === "VP8 " && size >= 10 && bytes[dataOffset + 3] === 0x9d && bytes[dataOffset + 4] === 0x01 && bytes[dataOffset + 5] === 0x2a) {
      width = (bytes[dataOffset + 6] | (bytes[dataOffset + 7] << 8)) & 0x3fff;
      height = (bytes[dataOffset + 8] | (bytes[dataOffset + 9] << 8)) & 0x3fff;
    }
    offset = end + (size % 2);
  }

  if (chunkTypes.some(type => type === "EXIF" || type === "XMP " || type === "ICCP")) {
    throw new Error("圖片仍含有 EXIF、XMP 或色彩描述中繼資料");
  }
  if (!width || !height) throw new Error("無法讀取 WebP 圖片尺寸");
  return { width, height, chunkTypes };
}

export function validateStoredWebp(input: ArrayBuffer | Uint8Array, maximumDimension = MAX_SMALL_IMAGE_DIMENSION) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > MAX_STORED_IMAGE_BYTES) throw new Error("壓縮後圖片必須小於 500 KB");
  const inspection = inspectWebp(bytes);
  if (Math.max(inspection.width, inspection.height) > maximumDimension) {
    throw new Error(`圖片最長邊不可超過 ${maximumDimension}px`);
  }
  return inspection;
}
