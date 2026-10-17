-- CreateTable
CREATE TABLE "producao_dos_digitadores" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "digitador" TEXT NOT NULL,
    "ctes_emitidos" INTEGER NOT NULL,
    "importado_por_id" TEXT NOT NULL,
    "importado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producao_dos_digitadores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "producao_dos_digitadores_empresa_id_mes_digitador_key" ON "producao_dos_digitadores"("empresa_id", "mes", "digitador");

-- AddForeignKey
ALTER TABLE "producao_dos_digitadores" ADD CONSTRAINT "producao_dos_digitadores_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
