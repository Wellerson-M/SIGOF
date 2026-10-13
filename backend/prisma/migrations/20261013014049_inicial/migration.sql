-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('SOLICITANTE', 'ANALISTA', 'SUPERVISOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "Area" AS ENUM ('FINANCEIRO', 'COMERCIAL', 'OPERACIONAL');

-- CreateEnum
CREATE TYPE "TipoOcorrencia" AS ENUM ('REVERSAO', 'TROCA_PAGADOR', 'AJUSTE_FISCAL', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusSolicitacao" AS ENUM ('NOVO', 'EM_ANDAMENTO', 'AGUARDANDO_DOC', 'ESCALADO', 'RESOLVIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "Prioridade" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "razao_social" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fuso_horario" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "expediente_inicio_minuto" INTEGER NOT NULL DEFAULT 480,
    "expediente_fim_minuto" INTEGER NOT NULL DEFAULT 1080,
    "dias_uteis" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "sla_atendimento_minutos" INTEGER NOT NULL DEFAULT 240,
    "janela_duplicidade_dias" INTEGER NOT NULL DEFAULT 7,
    "email_caixa_central" TEXT,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL,
    "area" "Area",
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitacoes" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "protocolo" TEXT NOT NULL,
    "solicitante_id" TEXT NOT NULL,
    "responsavel_id" TEXT,
    "tipo" "TipoOcorrencia" NOT NULL,
    "cte" TEXT,
    "nf" TEXT,
    "pagador_correto" TEXT,
    "descricao" TEXT NOT NULL,
    "status" "StatusSolicitacao" NOT NULL DEFAULT 'NOVO',
    "prioridade" "Prioridade" NOT NULL DEFAULT 'MEDIA',
    "sla_vence_em" TIMESTAMP(3),
    "sla_pausado_em" TIMESTAMP(3),
    "sla_minutos_pausados" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "resolvido_em" TIMESTAMP(3),

    CONSTRAINT "solicitacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequencias_protocolo" (
    "empresa_id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sequencias_protocolo_pkey" PRIMARY KEY ("empresa_id","ano","mes")
);

-- CreateTable
CREATE TABLE "mensagens" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "solicitacao_id" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "interna" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anexos" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "solicitacao_id" TEXT NOT NULL,
    "enviado_por_id" TEXT NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "chave_storage" TEXT NOT NULL,
    "tipo_mime" TEXT NOT NULL,
    "tamanho_bytes" INTEGER NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anexos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_historicos" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "solicitacao_id" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "status_anterior" "StatusSolicitacao",
    "status_novo" "StatusSolicitacao" NOT NULL,
    "observacao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_historicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "solicitacao_id" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresas_cnpj_key" ON "empresas"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "empresas_slug_key" ON "empresas"("slug");

-- CreateIndex
CREATE INDEX "usuarios_empresa_id_idx" ON "usuarios"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_empresa_id_email_key" ON "usuarios"("empresa_id", "email");

-- CreateIndex
CREATE INDEX "solicitacoes_empresa_id_cte_idx" ON "solicitacoes"("empresa_id", "cte");

-- CreateIndex
CREATE INDEX "solicitacoes_empresa_id_nf_idx" ON "solicitacoes"("empresa_id", "nf");

-- CreateIndex
CREATE INDEX "solicitacoes_empresa_id_status_idx" ON "solicitacoes"("empresa_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "solicitacoes_empresa_id_protocolo_key" ON "solicitacoes"("empresa_id", "protocolo");

-- CreateIndex
CREATE INDEX "mensagens_empresa_id_solicitacao_id_idx" ON "mensagens"("empresa_id", "solicitacao_id");

-- CreateIndex
CREATE INDEX "anexos_empresa_id_solicitacao_id_idx" ON "anexos"("empresa_id", "solicitacao_id");

-- CreateIndex
CREATE INDEX "status_historicos_empresa_id_solicitacao_id_idx" ON "status_historicos"("empresa_id", "solicitacao_id");

-- CreateIndex
CREATE INDEX "notificacoes_empresa_id_usuario_id_lida_idx" ON "notificacoes"("empresa_id", "usuario_id", "lida");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequencias_protocolo" ADD CONSTRAINT "sequencias_protocolo_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_historicos" ADD CONSTRAINT "status_historicos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_historicos" ADD CONSTRAINT "status_historicos_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_historicos" ADD CONSTRAINT "status_historicos_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
