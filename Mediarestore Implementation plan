# Cloudinary to Cloudflare Media Migration & Performance Optimization Plan

## Executive Summary & Audit Findings

An audit of the Pizza City Oman codebase and media infrastructure revealed two critical, intertwined bottlenecks:
1. **Cloudinary Usage Exceeded**: The platform currently depends directly on Cloudinary for media storage, upload pipelines, seed data, and hardcoded URLs.
2. **Severe Media Bloat Causing Site Slowness**: Media is currently uploaded and served with minimal or no optimization, causing extreme load times, high mobile data consumption, and rapid bandwidth exhaustion.

---

### Audit Findings

#### 1. Cloudinary Dependencies & Hardcoded References
- **Backend Upload Pipeline (`server.ts`)**:
  - Direct dependency on `cloudinary` and `multer-storage-cloudinary`.
  - Endpoint `/admin/api/upload` uploads raw user files directly to Cloudinary folder `restaurant_banners`.
  - Max file size limit is set to **20MB** (`limits: { fileSize: 20 * 1024 * 1024 }`), allowing massive uncompressed photos and GIFs to be ingested.
- **Database & Seed Data (`server.ts`)**:
  - `SEED_MENU_ITEMS`: Contains raw Cloudinary URLs, including animated GIFs (`ihtck4pfz24g0xapusku.gif`, `cj2hccfpwabeealwgtqg.gif`).
  - `SEED_BANNERS`: Contains hero banner images stored on Cloudinary (`bfuygklmwmdridzknxo9.jpg`).
  - `SEED_BRANCHES`: Outlets (Nizwa, Samail, Sur, Quriyat, Fanja, Al Khoud, Ibri, Mabela) all point to `res.cloudinary.com`.
  - Active MongoDB collections (`MenuItem`, `Banner`, `Branch`) store existing URLs pointing to Cloudinary.
- **Frontend References**:
  - `index.html`: Favicon (`PizzaCity-Logo_zgzbps.png`) and DNS prefetch `<link rel="dns-prefetch" href="https://res.cloudinary.com" />`.
  - `src/components/AdminDashboard.tsx`: Hardcoded Cloudinary logo URL.
  - `src/components/BannerSlider.tsx`: Hardcoded pizza image URL.
  - `src/pages/LocationsPage.tsx` & `src/pages/LocationDetailPage.tsx`: Custom helper `cloudinaryUrl()` tightly coupled to regex-matching `res.cloudinary.com` and injecting Cloudinary URL parameters.

#### 2. Root Causes for Media Size & Site Slowness
- **No Server-Side Image Optimization**: When an admin uploads a 5MB–20MB JPEG/PNG from a modern smartphone, it is uploaded and served verbatim. No resizing, no compression, and no format modernization occurs.
- **Heavy GIF Files for Menu Items**: Several menu items use `.gif` files. An animated GIF is typically **10x to 25x** the byte size of an equivalent modern WebP/MP4 image and causes high CPU and memory decoding on mobile browsers.
- **Unconstrained Image Rendering**: In `MenuCard.tsx`, `ItemDetailContent.tsx`, and `HomePage.tsx`, `<img src={item.image} />` downloads the original full-size image directly, even on screens needing only a 300px thumbnail.
- **Missing WebP/AVIF Format Adoption**: Images are served as PNG/JPEG/GIF rather than modern formats like WebP or AVIF, resulting in 50%–85% wasted bandwidth.

---

## Architecture: Cloudflare R2 + Sharp Image Optimization

To replace Cloudinary with zero egress fees and resolve site slowness permanently:

1. **Storage & Delivery: Cloudflare R2**
   - S3-compatible, ultra-low-cost storage with **$0 egress fees** (unlike AWS S3 and Cloudinary).
   - Generous free tier: 10 GB storage / month, 1M Class A operations (uploads/writes), 10M Class B operations (reads).
   - Can be served via a custom domain (e.g., `media.pizzacityoman.com` or `cdn.pizzacityoman.com`) or an R2 public bucket URL (`https://pub-xxxx.r2.dev`).

