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
| **Solicitante** (comercial, financeiro, operacional) | Abre solicitações com CTe/NF obrigatórios, anexa documentos e acompanha o andamento |
| **Analista** | Atende a fila ordenada por prioridade e SLA, conversa com o solicitante e resolve |
| **Supervisor** | Reprioriza e reatribui solicitações e acompanha os indicadores |
| **Administrador** | Gerencia usuários, expediente, SLA e tipos de ocorrência da empresa |

## Situação atual

Pronto e testado:
- **Telas de login e painel inicial**, com a identidade visual do produto, tema claro e escuro e versão para celular.
- **Login** por empresa, e-mail e senha, com sessão em cookie protegido, bloqueio por tentativas, proteção contra CSRF e controle de acesso por perfil.
- **Protocolo** `SOL-AAAA-MM-NNNN`, sequencial por empresa e seguro sob concorrência.
- **Máquina de estados** com as transições permitidas para cada perfil.
- **Duplicidade:** o mesmo CTe ou NF dentro da janela configurada gera alerta. "CTE 12.345", "CT-e nº 012345" e a chave de 44 dígitos são reconhecidos como o mesmo documento.
- **SLA em minutos úteis**, respeitando o expediente, o fuso e os dias úteis de cada empresa, com pausa enquanto aguarda documento.

Em desenvolvimento: as solicitações (abrir, listar, atender) e as telas delas, e o ambiente de produção. O staging já está no ar e é atualizado a cada merge na `main`. O andamento está no [quadro do projeto](https://github.com/users/Wellerson-M/projects/1).

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 22, TypeScript, Express 5, Zod, Pino |
| Banco de dados | PostgreSQL 16 com Prisma 7 (migrações versionadas) |
| Anexos | Armazenamento S3-compatível (SeaweedFS no ambiente local) |
| Segurança | Argon2id, sessão em cookie `HttpOnly`, Helmet, isolamento por empresa |
| Frontend | Next.js 16, React 19, Tailwind CSS 4, IBM Plex |
| Testes | Vitest + Supertest no backend (mínimo 75%); Vitest + Testing Library no frontend (mínimo 25%) |
| Infraestrutura | Docker Compose, GitHub Actions (CI/CD), ambientes de staging e produção |

## Como rodar localmente

Pré-requisitos: **Node.js 22** e **Docker**.

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

- [RFC — especificação técnica](docs/rfc.md): requisitos, arquitetura, modelo de dados e segurança
- [Diagramas C4 e casos de uso](docs/diagrams/)
- [Mockups das telas](docs/mockups/mockup.md)
- [Política de segurança](SECURITY.md)

## Licença

© 2026 Wellerson Meredyk. Todos os direitos reservados — ver [LICENSE](LICENSE). O código é público para avaliação acadêmica.
