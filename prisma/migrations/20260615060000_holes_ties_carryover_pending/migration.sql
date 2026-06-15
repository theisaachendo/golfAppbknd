-- AlterTable
ALTER TABLE "Game" ALTER COLUMN "numHoles" SET DEFAULT 18;

-- AlterTable
ALTER TABLE "Hole" DROP COLUMN "confirmedById",
DROP COLUMN "proposedWinnerId",
ADD COLUMN     "pendingById" TEXT,
ADD COLUMN     "pendingTied" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pendingWinnerId" TEXT,
ADD COLUMN     "tied" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "par" SET DEFAULT 4;

