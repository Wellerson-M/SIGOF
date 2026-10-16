-- AlterTable
ALTER TABLE "sessoes" ADD COLUMN     "recuperada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "substituida_por_id" TEXT;
