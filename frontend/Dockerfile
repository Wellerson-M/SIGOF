# Imagem do frontend do SIGOF para staging e produção.
#
# Usa o "standalone" do Next: a imagem final leva só o servidor enxuto e os
# arquivos estáticos, sem as dependências de desenvolvimento.

FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencias
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencias AS build
COPY . .
RUN npm run build

FROM base AS final
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/entrar || exit 1

CMD ["node", "server.js"]
