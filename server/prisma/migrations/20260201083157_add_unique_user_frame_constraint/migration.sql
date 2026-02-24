/*
  Warnings:

  - A unique constraint covering the columns `[userId,frameId]` on the table `GameResult` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "GameResult_userId_frameId_key" ON "GameResult"("userId", "frameId");