2. **Automated Server-Side Optimization with `sharp`**
   - Before any image is uploaded to R2, it passes through an automated `sharp` processing pipeline:
     - **Format Conversion**: Convert all uploads (JPEG, PNG, WebP, GIF) to optimized WebP.
     - **Dimension Constraints**:
       - Banners: Resized to max width 1920px (quality 82).
       - Menu items: Resized to max width 800px (quality 80).
       - Outlets/Thumbnails: Resized to max width 800px (quality 80).
     - **Metadata Stripping**: Remove EXIF, GPS, camera metadata to shave off unnecessary kilobytes.
     - **Size Reduction Expected**: An average 5MB camera upload will drop to **80KB–150KB** (97%+ reduction), and GIFs drop by 70%–90%!

3. **Data Migration Script**
   - A one-time script (`scripts/migrate-cloudinary-to-cloudflare.ts`) that:
     1. Connects to MongoDB and queries `MenuItem`, `Banner`, and `Branch`.
     2. Identifies all records with `res.cloudinary.com` URLs.
     3. Downloads each asset, optimizes it via `sharp`, and uploads to Cloudflare R2.
     4. Updates the MongoDB documents with the new Cloudflare URLs.
     5. Logs a detailed breakdown of bytes saved.

---

## User Review Required

> [!IMPORTANT]
> **Cloudflare R2 Credentials Needed**:
> To enable direct uploads and migration to Cloudflare R2, the following environment variables will need to be configured in `.env`:
> - `CLOUDFLARE_R2_ACCOUNT_ID`: Your Cloudflare Account ID (found on Cloudflare dashboard).
> - `CLOUDFLARE_R2_ACCESS_KEY_ID`: R2 API token Access Key ID.
> - `CLOUDFLARE_R2_SECRET_ACCESS_KEY`: R2 API token Secret Access Key.
> - `CLOUDFLARE_R2_BUCKET_NAME`: Name of your R2 bucket (e.g., `pizzacity-media`).
> - `CLOUDFLARE_R2_PUBLIC_URL`: The public base URL of your bucket (e.g., `https://media.pizzacityoman.com` or `https://pub-xxxxxxxx.r2.dev`).
>
> *(Note: We will design the code to gracefully support existing URLs, fallbacks, and local mock/safe mode if credentials are not yet populated during development.)*

> [!TIP]
> **GIF Handling Strategy**:
> Sharp can optimize animated GIFs into animated WebP format (significantly smaller) or convert the first frame into a crisp, static WebP food photo. We recommend converting menu item GIFs to optimized animated WebP or compressed WebP to keep visual appeal while saving 80%+ bandwidth.

---

## Proposed Changes

### Dependencies Layer

#### [MODIFY] [package.json](file:///c:/Users/j/Downloads/pizza-city-oman-backend/package.json)
- Add `@aws-sdk/client-s3` (S3 client for Cloudflare R2).
- Add `sharp` and `@types/sharp` (high-performance image processing).
- Remove `cloudinary` and `multer-storage-cloudinary`.

---

### Backend & Media Upload Engine

#### [NEW] [src/server/r2.ts](file:///c:/Users/j/Downloads/pizza-city-oman-backend/src/server/r2.ts) or inline in `server.ts`
- Initialize S3Client pointing to Cloudflare R2 endpoint (`https://${ACCOUNT_ID}.r2.cloudflarestorage.com`).
- Implement helper `uploadToR2(buffer, key, contentType)`.

