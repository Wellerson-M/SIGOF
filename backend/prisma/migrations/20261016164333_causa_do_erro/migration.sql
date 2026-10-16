-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "exigir_causa_ao_resolver" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "solicitacoes" ADD COLUMN     "causa_comentario" TEXT,
ADD COLUMN     "causa_detalhe" TEXT,
ADD COLUMN     "causa_id" TEXT;

-- CreateTable
CREATE TABLE "causas_de_erro" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "opcoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rotulo_das_opcoes" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "causas_de_erro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "causas_de_erro_empresa_id_nome_key" ON "causas_de_erro"("empresa_id", "nome");

-- AddForeignKey
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_causa_id_fkey" FOREIGN KEY ("causa_id") REFERENCES "causas_de_erro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "causas_de_erro" ADD CONSTRAINT "causas_de_erro_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Lista inicial para as empresas que já existem; o administrador ajusta em
-- Administração → Causas de erro (digitadores, nomes, quais usar).
INSERT INTO "causas_de_erro" ("id", "empresa_id", "nome", "rotulo_das_opcoes", "ordem")
SELECT gen_random_uuid()::text, e."id", c."nome", c."rotulo", c."ordem"
FROM "empresas" e
CROSS JOIN (VALUES
  ('Erro de digitação', 'Digitador', 1),
  ('Erro do cliente', NULL, 2),
  ('Erro comercial', NULL, 3),
  ('Erro operacional', NULL, 4),
  ('Outros', NULL, 5)
) AS c("nome", "rotulo", "ordem");
