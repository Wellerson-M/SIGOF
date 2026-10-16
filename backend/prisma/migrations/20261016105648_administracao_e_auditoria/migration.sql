-- CreateEnum
CREATE TYPE "AcaoDeAuditoria" AS ENUM ('LOGIN', 'LOGIN_RECUSADO', 'SAIDA', 'SENHA_ALTERADA', 'USUARIO_CRIADO', 'USUARIO_ALTERADO', 'SENHA_REDEFINIDA', 'EMPRESA_ALTERADA');

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "trocar_senha" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ultimo_acesso_em" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "eventos_auditoria" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "autor_id" TEXT,
    "alvo_id" TEXT,
    "acao" "AcaoDeAuditoria" NOT NULL,
    "detalhes" JSONB,
    "ip" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eventos_auditoria_empresa_id_criado_em_idx" ON "eventos_auditoria"("empresa_id", "criado_em");

-- AddForeignKey
ALTER TABLE "eventos_auditoria" ADD CONSTRAINT "eventos_auditoria_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_auditoria" ADD CONSTRAINT "eventos_auditoria_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_auditoria" ADD CONSTRAINT "eventos_auditoria_alvo_id_fkey" FOREIGN KEY ("alvo_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A trilha de auditoria só recebe inserções: nem a própria aplicação
-- consegue reescrever um evento já gravado (RNF09)
CREATE FUNCTION eventos_auditoria_imutaveis() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'eventos de auditoria não podem ser alterados';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER eventos_auditoria_sem_update
  BEFORE UPDATE ON "eventos_auditoria"
  FOR EACH ROW EXECUTE FUNCTION eventos_auditoria_imutaveis();
