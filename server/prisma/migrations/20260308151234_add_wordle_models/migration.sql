-- CreateTable
CREATE TABLE "WordleWord" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "wordLength" INTEGER NOT NULL,
    "date" TIMESTAMP(3),
    "name" TEXT,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WordleWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordleResult" (
    "id" TEXT NOT NULL,
    "guesses" TEXT[],
    "solved" BOOLEAN NOT NULL DEFAULT false,
    "duration" DOUBLE PRECISION,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "wordId" TEXT NOT NULL,

    CONSTRAINT "WordleResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordleAttempt" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,

    CONSTRAINT "WordleAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WordleWord_date_key" ON "WordleWord"("date");

-- CreateIndex
CREATE UNIQUE INDEX "WordleWord_name_key" ON "WordleWord"("name");

-- CreateIndex
CREATE INDEX "WordleResult_wordId_solved_idx" ON "WordleResult"("wordId", "solved");

-- CreateIndex
CREATE UNIQUE INDEX "WordleResult_userId_wordId_key" ON "WordleResult"("userId", "wordId");

-- CreateIndex
CREATE UNIQUE INDEX "WordleAttempt_userId_wordId_key" ON "WordleAttempt"("userId", "wordId");

-- AddForeignKey
ALTER TABLE "WordleResult" ADD CONSTRAINT "WordleResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordleResult" ADD CONSTRAINT "WordleResult_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "WordleWord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordleAttempt" ADD CONSTRAINT "WordleAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordleAttempt" ADD CONSTRAINT "WordleAttempt_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "WordleWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
