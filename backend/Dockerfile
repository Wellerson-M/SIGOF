# Imagem do backend do SIGOF para staging e produção (RFC seção 5.8).
#
# Multi-stage: compila numa etapa e leva para a imagem final só o necessário.
# Roda com o usuário sem privilégios `node`, nunca como root.

FROM node:22-alpine AS base
WORKDIR /app

# --- Dependências (camada separada: só é refeita se o package-lock mudar)
FROM base AS dependencias
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# O postinstall roda `prisma generate`, que precisa do schema copiado acima
RUN npm ci

# --- Compilação do TypeScript
FROM dependencias AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Imagem final
FROM base AS final
ENV NODE_ENV=production
# Commit que gerou a imagem; aparece em GET /health
ARG VERSAO=local
ENV VERSAO=$VERSAO
# Data do commit, mostrada junto com a versão na tela
ARG CONSTRUIDO_EM=
ENV CONSTRUIDO_EM=$CONSTRUIDO_EM

# As dependências de desenvolvimento ficam: o CLI do Prisma aplica as
# migrações na subida, e o tsx roda o seed no staging
COPY --from=dependencias --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json prisma.config.ts tsconfig.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node src ./src
COPY --chown=node:node docker-entrypoint.sh ./

USER node
EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3333/health || exit 1

ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
