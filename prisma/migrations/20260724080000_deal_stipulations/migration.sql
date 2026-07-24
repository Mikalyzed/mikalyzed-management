-- CreateTable
CREATE TABLE "deal_stipulations" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instruction" TEXT,
    "for_buyer" BOOLEAN NOT NULL DEFAULT true,
    "for_co_buyer" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sent_via" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_at" TIMESTAMP(3),

    CONSTRAINT "deal_stipulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stip_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instruction" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stip_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deal_stipulations_deal_id_idx" ON "deal_stipulations"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "stip_templates_name_key" ON "stip_templates"("name");

-- AddForeignKey
ALTER TABLE "deal_stipulations" ADD CONSTRAINT "deal_stipulations_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

