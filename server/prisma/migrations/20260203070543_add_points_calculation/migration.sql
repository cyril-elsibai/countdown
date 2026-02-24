-- CreateEnum
CREATE TYPE "PointsCalculationStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Frame" ADD COLUMN     "completionPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "solvedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PointsCalculation" (
    "id" TEXT NOT NULL,
    "status" "PointsCalculationStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "framesProcessed" INTEGER NOT NULL DEFAULT 0,
    "usersProcessed" INTEGER NOT NULL DEFAULT 0,
    "resultsProcessed" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "error" TEXT,
    "triggeredBy" TEXT,

    CONSTRAINT "PointsCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameResult_frameId_solved_idx" ON "GameResult"("frameId", "solved");

-- CreateIndex
CREATE INDEX "GameResult_solved_frameId_idx" ON "GameResult"("solved", "frameId");
