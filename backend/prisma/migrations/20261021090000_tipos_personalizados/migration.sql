-- Tipos de ocorrência personalizáveis: o tipo deixa de ser enum e vira
-- texto (código). Os quatro do sistema continuam com os mesmos códigos;
-- a empresa pode renomeá-los e criar os seus.

ALTER TABLE "solicitacoes" ALTER COLUMN "tipo" TYPE TEXT USING "tipo"::TEXT;

ALTER TABLE "configuracoes_do_formulario"
  ALTER COLUMN "tipo" TYPE TEXT USING "tipo"::TEXT,
  ADD COLUMN "nome" TEXT,
  ADD COLUMN "da_empresa" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "itens_de_verificacao" ALTER COLUMN "tipos" DROP DEFAULT;
ALTER TABLE "itens_de_verificacao" ALTER COLUMN "tipos" TYPE TEXT[] USING "tipos"::TEXT[];
ALTER TABLE "itens_de_verificacao" ALTER COLUMN "tipos" SET DEFAULT ARRAY[]::TEXT[];

DROP TYPE "TipoOcorrencia";
