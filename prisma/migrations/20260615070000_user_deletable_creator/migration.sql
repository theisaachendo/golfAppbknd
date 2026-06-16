-- DropForeignKey
ALTER TABLE "Game" DROP CONSTRAINT "Game_createdByUserId_fkey";

-- AlterTable
ALTER TABLE "Game" ALTER COLUMN "createdByUserId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

