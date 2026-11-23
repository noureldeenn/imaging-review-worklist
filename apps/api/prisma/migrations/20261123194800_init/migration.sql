-- CreateEnum
CREATE TYPE "StudyStatus" AS ENUM ('Unassigned', 'InReview', 'Completed');

-- CreateTable
CREATE TABLE "Reviewer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Reviewer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Study" (
    "id" TEXT NOT NULL,
    "modality" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "status" "StudyStatus" NOT NULL DEFAULT 'Unassigned',
    "ownerId" TEXT,
    "reviewNote" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "fileKey" TEXT NOT NULL,

    CONSTRAINT "Study_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Study_status_modality_idx" ON "Study"("status", "modality");

-- CreateIndex
CREATE INDEX "Study_createdAt_id_idx" ON "Study"("createdAt", "id");

-- AddForeignKey
ALTER TABLE "Study" ADD CONSTRAINT "Study_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Reviewer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
