-- CreateTable
CREATE TABLE "administradores_da_plataforma" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "trocar_senha" BOOLEAN NOT NULL DEFAULT true,
    "falhas_de_login" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_ate" TIMESTAMP(3),
    "ultimo_acesso_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "administradores_da_plataforma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_da_plataforma" (
    "id" TEXT NOT NULL,
    "administrador_id" TEXT,
    "acao" TEXT NOT NULL,
    "empresa_id" TEXT,
    "detalhes" JSONB,
    "ip" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_da_plataforma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "administradores_da_plataforma_email_key" ON "administradores_da_plataforma"("email");

-- CreateIndex
CREATE INDEX "eventos_da_plataforma_criado_em_idx" ON "eventos_da_plataforma"("criado_em");

-- AddForeignKey
ALTER TABLE "eventos_da_plataforma" ADD CONSTRAINT "eventos_da_plataforma_administrador_id_fkey" FOREIGN KEY ("administrador_id") REFERENCES "administradores_da_plataforma"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A trilha da plataforma também só recebe inserções
CREATE TRIGGER eventos_da_plataforma_sem_update
  BEFORE UPDATE ON "eventos_da_plataforma"
  FOR EACH ROW EXECUTE FUNCTION eventos_auditoria_imutaveis();
