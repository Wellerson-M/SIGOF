# Continuidade do SIGOF

Estado do projeto e o que fazer a seguir. Atualizado em **21/09/2026**.

---

## Onde estamos

A RFC está fechada na **versão 2.2** e o desenvolvimento começou. O backend tem a base pronta e as regras de negócio centrais implementadas e testadas, mas **ainda não existe API nem frontend** — o que existe hoje é o domínio, o schema do banco e a infraestrutura do projeto.

Nada foi mesclado na `main` ainda. Todo o código está em três Pull Requests abertos e já revisados.

### Pull Requests em aberto

Eles são encadeados — o 2 sai do 1, e o 3 sai do 2. **Merge nesta ordem.**

| PR | Branch | Conteúdo |
|----|--------|----------|
| [#1](https://github.com/Wellerson-M/SIGOF/pull/1) | `chore/setup-base` | TypeScript, Express, `/health`, logs, Helmet, Vitest, CI, docker-compose, `.env.example` |
| [#2](https://github.com/Wellerson-M/SIGOF/pull/2) | `feat/modelo-de-dados` | Schema Prisma completo com isolamento multi-tenant |
| [#3](https://github.com/Wellerson-M/SIGOF/pull/3) | `feat/regras-de-negocio` | Protocolo, máquina de estados, duplicidade e SLA |

**84 testes passando, cobertura de 98%.** O gate mínimo da RFC é 75%.

### O que já está implementado

- **Protocolo** (`src/dominio/protocolo.ts`) — formato `SOL-AAAA-MM-NNNN`, com teto de 9999 por empresa/mês
- **Máquina de estados** (`src/dominio/status.ts`) — 11 transições válidas e quem pode executar cada uma
- **Duplicidade** (`src/dominio/duplicidade.ts`) — mesmo CTe/NF em 7 dias, ignorando canceladas e sem cruzar empresas
- **SLA** (`src/dominio/sla.ts`) — 4 horas **úteis**, com pausa e retomada em `AGUARDANDO_DOC`
- **Modelo de dados** (`prisma/schema.prisma`) — 7 entidades mais a tabela de sequência de protocolo

---

## Pendências conhecidas

### Apontamentos do code review (corrigir antes do merge)

O `leoraye2004` revisou os três PRs e levantou três coisas reais. **Nenhuma foi corrigida ainda.**

1. **`src/dominio/duplicidade.ts` — bug.** A função `normalizarDocumento` preserva o prefixo textual, então `"CTE 12.345"` vira `"CTE12345"` e `"12345"` continua `"12345"` — não batem. A detecção de duplicidade falha justamente no caso que ela existe para pegar. O teste `"ignora pontuação, espaços e caixa"` fixou o comportamento errado, então **o teste também precisa mudar**.

2. **`prisma/schema.prisma` — lacuna no modelo.** O SLA é gravado já calculado em minutos úteis, mas a entidade `Empresa` não guarda qual expediente nem qual fuso foram usados. Hoje o cálculo usa 8h–18h e UTC−3 fixos no código. Adicionar esses campos à `Empresa` e passá-los ao cálculo.

3. **`src/http/app.ts` — tratador de erros.** Responde 500 para qualquer exceção, sem distinguir erro de negócio de erro interno, e não tem teste (linhas 58–61 descobertas).

### Divergências entre a RFC e o código

A RFC precisa de dois ajustes para bater com o que foi construído:

- **Seção 5.6** diz **Jest** no backend; o código usa **Vitest**, que integra com TypeScript sem configuração extra.
- **Seção 5.2** diz protocolo único global; o schema usa único **por empresa**, para que cada transportadora tenha a própria numeração no modelo SaaS.

### Infraestrutura

- **O CI não está rodando.** O workflow existe em `.github/workflows/ci.yml`, mas o GitHub Actions não dispara. Verificar em *Settings → Actions → General* se está habilitado.
- **Docker não está instalado** na máquina de desenvolvimento. Sem ele não sobe o PostgreSQL local, então **nenhuma migração foi executada** e o banco ainda não existe.
- Quando o PR #1 for mesclado, ele traz o `.gitignore` para a `main`. Acrescentar `docs/20do09N1/` a ele (material de entrega, não faz parte do projeto).

---

## Como rodar

```bash
# 1. Subir o banco e o storage (precisa de Docker)
docker compose up -d

# 2. Instalar dependências
cd backend
npm install

# 3. Configurar o ambiente
cp ../.env.example .env
# editar o .env: JWT_SECRET precisa de no mínimo 32 caracteres

# 4. Criar as tabelas
npx prisma migrate dev

# 5. Rodar
npm run dev          # sobe a API em http://localhost:3333
npm test             # roda os testes
npm run test:coverage # testes + relatório de cobertura
npm run lint         # ESLint
npm run typecheck    # verificação de tipos
```

Confirmar que subiu: `GET http://localhost:3333/health` deve responder `{"status":"ok"}`.

---

## Próximos passos, em ordem

1. **Corrigir os três apontamentos do review** e responder nos PRs.
2. **Mesclar os PRs** na ordem 1 → 2 → 3.
3. **Habilitar o GitHub Actions** para o CI passar a rodar nos PRs.
4. **Instalar o Docker**, subir o banco e rodar a primeira migração.
5. **Camada de API** — seguindo o padrão Controller–Service–Repository da RFC 5.3:
   - autenticação com JWT e o middleware de tenant que injeta o `empresa_id` da sessão (RFC 5.5)
   - CRUD de solicitações, ligando as regras de domínio que já existem
   - upload de anexos no storage S3-compatível
6. **Frontend em Next.js** — telas de login, abertura de solicitação, fila do analista e dashboard gerencial, conforme os mockups da RFC seção 4.2.
7. **Deploy** — frontend na Vercel, backend em container, banco PostgreSQL gerenciado (RFC 5.8).

---

## Prazos

| Data | O que vence |
|------|-------------|
| **30/09/2026** | Duas orientações registradas (mínimo obrigatório) |
| **30/11/2026** | Entrega final: software em produção, cinco orientações, prova de autoria |
| **03/12/2026** | Limite da segunda tentativa da prova de autoria |
| **10 a 16/12/2026** | Poster + Demo Day |

A prova de autoria cobra domínio do próprio código sem consulta, e cobertura de testes de 75% no backend e 25% no frontend.

---

## Referências

- [RFC completa](docs/rfc.md) — requisitos, arquitetura e planejamento
- [Diagramas C4 e casos de uso](docs/diagrams/) — fonte em PlantUML
- [Mockups](docs/stitch_interface_sigof_corporativa/) — telas de alta fidelidade
