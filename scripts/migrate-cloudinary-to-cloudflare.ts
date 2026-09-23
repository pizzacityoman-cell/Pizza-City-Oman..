/**
 * One-time migration: Cloudinary -> Cloudflare R2 (optimized animated WebP).
 *
 * Usage:
 *   npx tsx scripts/migrate-cloudinary-to-cloudflare.ts --dry-run
 *   npx tsx scripts/migrate-cloudinary-to-cloudflare.ts --limit 2
 *   npx tsx scripts/migrate-cloudinary-to-cloudflare.ts
 *
 * Env required (unless --dry-run): MONGODB_URI + CLOUDFLARE_R2_* (see .env.example)
 */
import dotenv from "dotenv";
import dns from "dns";
import mongoose from "mongoose";
import {
  buildR2Key,
  isR2Configured,
  optimizeImage,
  uploadToR2,
  type MediaKind,
} from "../src/server/r2.js";

dotenv.config();

// Same DNS fix as server.ts — needed for mongodb+srv:// SRV lookups on some Windows networks
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : undefined;

const looseSchema = new mongoose.Schema({ image: String }, { strict: false });
const MenuItem = mongoose.models.MenuItem || mongoose.model("MenuItem", looseSchema);
const Banner = mongoose.models.Banner || mongoose.model("Banner", looseSchema);
const Branch = mongoose.models.Branch || mongoose.model("Branch", looseSchema);

const TARGETS: { model: mongoose.Model<any>; kind: MediaKind; label: string }[] = [
  { model: MenuItem, kind: "menu", label: "MenuItem" },
  { model: Banner, kind: "banner", label: "Banner" },
  { model: Branch, kind: "branch", label: "Branch" },
];

function isCloudinary(url?: string): boolean {
  return Boolean(url && url.includes("res.cloudinary.com"));
}

function fileNameFromUrl(url: string): string {
  try {
    const base = url.split("?")[0].split("/").pop() || "image";
    return base.replace(/\.[a-z0-9]+$/i, "");
  } catch {
    return "image";
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required for migration.");
  if (!DRY_RUN && !isR2Configured()) {
    throw new Error("R2 env vars missing. Set CLOUDFLARE_R2_* in .env (see .env.example).");
  }

  await mongoose.connect(uri);
  console.log(`Connected to MongoDB. Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "LIVE rewrite"}`);

  let total = 0;
  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  for (const { model, kind, label } of TARGETS) {
    const docs = await model.find({ image: { $regex: "res\\.cloudinary\\.com" } }).lean();
    const slice = typeof LIMIT === "number" ? docs.slice(0, LIMIT) : docs;
    console.log(`\n[${label}] found ${docs.length} Cloudinary asset(s)${LIMIT ? ` (processing ${slice.length})` : ""}`);

    for (const doc of slice) {
      total++;
      const url = (doc as any).image as string;
      if (!isCloudinary(url)) {
        skipped++;
        continue;
      }
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          const hint = body.includes("is disabled")
            ? " — Cloudinary cloud is DISABLED (account suspended/limited). Re-enable it in Cloudinary or re-upload originals via /admin/api/upload, then re-run."
            : "";
          throw new Error(`Download HTTP ${res.status}${hint}`);
        }
        const original = Buffer.from(await res.arrayBuffer());
        const optimized = await optimizeImage(original, kind);
        bytesBefore += original.length;
        bytesAfter += optimized.length;

        const savedPct = (((original.length - optimized.length) / original.length) * 100).toFixed(1);
        console.log(
          `  ${(doc as any)._id} ${label}: ${(original.length / 1024).toFixed(0)}KB -> ${(optimized.length / 1024).toFixed(0)}KB (-${savedPct}%) ${url.slice(0, 80)}...`
        );

        if (DRY_RUN) continue;

        const key = buildR2Key(kind, fileNameFromUrl(url));
        const newUrl = await uploadToR2(optimized, key);
        await model.updateOne({ _id: (doc as any)._id }, { $set: { image: newUrl } });
        migrated++;
      } catch (err: any) {
        failed++;
        console.error(`  FAILED ${(doc as any)._id}: ${err.message}`);
      }
      if (typeof LIMIT === "number" && total >= LIMIT) break;
    }
    if (typeof LIMIT === "number" && total >= LIMIT) break;
  }

  const savedMB = ((bytesBefore - bytesAfter) / 1024 / 1024).toFixed(2);
  console.log(`\nDone. scanned=${total} migrated=${DRY_RUN ? 0 : migrated} failed=${failed} skipped=${skipped}`);
  console.log(`Bytes: ${(bytesBefore / 1024 / 1024).toFixed(2)}MB -> ${(bytesAfter / 1024 / 1024).toFixed(2)}MB (saved ${savedMB}MB)`);
  await mongoose.disconnect();
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
