# SIGOF — Sistema Inteligente de Gestão de Ocorrências de Frete

[![CI](https://github.com/Wellerson-M/SIGOF/actions/workflows/ci.yml/badge.svg)](https://github.com/Wellerson-M/SIGOF/actions/workflows/ci.yml)

Plataforma SaaS multiempresa para transportadoras organizarem as **ocorrências de frete e as correções de CTe**: troca de pagador, reversão, ajuste fiscal e afins.

Hoje, esses pedidos costumam chegar por e-mail, sem número de CTe ou NF, sem prioridade e sem histórico. O SIGOF troca esse fluxo por solicitações estruturadas, com:

- protocolo;
- prazo de atendimento (SLA) calculado pelo expediente de cada empresa;
- alerta de duplicidade;
- conversa e anexos dentro da solicitação;
- trilha de auditoria.

O MVP é validado com uma transportadora parceira (projeto de extensão). A arquitetura é **multi-tenant** desde o início: cada empresa enxerga apenas os próprios dados.

> Trabalho de Conclusão de Curso — Engenharia de Software, Católica SC.
> Especificação completa na [RFC](docs/rfc.md). Andamento no [quadro do projeto](https://github.com/users/Wellerson-M/projects/1).

---

## Funcionalidades

| Perfil | O que faz |
|---|---|
| **Solicitante** (comercial, financeiro, operacional) | Abre solicitações no formulário que a empresa montou para cada tipo (CTe, NF, fatura, motivo...), anexa documentos e acompanha o andamento |
| **Analista** | Atende a fila ordenada por prioridade e SLA, conversa com o solicitante e resolve |
| **Supervisor** | Reprioriza e reatribui solicitações e acompanha os indicadores |
| **Administrador** | Cadastra funcionários e filiais, ajusta expediente e SLA, monta os tipos de ocorrência e o formulário de cada um, liga os módulos, configura o e-mail de avisos e consulta a auditoria |
| **Administrador da plataforma** | Cadastra as empresas e libera os módulos de cada uma (login separado, sem acesso ao conteúdo das solicitações) |

## Situação atual

Pronto e testado (staging atualizado a cada merge na `main`):
- **Solicitações:** abertura com vários CTe e NF (ou a fatura inteira), alerta de duplicidade e anexos; quadro kanban com arrastar, prioridade, responsável (alocação manual ou pela fila), conversa com notas internas e histórico; registro rápido do que já foi resolvido por fora; exclusão das encerradas.
- **Tipos de ocorrência da empresa:** os do sistema (reversão, troca de pagador, ajuste fiscal, outro) podem ser renomeados, e a empresa cria os seus. Cada tipo tem o próprio formulário: que campos aparecem, quais são obrigatórios, o que já vem preenchido e a lista de motivos.
- **Duplicidade** pelo número do documento, pela filial e pelo próprio arquivo anexado (mesmo conteúdo com outro CTe ou NF).
- **Verificações** configuráveis por empresa (ex.: conferir o desacordo fiscal do CTe), obrigatórias ou não para resolver.
- **Ao finalizar:** de quem foi o erro (controle interno), digitador e anexo do encerramento; balanço mensal por digitador.
- **Anexos:** PDF, imagens e XML da NF-e/CTe, separados por etapa, com checagem do tipo real do arquivo e download só para quem enxerga a solicitação.
- **Avisos:** notificações no sistema (o sino) e e-mails agrupados, com o link de cada anexo, enviados pela conta da própria empresa para várias caixas centrais; a empresa escolhe o que gera e-mail.
- **Indicadores** para o supervisor: em aberto, SLA vencido, atendidas no prazo, tempos médios, causas do erro, gráficos por dia, status, tipo e responsável, e exportação em CSV.
- **Administração:** funcionários com senha provisória, perfis, filiais, módulos, expediente, SLA e trilha de auditoria imutável com filtros.
- **Plataforma (SaaS):** administrador do sistema separado do administrador da empresa; libera os módulos de cada empresa.
- **Login** por empresa, e-mail e senha, com sessão que dura um expediente (12 h no máximo, 2 h sem uso), cookie protegido, bloqueio por tentativas, proteção contra CSRF e controle de acesso por perfil.
- **Protocolo** `SOL-AAAA-MM-NNNN`, sequencial por empresa e seguro sob concorrência.
- **SLA em minutos úteis**, respeitando o expediente, o fuso e os dias úteis de cada empresa, com pausa enquanto aguarda documento.

Próximos passos: ambiente de produção com release versionada, monitoramento, backup e testes ponta a ponta. O andamento está no [quadro do projeto](https://github.com/users/Wellerson-M/projects/1).

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 22, TypeScript, Express 5, Zod, Pino |
| Banco de dados | PostgreSQL 16 com Prisma 7 (migrações versionadas) |
| Anexos | Armazenamento S3-compatível (SeaweedFS), acessado só pela API |
| E-mail | SMTP da própria empresa (ex.: Gmail), com fila de envio no banco; Mailpit no ambiente local |
| Segurança | Argon2id, sessão em cookie `HttpOnly`, Helmet, isolamento por empresa |
| Frontend | Next.js 16, React 19, Tailwind CSS 4, IBM Plex |
| Testes | Vitest + Supertest no backend (mínimo 75%); Vitest + Testing Library no frontend (mínimo 25%) |
| Infraestrutura | Docker Compose, GitHub Actions (CI/CD), ambientes de staging e produção |

## Como rodar localmente

Pré-requisitos: **Node.js 22**, **Docker** e **Git**.

**Windows, em um clique:** clique duas vezes em `scripts/iniciar.cmd`. Ele liga o banco, instala o que falta, prepara os dados de demonstração, abre a API e as telas e abre o navegador em http://localhost:3000. Para desligar: `scripts/parar.cmd`.

**Passo a passo (qualquer sistema):**

```bash
# 1. Variáveis de ambiente (os valores de exemplo servem para desenvolvimento)
cp .env.example .env

# 2. Banco de dados e armazenamento de anexos
docker compose up -d

# 3. Dependências, migrações e dados de demonstração
cd backend
npm install
npm run db:migrate
npm run db:seed

# 4. API em http://localhost:3333 (teste: http://localhost:3333/health)
npm run dev
```

Em outro terminal, as telas:

```bash
cd frontend
npm install
npm run dev
# Abra http://localhost:3000 e entre com um usuário de demonstração
```

As telas e a API ficam no mesmo endereço: o frontend repassa `/api` para o backend. Em staging e produção, quem faz essa divisão é o Caddy.

### Usuários de demonstração

Empresa `transportadora-demo`, senha `Demo@2026` para todos:

| Perfil | E-mail |
|---|---|
| Solicitante | `solicitante@demo.sigof.local` |
| Analista | `analista@demo.sigof.local` |
| Supervisor | `supervisor@demo.sigof.local` |
| Administrador | `admin@demo.sigof.local` |

### Comandos úteis (dentro de `backend/`)

| Comando | O que faz |
|---|---|
| `npm test` | Roda os testes |
| `npm run test:coverage` | Testes com relatório de cobertura |
| `npm run lint` / `npm run typecheck` | Análise estática e checagem de tipos |
| `npm run db:reset` | Apaga o banco, reaplica as migrações e recria os dados de demonstração |

## Qualidade e entrega

- Todo código entra na `main` por **Pull Request**, com **CI verde** obrigatório: lint, tipos, testes com cobertura, migrações aplicadas num Postgres limpo e seed.
- Dependabot, CodeQL e secret scanning ativos no repositório.
- Os ambientes de staging e de produção recebem deploy automático pelo GitHub Actions *(em implantação)*.

## Documentação

- [Como contribuir](CONTRIBUTING.md): rodar, fluxo de branches e PRs, o que o CI confere e padrões de código
- [Operação](docs/operacao.md): ambientes, publicação no staging, release para produção, diagnóstico e recuperação

- [RFC — especificação técnica](docs/rfc.md): requisitos, arquitetura, modelo de dados e segurança
- [Diagramas C4 e casos de uso](docs/diagrams/)
- [Mockups das telas](docs/mockups/mockup.md)
- [Política de segurança](SECURITY.md)

## Licença

© 2026 Wellerson Meredyk. Todos os direitos reservados — ver [LICENSE](LICENSE). O código é público para avaliação acadêmica.
