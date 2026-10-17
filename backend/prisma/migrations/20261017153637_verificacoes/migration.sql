-- CreateEnum
CREATE TYPE "QuemMarca" AS ENUM ('SOLICITANTE', 'EQUIPE', 'QUALQUER');

-- CreateTable
CREATE TABLE "itens_de_verificacao" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "tipos" "TipoOcorrencia"[] DEFAULT ARRAY[]::"TipoOcorrencia"[],
    "quem_marca" "QuemMarca" NOT NULL DEFAULT 'QUALQUER',
    "obrigatorio_para_resolver" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "itens_de_verificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marcacoes_de_verificacao" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "solicitacao_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "marcado_por_id" TEXT NOT NULL,
    "marcado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marcacoes_de_verificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "itens_de_verificacao_empresa_id_idx" ON "itens_de_verificacao"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "marcacoes_de_verificacao_solicitacao_id_item_id_key" ON "marcacoes_de_verificacao"("solicitacao_id", "item_id");

-- AddForeignKey
ALTER TABLE "itens_de_verificacao" ADD CONSTRAINT "itens_de_verificacao_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marcacoes_de_verificacao" ADD CONSTRAINT "marcacoes_de_verificacao_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marcacoes_de_verificacao" ADD CONSTRAINT "marcacoes_de_verificacao_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marcacoes_de_verificacao" ADD CONSTRAINT "marcacoes_de_verificacao_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "itens_de_verificacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marcacoes_de_verificacao" ADD CONSTRAINT "marcacoes_de_verificacao_marcado_por_id_fkey" FOREIGN KEY ("marcado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
