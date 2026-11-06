-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AcaoDeAuditoria" ADD VALUE 'RECUPERACAO_SOLICITADA';
ALTER TYPE "AcaoDeAuditoria" ADD VALUE 'SENHA_RECUPERADA';

-- CreateTable
CREATE TABLE "recuperacoes_de_senha" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "usado_em" TIMESTAMP(3),
    "ip" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recuperacoes_de_senha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recuperacoes_de_senha_token_hash_key" ON "recuperacoes_de_senha"("token_hash");

-- CreateIndex
CREATE INDEX "recuperacoes_de_senha_usuario_id_criado_em_idx" ON "recuperacoes_de_senha"("usuario_id", "criado_em");

-- AddForeignKey
ALTER TABLE "recuperacoes_de_senha" ADD CONSTRAINT "recuperacoes_de_senha_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recuperacoes_de_senha" ADD CONSTRAINT "recuperacoes_de_senha_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
