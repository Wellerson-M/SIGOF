#!/bin/sh
# Ponto de entrada do contêiner: migra o banco e sobe a API.
set -e

# Aplica as migrações versionadas que ainda não rodaram neste banco.
# Idempotente: se não há nada novo, não faz nada.
npx prisma migrate deploy

# No staging, preenche os dados de demonstração na primeira subida.
# O próprio seed se recusa a rodar com NODE_ENV=production.
if [ "$SEMEAR_SE_VAZIO" = "true" ]; then
  npx tsx src/banco/seed.ts --se-vazio
fi

# exec: o Node vira o processo principal e recebe o SIGTERM do Docker,
# o que permite o encerramento gracioso (server.ts)
exec node dist/http/server.js
