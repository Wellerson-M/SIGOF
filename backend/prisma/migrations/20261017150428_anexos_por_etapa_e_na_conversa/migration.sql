-- CreateEnum
CREATE TYPE "EtapaDoAnexo" AS ENUM ('ABERTURA', 'ANDAMENTO', 'RESOLUCAO');

-- AlterTable
ALTER TABLE "anexos" ADD COLUMN     "etapa" "EtapaDoAnexo" NOT NULL DEFAULT 'ANDAMENTO',
ADD COLUMN     "mensagem_id" TEXT;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_mensagem_id_fkey" FOREIGN KEY ("mensagem_id") REFERENCES "mensagens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
