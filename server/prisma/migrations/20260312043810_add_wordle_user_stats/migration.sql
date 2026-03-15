-- CreateTable
CREATE TABLE "WordleUserStats" (
    "id" TEXT NOT NULL,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "lastCalculated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "WordleUserStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WordleUserStats_userId_key" ON "WordleUserStats"("userId");

-- AddForeignKey
ALTER TABLE "WordleUserStats" ADD CONSTRAINT "WordleUserStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
