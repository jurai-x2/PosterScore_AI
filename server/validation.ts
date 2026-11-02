import sharp from "sharp";
import path from "node:path";
import { z } from "zod";

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 12_000;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
export const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export const analysisContextSchema = z.object({
  targetPlatform: z.enum(["General", "Instagram post", "Instagram story", "A3 print", "WhatsApp status", "Billboard"]).default("General"),
  goal: z.string().trim().max(300).default(""),
  audience: z.string().trim().max(200).default(""),
  brandInfo: z.string().trim().max(300).default("")
});

type UploadedImage = { mimetype: string; originalname?: string; size: number; buffer: Buffer };

export async function validateImage(file: UploadedImage) {
  if (!allowedMimeTypes.has(file.mimetype)) return "Unsupported format. Upload a JPG, PNG, or WEBP image.";
  if (file.originalname && !allowedExtensions.has(path.extname(file.originalname).toLowerCase())) {
    return "Unsupported format. Upload a JPG, PNG, or WEBP image.";
  }
  if (file.size > MAX_FILE_SIZE) return "That image is over the 10 MB limit.";
  try {
    const metadata = await sharp(file.buffer).metadata();
    if (!metadata.width || !metadata.height) return "That file could not be decoded as an image.";
    if (metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
      return "That image is too large to process safely. Export it at a smaller pixel size and try again.";
    }
  } catch {
    return "That file appears to be corrupt. Try exporting the poster again.";
  }
  return null;
}

/**
 * Keep the source image sharp enough for visual review while avoiding huge
 * base64 payloads on the vision request. The output is always a valid JPEG.
 */
export async function preprocessImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#f5f7f3" })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}

export type ImageMeasurements = {
  width: number;
  height: number;
  aspectRatio: number;
  orientation: "portrait" | "landscape" | "square";
  dominantColors: string[];
  estimatedWhitespacePercent: number;
  estimatedImageCoveragePercent: number;
};

function hex(value: number) {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

/** Small, deterministic image facts used as evidence alongside the model's visual judgment. */
export async function measureImage(buffer: Buffer): Promise<ImageMeasurements> {
  const image = sharp(buffer).rotate();
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const aspectRatio = height ? Number((width / height).toFixed(3)) : 0;
  const orientation = Math.abs(width - height) < Math.max(width, height) * 0.05 ? "square" : width > height ? "landscape" : "portrait";
  const sampled = await image.resize({ width: 96, height: 96, fit: "fill" }).flatten({ background: "#ffffff" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = sampled.data;
  let whitespace = 0;
  let contrastEdges = 0;
  const colorBuckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  const luminance: number[] = [];
  for (let i = 0; i < pixels.length; i += 3) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const light = (0.2126 * r + 0.7152 * g + 0.0722 * b);
    luminance.push(light);
    if (r > 232 && g > 232 && b > 232) whitespace += 1;
    const bucket = [Math.round(r / 32) * 32, Math.round(g / 32) * 32, Math.round(b / 32) * 32].map((channel) => Math.min(255, channel));
    const key = bucket.join(",");
    const existing = colorBuckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    existing.count += 1;
    existing.r += r;
    existing.g += g;
    existing.b += b;
    colorBuckets.set(key, existing);
  }
  const sampleWidth = 96;
  for (let i = 0; i < luminance.length; i += 1) {
    if (i % sampleWidth > 0 && Math.abs(luminance[i] - luminance[i - 1]) > 42) contrastEdges += 1;
    if (i >= sampleWidth && Math.abs(luminance[i] - luminance[i - sampleWidth]) > 42) contrastEdges += 1;
  }
  const dominantColors = [...colorBuckets.values()].sort((a, b) => b.count - a.count).slice(0, 5).map((bucket) => `#${hex(bucket.r / bucket.count)}${hex(bucket.g / bucket.count)}${hex(bucket.b / bucket.count)}`);
  const sampleCount = Math.max(luminance.length, 1);
  return { width, height, aspectRatio, orientation, dominantColors, estimatedWhitespacePercent: Math.round((whitespace / sampleCount) * 100), estimatedImageCoveragePercent: Math.round((contrastEdges / (sampleCount * 2)) * 100) };
}
