-- AlterTable
ALTER TABLE "emails_saida" ADD COLUMN     "agrupar_ate" TIMESTAMP(3),
ADD COLUMN     "itens" JSONB;

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "email_eventos" TEXT[] DEFAULT ARRAY['ABERTA', 'STATUS', 'MENSAGEM', 'ANEXO']::TEXT[];
