export const MAX_ATTACHMENT_FILE_SIZE = 4 * 1024 * 1024;
export const MAX_ATTACHMENT_FILE_SIZE_LABEL = "4MB";
export const ALLOWED_ATTACHMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif"] as const;
export const ATTACHMENT_FILE_ACCEPT = "application/pdf,image/jpeg,image/png,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.heic,.heif";

type AttachmentMimeType = (typeof ALLOWED_ATTACHMENT_TYPES)[number];
type PreparedAttachmentFile = {
  file: File;
  wasConverted: boolean;
  notice?: string;
};

const extensionByMimeType: Record<AttachmentMimeType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif"
};

export function isAllowedAttachmentType(value: string) {
  return (ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(value.toLowerCase());
}

/**
 * The browser can hand us a transcoded File (for example HEIF -> PNG on iOS).
 * Validate its real header before trusting its MIME type or extension.
 */
export async function prepareAttachmentFile(source: File): Promise<PreparedAttachmentFile> {
  const mimeType = await detectAttachmentMimeType(source);
  if (!mimeType) throw new Error("只支持 PDF、JPG、PNG、HEIC、HEIF 文件。");

  const normalized = normalizeFileNameAndType(source, mimeType);
  if (normalized.size <= MAX_ATTACHMENT_FILE_SIZE) return { file: normalized, wasConverted: false };
  if (!mimeType.startsWith("image/")) {
    throw new Error(sizeLimitMessage(normalized));
  }

  const compressed = await createClearJpegCopy(normalized);
  if (compressed.size > MAX_ATTACHMENT_FILE_SIZE) {
    throw new Error(`${sizeLimitMessage(normalized)} 已尝试生成清晰 JPEG 副本，但副本仍超过 ${MAX_ATTACHMENT_FILE_SIZE_LABEL}。请改用更小的图片。`);
  }

  const iosHint = source.type === "image/png" || source.type === "image/jpeg"
    ? "iPhone 可能已将 HEIF 照片转换为体积更大的 PNG 或 JPEG。"
    : "";
  return {
    file: compressed,
    wasConverted: true,
    notice: `${source.name} 实际为 ${formatAttachmentFileSize(source.size)}，已生成清晰 JPEG 副本（${formatAttachmentFileSize(compressed.size)}）用于上传。${iosHint}`
  };
}

export function formatAttachmentFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function sizeLimitMessage(file: File) {
  return `${file.name} 实际为 ${formatAttachmentFileSize(file.size)}，当前上限为 ${MAX_ATTACHMENT_FILE_SIZE_LABEL}。`;
}

async function detectAttachmentMimeType(file: File): Promise<AttachmentMimeType | null> {
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const detected = sniffAttachmentMimeType(bytes);
  if (!detected) return null;
  const declared = file.type.toLowerCase();
  if (!isCompatibleDeclaredMimeType(declared, detected)) return null;
  return detected;
}

function isCompatibleDeclaredMimeType(declared: string, detected: AttachmentMimeType) {
  if (!declared || declared === "application/octet-stream" || declared === detected) return true;
  if (detected === "image/jpeg") return declared === "image/jpg";
  if (detected === "image/heic") return declared === "image/x-heic";
  if (detected === "image/heif") return declared === "image/x-heif";
  return false;
}

function sniffAttachmentMimeType(bytes: Uint8Array): AttachmentMimeType | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return "application/pdf";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 16 && readAscii(bytes, 4, 4) === "ftyp") {
    const brands = [readAscii(bytes, 8, 4), readAscii(bytes, 16, 4), readAscii(bytes, 20, 4), readAscii(bytes, 24, 4), readAscii(bytes, 28, 4)];
    if (brands.some((brand) => ["heic", "heix", "hevc", "hevx"].includes(brand))) return "image/heic";
    if (brands.some((brand) => ["mif1", "msf1"].includes(brand))) return "image/heif";
  }
  return null;
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function normalizeFileNameAndType(file: File, mimeType: AttachmentMimeType) {
  const extension = extensionByMimeType[mimeType];
  const currentExtension = file.name.split(".").pop()?.toLowerCase();
  const nameMatchesMime = (mimeType === "image/jpeg" && ["jpg", "jpeg"].includes(currentExtension || "")) || currentExtension === extension;
  if (file.type === mimeType && nameMatchesMime) return file;
  const baseName = file.name.replace(/\.[^.]+$/, "") || "attachment";
  return new File([file], `${baseName}.${extension}`, { type: mimeType, lastModified: file.lastModified });
}

async function createClearJpegCopy(file: File) {
  const decoded = await decodeImage(file);
  try {
    const longestSide = Math.max(decoded.width, decoded.height);
    const scale = Math.min(1, 2500 / longestSide);
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法准备图片压缩副本，请改用更小的图片。");
    context.drawImage(decoded.image, 0, 0, width, height);
    const first = await canvasToBlob(canvas, 0.9);
    const blob = first.size <= MAX_ATTACHMENT_FILE_SIZE ? first : await canvasToBlob(canvas, 0.85);
    const baseName = file.name.replace(/\.[^.]+$/, "") || "attachment";
    return new File([blob], `${baseName}-compressed.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    decoded.close();
  }
}

async function decodeImage(file: File): Promise<{ image: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Safari may not expose createImageBitmap for every iPhone photo format; use its Image decoder next.
    }
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error("无法读取该图片以生成清晰压缩副本，请改用更小的 JPG 或 PNG。"));
      next.src = objectUrl;
    });
    return { image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(objectUrl) };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error("无法生成图片压缩副本，请改用更小的图片。"));
  }, "image/jpeg", quality));
}
