-- AlterTable
ALTER TABLE "solicitacoes" ADD COLUMN     "ctes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "fatura" TEXT,
ADD COLUMN     "nfs" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- As que já existem passam a ter a lista com o documento que tinham
UPDATE "solicitacoes" SET "ctes" = ARRAY["cte"] WHERE "cte" IS NOT NULL;
UPDATE "solicitacoes" SET "nfs" = ARRAY["nf"] WHERE "nf" IS NOT NULL;

-- A duplicidade procura "algum número em comum": índice próprio de lista
CREATE INDEX "solicitacoes_ctes_idx" ON "solicitacoes" USING GIN ("ctes");
CREATE INDEX "solicitacoes_nfs_idx" ON "solicitacoes" USING GIN ("nfs");
