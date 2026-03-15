-- AlterTable
ALTER TABLE "WordleWord" ADD COLUMN "randomNumber" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "WordleWord_randomNumber_key" ON "WordleWord"("randomNumber");
