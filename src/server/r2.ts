import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

export type MediaKind = "banner" | "menu" | "branch" | "misc";

const KIND_CONFIG: Record<MediaKind, { maxWidth: number; quality: number }> = {
  banner: { maxWidth: 1920, quality: 82 },
  menu: { maxWidth: 800, quality: 80 },
  branch: { maxWidth: 800, quality: 80 },
  misc: { maxWidth: 800, quality: 80 },
};

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export function isR2Configured(): boolean {
  return Boolean(
    env("CLOUDFLARE_R2_ACCOUNT_ID") &&
      env("CLOUDFLARE_R2_ACCESS_KEY_ID") &&
      env("CLOUDFLARE_R2_SECRET_ACCESS_KEY") &&
      env("CLOUDFLARE_R2_BUCKET_NAME") &&
      env("CLOUDFLARE_R2_PUBLIC_URL")
  );
}

export function getR2PublicBaseUrl(): string {
  return (env("CLOUDFLARE_R2_PUBLIC_URL") || "").replace(/\/$/, "");
}

let cachedClient: S3Client | null = null;

export function getR2Client(): S3Client {
  if (cachedClient) return cachedClient;
  const accountId = env("CLOUDFLARE_R2_ACCOUNT_ID")!;
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env("CLOUDFLARE_R2_ACCESS_KEY_ID")!,
      secretAccessKey: env("CLOUDFLARE_R2_SECRET_ACCESS_KEY")!,
    },
  });
  return cachedClient;
}

export function normalizeMediaKind(raw: unknown): MediaKind {
  if (raw === "banner" || raw === "menu" || raw === "branch" || raw === "misc") return raw;
  return "misc";
}

/**
 * Optimize any raster upload (JPEG/PNG/WebP/GIF) to WebP.
 * - animated:true preserves GIF animation as animated WebP
 * - auto-rotates via EXIF, resizes to max width, strips metadata
 */
export async function optimizeImage(input: Buffer, kind: MediaKind): Promise<Buffer> {
  const { maxWidth, quality } = KIND_CONFIG[kind];
  return sharp(input, { animated: true })
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality, effort: 6 })
    .toBuffer();
}

export function buildR2Key(kind: MediaKind, originalName = "upload"): string {
  const safe = originalName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "image";
  const rand = Math.random().toString(36).slice(2, 8);
  return `${kind === "misc" ? "misc" : kind + "s"}/${Date.now()}-${rand}-${safe}.webp`;
}

export async function uploadToR2(buffer: Buffer, key: string): Promise<string> {
  const bucket = env("CLOUDFLARE_R2_BUCKET_NAME")!;
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  return `${getR2PublicBaseUrl()}/${key}`;
}

export function isCloudinaryUrl(url?: string): boolean {
  return Boolean(url && url.includes("res.cloudinary.com"));
}

export function isR2Url(url?: string): boolean {
  if (!url) return false;
  const base = getR2PublicBaseUrl();
  if (base && url.startsWith(base)) return true;
  return url.includes(".r2.dev/") || url.includes(".r2.cloudflarestorage.com/");
}
