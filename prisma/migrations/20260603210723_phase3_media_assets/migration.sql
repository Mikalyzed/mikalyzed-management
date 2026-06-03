-- Phase 3 — MediaAsset table for typed vehicle media (photos, videos, docs)
CREATE TABLE "public"."media_assets" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "r2_key" TEXT NOT NULL,
    "content_type" TEXT,
    "size_bytes" INTEGER,
    "filename" TEXT,
    "caption" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "uploaded_by_id" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "media_assets_vehicle_id_idx" ON "public"."media_assets"("vehicle_id");
CREATE INDEX "media_assets_type_idx" ON "public"."media_assets"("type");
CREATE INDEX "media_assets_uploaded_at_idx" ON "public"."media_assets"("uploaded_at");
ALTER TABLE "public"."media_assets" ADD CONSTRAINT "media_assets_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."media_assets" ADD CONSTRAINT "media_assets_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