#### [MODIFY] [server.ts](file:///c:/Users/j/Downloads/pizza-city-oman-backend/server.ts)
- Replace Cloudinary multer storage engine with memory storage (`multer.memoryStorage()`).
- Implement image optimization middleware in `/admin/api/upload`:
  - Enforce sane max upload size (e.g., 10MB input limit).
  - Pass input buffer through `sharp`:
    - Auto-rotate based on EXIF orientation.
    - Resize to max bounding box (1920x1080 for banners, 800x800 for menu/branches).
    - Convert to WebP format (quality 80-82).
    - Strip metadata.
  - Upload optimized buffer to Cloudflare R2.
  - Return `{ success: true, url: publicR2Url }`.
- Update seed data URLs (`SEED_MENU_ITEMS`, `SEED_BANNERS`, `SEED_BRANCHES`) to use optimized media URLs or CDN-ready fallbacks.

---

### Migration & Maintenance Tooling

#### [NEW] [scripts/migrate-cloudinary-to-cloudflare.ts](file:///c:/Users/j/Downloads/pizza-city-oman-backend/scripts/migrate-cloudinary-to-cloudflare.ts)
- CLI migration script:
  - Fetches all documents with Cloudinary URLs from MongoDB (`MenuItem`, `Banner`, `Branch`).
  - Downloads each asset from Cloudinary before account cut-off.
  - Runs the asset through `sharp` to shrink it.
  - Uploads the optimized asset to Cloudflare R2.
  - Updates the corresponding MongoDB document with the new Cloudflare URL.
  - Prints progress, total storage saved, and migration report.

---

### Frontend Media Optimization

#### [MODIFY] [index.html](file:///c:/Users/j/Downloads/pizza-city-oman-backend/index.html)
- Replace Cloudinary favicon URL with local/CDN asset.
- Replace `dns-prefetch` for Cloudinary with preconnect for Cloudflare media domain.

#### [MODIFY] [src/lib/images.ts](file:///c:/Users/j/Downloads/pizza-city-oman-backend/src/lib/images.ts)
- Add media helper utilities (URL formatting, fallback resolution).

#### [MODIFY] [src/pages/LocationsPage.tsx](file:///c:/Users/j/Downloads/pizza-city-oman-backend/src/pages/LocationsPage.tsx) & [src/pages/LocationDetailPage.tsx](file:///c:/Users/j/Downloads/pizza-city-oman-backend/src/pages/LocationDetailPage.tsx)
- Remove hardcoded `cloudinaryUrl()` logic and replace with standard media URL resolver.

#### [MODIFY] [src/components/AdminDashboard.tsx](file:///c:/Users/j/Downloads/pizza-city-oman-backend/src/components/AdminDashboard.tsx)
- Replace Cloudinary logo with local/CDN asset.
- Update upload status messages (highlighting automatic WebP compression).

#### [MODIFY] [src/components/MenuCard.tsx](file:///c:/Users/j/Downloads/pizza-city-oman-backend/src/components/MenuCard.tsx)
- Add explicit image dimensions/aspect-ratio styling to prevent layout shifts.
- Maintain `loading="lazy"` with `decoding="async"`.

---

### Configuration & Environment

#### [MODIFY] [.env.example](file:///c:/Users/j/Downloads/pizza-city-oman-backend/.env.example) & [.env](file:///c:/Users/j/Downloads/pizza-city-oman-backend/.env)
- Remove `CLOUDINARY_*` variables.
- Add `CLOUDFLARE_R2_*` variables with clear setup comments.

---

## Verification Plan

### Automated & Build Tests
- Verify TypeScript compilation:
  ```powershell
  npm run lint
  ```
- Verify Vite frontend and esbuild server builds:
  ```powershell
  npm run build
  ```

### Functional & Media Verification
1. **Upload Testing**:
   - Send test image upload request through `/admin/api/upload` with mock/real R2 credentials.
   - Verify that output format is WebP and file size is reduced by >80%.
2. **Image Integrity**:
   - Verify menu cards, hero banners, and outlet images render properly with no broken links or layout shifts.
3. **Migration Dry Run / Validation**:
   - Test migration script in dry-run mode to list all Cloudinary assets and calculate projected size savings.
