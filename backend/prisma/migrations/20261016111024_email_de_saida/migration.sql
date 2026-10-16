-- CreateEnum
CREATE TYPE "SituacaoDoEmail" AS ENUM ('PENDENTE', 'ENVIADO', 'FALHOU');

-- AlterEnum
ALTER TYPE "AcaoDeAuditoria" ADD VALUE 'EMAIL_CONFIGURADO';

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "email_ativo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "email_remetente_nome" TEXT,
ADD COLUMN     "smtp_porta" INTEGER,
ADD COLUMN     "smtp_senha_cifrada" TEXT,
ADD COLUMN     "smtp_servidor" TEXT,
ADD COLUMN     "smtp_tls_direto" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "smtp_usuario" TEXT;

-- CreateTable
CREATE TABLE "emails_saida" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "solicitacao_id" TEXT,
    "para" TEXT[],
    "assunto" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "respondendo_a" TEXT,
    "situacao" "SituacaoDoEmail" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "tentar_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_erro" TEXT,
    "enviado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emails_saida_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "emails_saida_message_id_key" ON "emails_saida"("message_id");

-- CreateIndex
CREATE INDEX "emails_saida_situacao_tentar_em_idx" ON "emails_saida"("situacao", "tentar_em");

-- CreateIndex
CREATE INDEX "emails_saida_empresa_id_solicitacao_id_idx" ON "emails_saida"("empresa_id", "solicitacao_id");

-- AddForeignKey
ALTER TABLE "emails_saida" ADD CONSTRAINT "emails_saida_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails_saida" ADD CONSTRAINT "emails_saida_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
