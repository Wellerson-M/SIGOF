-- AlterEnum
ALTER TYPE "AcaoDeAuditoria" ADD VALUE 'SOLICITACAO_EXCLUIDA';

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "analista_atribui" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "dias_no_quadro_depois_de_encerrar" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "minutos_para_excluir_anexo" INTEGER NOT NULL DEFAULT 15,
ALTER COLUMN "modulos_ativos" SET DEFAULT ARRAY['FILIAIS', 'CAUSA_DO_ERRO', 'VERIFICACOES', 'REGISTRO_RAPIDO', 'EMAIL', 'BALANCO', 'FORMULARIO', 'EXCLUSAO_DE_SOLICITACOES', 'EXCLUSAO_DE_ANEXOS']::TEXT[],
ALTER COLUMN "modulos_liberados" SET DEFAULT ARRAY['FILIAIS', 'CAUSA_DO_ERRO', 'VERIFICACOES', 'REGISTRO_RAPIDO', 'EMAIL', 'BALANCO', 'FORMULARIO', 'EXCLUSAO_DE_SOLICITACOES', 'EXCLUSAO_DE_ANEXOS']::TEXT[];

-- AlterTable
ALTER TABLE "sessoes" ADD COLUMN     "inicio_da_familia" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "solicitacoes" ADD COLUMN     "excluida_em" TIMESTAMP(3),
ADD COLUMN     "excluida_por_id" TEXT;

-- As empresas que já existem ganham os dois módulos novos liberados e
-- ligados, como as novas
UPDATE "empresas"
SET "modulos_liberados" = "modulos_liberados" || ARRAY['EXCLUSAO_DE_SOLICITACOES', 'EXCLUSAO_DE_ANEXOS']::TEXT[],
    "modulos_ativos" = "modulos_ativos" || ARRAY['EXCLUSAO_DE_SOLICITACOES', 'EXCLUSAO_DE_ANEXOS']::TEXT[];
