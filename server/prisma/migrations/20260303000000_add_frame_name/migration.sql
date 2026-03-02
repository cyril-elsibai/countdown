-- AlterTable
ALTER TABLE "Frame" ADD COLUMN "name" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Frame_name_key" ON "Frame"("name");
