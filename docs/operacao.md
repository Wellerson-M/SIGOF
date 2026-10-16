# Operação: ambientes, publicação e recuperação

## Ambientes

| Ambiente | Onde | Atualiza quando | Dados |
|---|---|---|---|
| **Desenvolvimento** | Notebook de quem desenvolve (`scripts\iniciar.cmd`) | A cada mudança salva | Demonstração (`Demo@2026`) |
| **Staging** | https://sigof-staging.northcentralus.cloudapp.azure.com | **Sozinho, a cada merge na `main`** | Demonstração, com senha aleatória gerada no servidor |
| **Produção** | Mesmo servidor, endereço próprio *(a implementar — issue #48)* | **Só quando uma release é publicada** | Reais |

Staging e produção usam **a mesma imagem Docker**: o que vai para a produção é exatamente o que foi testado no staging.

## Servidor

- VM Linux na Azure (`rg-sigof` / `vm-sigof`, região North Central US) criada por [`deploy/provisionar-azure.sh`](../deploy/provisionar-azure.sh) e configurada por [`deploy/cloud-init.yaml`](../deploy/cloud-init.yaml) (infraestrutura como código).
- Contêineres ([`deploy/compose.yml`](../deploy/compose.yml)):
  - **Caddy** (HTTPS automático): manda `/api` e `/health` para a API e o resto para as telas;
  - **API**;
  - **telas**;
  - **PostgreSQL**, sem porta aberta para a internet.
- Só as portas 80 e 443 estão abertas. **Não há acesso por SSH**: a manutenção usa `az vm run-command`, autenticado na Azure.
- Os segredos (senha do banco, chave dos tokens, senha de demonstração) são gerados na própria VM, em `/opt/sigof/.env`, e nunca passam pelo GitHub.

## Como uma mudança chega ao staging

1. Merge na `main`.
2. O workflow **Entrega** (GitHub Actions) monta as imagens da API e das telas, grava o commit nelas e publica no GitHub Container Registry com a etiqueta `staging`.
3. A cada minuto, o servidor ([`deploy/atualizar.sh`](../deploy/atualizar.sh)) busca a configuração da `main` e as imagens novas. Ele só troca os contêineres quando **API e telas são do mesmo commit**.
4. O workflow confere em `/health` que o commit novo está no ar e falha se isso não acontecer em 10 minutos.
5. Se o `deploy/caddy/Caddyfile` mudou, o atualizador manda o Caddy recarregar a configuração (`caddy reload`), sem derrubar conexões. O Caddy só lê o arquivo ao iniciar: sem esse passo, uma rota nova não valeria.

## Release e produção *(a implementar — issue #48)*

A produção **nunca** recebe um merge direto. O fluxo planejado é este:

1. A versão é testada no staging (Roteiro de testes).
2. No GitHub: **Releases → Draft a new release** e, em seguida, crie uma tag no formato `vMAIOR.MENOR.CORREÇÃO`, seguindo o [versionamento semântico](https://semver.org/lang/pt-BR/):
   - `v1.0.0`: primeira versão para a empresa parceira;
   - `v1.1.0`: funcionalidade nova;
   - `v1.0.1`: só correção.
3. Escreva as notas da versão (o botão *Generate release notes* lista os PRs) e clique em **Publish release**.
4. Um workflow etiqueta como `producao` **as mesmas imagens já testadas no staging**, sem montar de novo, e o servidor atualiza a produção.
5. **Voltar atrás:** publicar de novo a release anterior. A produção volta para aquelas imagens.

## E-mail de saída

Cada empresa envia os avisos pela **própria conta de e-mail**, configurada pelo administrador em **Administração → E-mail**:

- **E-mail de envio:** servidor SMTP, porta, login e senha. Para o Gmail: botão *Usar Gmail* (`smtp.gmail.com`, porta 465) e uma **senha de app** (exige verificação em duas etapas; criada em myaccount.google.com/apppasswords). A senha é cifrada com AES-256-GCM antes de ir ao banco, com a chave `CHAVE_CIFRA`, que só existe no servidor.
- **Caixa central:** recebe cópia de tudo. Quem abriu a solicitação e o responsável também recebem; quem fez a movimentação, não.
- **Uma conversa por protocolo:** o assunto é fixo (`[SIGOF SOL-AAAA-MM-NNNN] Tipo — CTe`) e cada e-mail responde ao primeiro (`In-Reply-To`/`References`). Gmail e Outlook mostram tudo junto.
- **Não responda:** toda mensagem avisa que é automática; respostas por e-mail não entram no sistema (a entrada por e-mail fica para depois do TCC).
- **Notas internas não saem por e-mail.**

**Fila (outbox).** O e-mail é gravado na mesma transação da movimentação, na tabela `emails_saida`, e enviado em segundo plano pela própria API a cada `EMAIL_INTERVALO_SEGUNDOS` (padrão 15). Se o provedor falhar, tenta de novo depois de 1, 5, 15 e 60 minutos; na quinta falha, fica como **Falhou**, com o erro registrado. Cada envio aparece no detalhe da solicitação (para a equipe) e em *Administração → E-mail → Últimos envios*.

**No computador**, o `docker compose up -d` também sobe o **Mailpit**, uma caixa de correio de mentira: configure o envio com servidor `localhost`, porta `1025`, sem conexão segura, qualquer login e senha, e veja os e-mails em http://localhost:8025.

## Diagnóstico

Ver os últimos logs da API de staging (precisa do `az login`):

```bash
az vm run-command invoke -g rg-sigof -n vm-sigof --command-id RunShellScript \
  --scripts "cd /opt/sigof/repo/deploy && docker compose --env-file /opt/sigof/.env logs --tail 100 api-staging"
```

Ver o estado do atualizador automático:

```bash
az vm run-command invoke -g rg-sigof -n vm-sigof --command-id RunShellScript \
  --scripts "journalctl -u sigof-atualizar --no-pager -n 20"
```

## Recuperação

**Migração do banco interrompida.** Se a API não sobe e o log mostra uma migração marcada como falha:

```bash
az vm run-command invoke -g rg-sigof -n vm-sigof --command-id RunShellScript \
  --scripts "cd /opt/sigof/repo/deploy && docker compose --env-file /opt/sigof/.env run --rm --entrypoint npx api-staging prisma migrate resolve --rolled-back NOME_DA_MIGRACAO"
```

Na subida seguinte, a migração é aplicada de novo. O nome da migração aparece no log e na pasta `backend/prisma/migrations/`.

**Servidor perdido.** Rode [`deploy/provisionar-azure.sh`](../deploy/provisionar-azure.sh): ele recria tudo do zero. Os dados de staging são recriados pelo seed. A produção terá backup diário (issue #52).

## Custos

O servidor custa ≈ US$ 33,50/mês, pagos com o crédito Azure for Students. Há um orçamento (`sigof-credito`) que avisa por e-mail quando o gasto passa de 50% e de 75% de US$ 80, e quando a previsão passa do total.
