-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AcaoDeAuditoria" ADD VALUE 'MODULOS_ALTERADOS';
ALTER TYPE "AcaoDeAuditoria" ADD VALUE 'FORMULARIO_ALTERADO';

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "modulos_ativos" TEXT[] DEFAULT ARRAY['FILIAIS', 'CAUSA_DO_ERRO', 'VERIFICACOES', 'REGISTRO_RAPIDO', 'EMAIL', 'BALANCO', 'FORMULARIO']::TEXT[],
ADD COLUMN     "modulos_liberados" TEXT[] DEFAULT ARRAY['FILIAIS', 'CAUSA_DO_ERRO', 'VERIFICACOES', 'REGISTRO_RAPIDO', 'EMAIL', 'BALANCO', 'FORMULARIO']::TEXT[];

-- AlterTable
ALTER TABLE "solicitacoes" ADD COLUMN     "motivo" TEXT;

-- CreateTable
CREATE TABLE "configuracoes_do_formulario" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "tipo" "TipoOcorrencia" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "exigir_documento" BOOLEAN,
    "campos" JSONB NOT NULL DEFAULT '{}',
    "motivos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "alterado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracoes_do_formulario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "configuracoes_do_formulario_empresa_id_tipo_key" ON "configuracoes_do_formulario"("empresa_id", "tipo");

-- AddForeignKey
ALTER TABLE "configuracoes_do_formulario" ADD CONSTRAINT "configuracoes_do_formulario_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
