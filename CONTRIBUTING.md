# Como contribuir com o SIGOF

Obrigado pelo interesse! Este guia explica como rodar o projeto, como propor uma mudança e o que é conferido antes de ela entrar.

## 1. Rodar o projeto

Pré-requisitos: **Node.js 22**, **Docker** e **Git**.

**Windows (um clique):** clique duas vezes em `scripts\iniciar.cmd`. O script:
1. liga o Docker;
2. cria o `.env`;
3. sobe o banco;
4. instala as bibliotecas;
5. aplica as migrações e os dados de demonstração;
6. abre a API e as telas, cada uma numa janela;
7. abre o navegador em http://localhost:3000.

Para desligar: `scripts\parar.cmd`.

**Qualquer sistema (passo a passo):**

Num terminal, na pasta do projeto (o último comando fica rodando: é a API):

```bash
cp .env.example .env
docker compose up -d
cd backend
npm install && npm run db:migrate && npm run db:seed
npm run dev
```

Em **outro terminal**, também na pasta do projeto (as telas):

```bash
cd frontend
npm install
npm run dev
```

Depois, abra http://localhost:3000.

Usuários de demonstração: empresa `transportadora-demo`, senha `Demo@2026`. Os e-mails estão no [README](README.md#usuários-de-demonstração).

## 2. Organização do repositório

| Pasta | O que tem |
|---|---|
| `backend/` | API em Node.js + Express + Prisma. Regras de negócio puras em `src/dominio/`, rotas e serviços em `src/modulos/` |
| `frontend/` | Telas em Next.js. Páginas em `src/app/`, componentes em `src/components/`, acesso à API em `src/lib/` |
| `deploy/` | Configuração do servidor (Docker Compose, Caddy, cloud-init, provisionamento na Azure) |
| `docs/` | RFC, diagramas, protótipos e [operação](docs/operacao.md) |
| `scripts/` | Atalhos para rodar localmente |

## 3. Fluxo de uma mudança

1. **Issue:** toda mudança nasce de uma issue no [quadro do projeto](https://github.com/users/Wellerson-M/projects/1).
2. **Branch** a partir da `main`, com prefixo pelo tipo:
   - `feat/` para funcionalidade;
   - `fix/` para correção;
   - `chore/` para manutenção;
   - `infra/` para servidor e pipeline;
   - `docs/` para documentação.
3. **Commits** pequenos, com mensagem no imperativo, em português, dizendo *o quê* e *por quê* (ex.: "Recusa login vindo de outro site (CSRF)").
4. **Pull Request** para a `main`, com:
   - o que muda e como testar;
   - `Closes #N` para fechar a issue;
   - a seção **"Para você entender"**, com 3 perguntas sobre as decisões tomadas.
5. **Revisão:** os robôs revisam (CI, SonarCloud, CodeQL, Sourcery), e uma pessoa também. Todo comentário é respondido; as conversas precisam estar resolvidas.
6. **Merge:** só com o CI verde e a branch atualizada com a `main`. A partir daí, a mudança vai sozinha para o staging (ver [operação](docs/operacao.md)).

## 4. O que o CI confere em todo PR

| Etapa | Mínimo |
|---|---|
| Lint (ESLint) e tipos (TypeScript estrito) | Zero erros |
| Testes do backend, incluindo integração com Postgres real | **75%** de cobertura |
| Testes do frontend (componentes) | **25%** de cobertura |
| Migrações do banco | Aplicam do zero e batem com o schema |
| Build de produção do frontend | Sem erro |
| SonarCloud | Quality gate aprovado (inclui **80%** de cobertura no código novo) |
| CodeQL | Sem alerta de segurança novo |

Para rodar o mesmo localmente: `npm run lint`, `npm run typecheck` e `npm run test:coverage`, em `backend/` e em `frontend/`.

## 5. Padrões de código

- **Testes primeiro (TDD)** sempre que possível. Toda rota nova tem teste de integração, inclusive com um usuário de **outra empresa** (deve receber 404).
- **Toda consulta ao banco filtra pela empresa** do usuário logado (multiempresa). A empresa vem da sessão, nunca de um parâmetro enviado pelo cliente.
- **Entrada validada com Zod**; erros esperados como subclasses de `ErroDeAplicacao`.
- **Nenhum segredo no código:** tudo vai para variáveis de ambiente (veja `.env.example`).
- Formatação com **Prettier** (`npx prettier --write src`).

## 6. Segurança

Encontrou uma vulnerabilidade? **Não abra issue pública.** Veja o [SECURITY.md](SECURITY.md).
