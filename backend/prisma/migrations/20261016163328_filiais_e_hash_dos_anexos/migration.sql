-- AlterEnum
ALTER TYPE "AcaoDeAuditoria" ADD VALUE 'CADASTRO_ALTERADO';

-- AlterTable
ALTER TABLE "anexos" ADD COLUMN     "sha256" TEXT;

-- AlterTable
ALTER TABLE "solicitacoes" ADD COLUMN     "filial_id" TEXT;

-- CreateTable
CREATE TABLE "filiais" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "filiais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "filiais_empresa_id_nome_key" ON "filiais"("empresa_id", "nome");

-- CreateIndex
CREATE INDEX "anexos_empresa_id_sha256_idx" ON "anexos"("empresa_id", "sha256");

-- AddForeignKey
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_filial_id_fkey" FOREIGN KEY ("filial_id") REFERENCES "filiais"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "filiais" ADD CONSTRAINT "filiais_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
