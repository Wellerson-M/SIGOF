-- Várias caixas centrais (o setor, o gerente...): a coluna vira lista,
-- levando junto o endereço que já estava configurado.
ALTER TABLE "empresas" ADD COLUMN "emails_caixa_central" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "empresas"
SET "emails_caixa_central" = ARRAY["email_caixa_central"]
WHERE "email_caixa_central" IS NOT NULL AND "email_caixa_central" <> '';

ALTER TABLE "empresas" DROP COLUMN "email_caixa_central";
