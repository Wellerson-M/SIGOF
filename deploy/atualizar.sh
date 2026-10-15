#!/bin/sh
# Entrega contínua por "puxada" (pull-based): roda no servidor a cada minuto
# (sigof-atualizar.timer).
#
# Antes dele, o próprio serviço já trouxe a configuração mais recente da
# main (compose.yml, Caddyfile e este script). Aqui:
# 1. baixa as imagens novas, se houver;
# 2. recria só os contêineres que mudaram; os outros nem piscam.
#
# O servidor não precisa de nenhuma porta de administração aberta nem de
# senha guardada no GitHub: é ele quem busca, nunca alguém que empurra.
set -eu

cd /opt/sigof/repo/deploy
# Segredos ficam fora do repositório, em /opt/sigof/.env (gerado na criação da VM)
docker compose --env-file /opt/sigof/.env pull -q
docker compose --env-file /opt/sigof/.env up -d --remove-orphans

# Imagens antigas ocupam disco à toa
docker image prune -f > /dev/null
