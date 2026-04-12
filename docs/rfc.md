# RFC: Request for Comments

## Identificação

| Campo | Descrição |
|-------|-----------|
| **Título do Projeto** | SIGOF — Sistema Inteligente de Gestão de Ocorrências de Frete |
| **Linha de Projeto (Direction)** | Web Apps |
| **Autor** | Wellerson Meredyk |
| **Data da Proposta** | 12/04/2026 |
| **Versão** | 1.0 |

---

## 1. Visão do Produto e Impacto (O Problema)

### 1.1 Contexto e Problema

O setor logístico de transportadoras lida frequentemente com a necessidade de correções em documentos de transporte eletrônico (CTe), como reversões de frete, troca de pagador, ajustes fiscais e inconsistências operacionais.

Atualmente, essas solicitações são realizadas de forma descentralizada, através de múltiplos canais como:

- e-mail
- WhatsApp
- ligações telefônicas
- solicitações internas entre setores

Esse cenário gera diversos problemas operacionais:

- falta de organização das demandas
- ausência de priorização clara
- dificuldade de rastrear solicitações já realizadas
- risco de duplicidade de pedidos
- dependência de pessoas específicas (ex: quando um colaborador está de férias)
- ausência de histórico estruturado
- uso de controles manuais (anotações em papel)

O processo atual também dificulta o controle de erros operacionais, como:

- erros de digitação
- erros de emissão de CTe
- erros de cliente (ex: pagador incorreto)
- inconsistências fiscais

Essas falhas impactam diretamente:

- o tempo de resolução
- a eficiência operacional
- o controle financeiro (ex: comissões e encargos)

### 1.2 Origem da Demanda e Evidências

#### Demanda Externa

O projeto é baseado em uma demanda real observada na empresa Aceville Transportes, onde o autor atua diretamente no processo de reversão de fretes.

**Contexto:**

- A empresa possui múltiplas filiais e agências
- O processo de reversão é realizado por uma equipe reduzida
- As solicitações chegam de diferentes origens sem padronização

**Problema relatado:**

- desorganização no fluxo de solicitações
- dificuldade de controle e acompanhamento
- retrabalho e perda de eficiência

#### Observação de Processo Real

O problema foi identificado através da vivência prática no setor, onde foi possível observar:

- solicitações duplicadas para o mesmo CTe
- necessidade de comunicação manual entre colaboradores
- dependência de anotações físicas para controle
- ausência de indicadores de desempenho

#### Evidência de Interesse

A necessidade da solução é evidenciada por:

- volume diário de solicitações
- dificuldades recorrentes enfrentadas pela equipe
- impacto direto no tempo de resolução

### 1.3 Análise de Soluções Existentes (Benchmark)

#### Soluções analisadas

**Jira Service Management**
- Link: https://www.atlassian.com/software/jira/service-management
- sistema de tickets
- gestão de solicitações
- Limitação: não atende regras específicas de logística e CTe

**Freshdesk**
- Link: https://www.freshworks.com/freshdesk/
- atendimento ao cliente
- centralização de chamados
- Limitação: genérico, sem lógica de negócio para frete

**Zendesk**
- Link: https://www.zendesk.com/
- suporte ao cliente
- gestão de tickets
- Limitação: não contempla fluxo logístico e fiscal

#### Comparação

| Solução | Pontos Fortes | Limitações |
|---------|---------------|-----------|
| Jira | Organização e workflow | Não é específico para logística |
| Freshdesk | Interface amigável | Não atende regras fiscais |
| Zendesk | Escalável | Genérico |

#### Diferencial do Projeto

O SIGOF se diferencia por:

- ser focado em ocorrências de frete
- contemplar regras específicas de CTe e reversões
- permitir controle de erros operacionais
- integrar fluxo interno e externo (cliente + equipe)
- gerar indicadores logísticos

### 1.4 Público-Alvo

- Equipes operacionais de transportadoras
- Setores de logística e faturamento
- Colaboradores internos (financeiro, comercial)
- Clientes que necessitam solicitar correções de frete

**Perfil:**

- usuários com conhecimento básico de informática
- uso em ambiente corporativo
- necessidade de rapidez e clareza

### 1.5 Objetivos do Projeto

#### Objetivo Geral

Desenvolver um sistema web para centralizar, organizar e gerenciar solicitações de ocorrências de frete, aumentando a eficiência operacional e a rastreabilidade dos processos logísticos.

#### Objetivos Específicos

- Centralizar solicitações em um único sistema
- Criar controle por protocolo
- Permitir atribuição de responsáveis
- Implementar priorização de demandas
- Registrar histórico completo das operações
- Reduzir erros operacionais
- Gerar indicadores e relatórios

### 1.6 Métricas de Sucesso (KPIs)

- redução do tempo médio de atendimento em pelo menos 30%
- redução de solicitações duplicadas
- aumento da rastreabilidade (100% das solicitações registradas)
- controle de erros operacionais por categoria
- melhoria na organização das demandas

---

## 2. Engenharia de Requisitos

### 2.1 Personas

#### Persona 1 — Analista de Logística

- **Nome:** João Silva
- **Contexto:** Trabalha na transportadora realizando correções de CTe e reversões de frete
- **Objetivo:** Resolver solicitações rapidamente e sem erro
- **Dificuldades:**
  - demandas desorganizadas
  - falta de controle de prioridades
  - retrabalho

#### Persona 2 — Cliente

- **Nome:** Maria Oliveira
- **Contexto:** Cliente que precisa solicitar correções de frete
- **Objetivo:** Resolver problemas de forma rápida e clara
- **Dificuldades:**
  - não sabe para quem enviar
  - falta de retorno
  - não acompanha status

#### Persona 3 — Colaborador Interno

- **Nome:** Carlos Souza
- **Contexto:** Funcionário do financeiro ou comercial
- **Objetivo:** Solicitar correções de forma padronizada
- **Dificuldades:**
  - comunicação informal
  - solicitações perdidas

### 2.2 Casos de Uso Principais

- Criar solicitação de ocorrência
- Anexar documentos
- Consultar status da solicitação
- Atribuir responsável
- Atualizar status do atendimento
- Trocar mensagens com cliente
- Finalizar solicitação
- Visualizar relatórios

### 2.3 Requisitos Funcionais (RF)

| ID | Descrição |
|----|-----------|
| RF01 | O sistema deve permitir que o usuário crie uma solicitação de ocorrência de frete. |
| RF02 | O sistema deve permitir anexar arquivos à solicitação. |
| RF03 | O sistema deve gerar um número de protocolo para cada solicitação. |
| RF04 | O sistema deve permitir que usuários internos visualizem todas as solicitações. |
| RF05 | O sistema deve permitir que um usuário interno assuma uma solicitação. |
| RF06 | O sistema deve permitir atualizar o status da solicitação. |
| RF07 | O sistema deve permitir comunicação entre equipe e solicitante. |
| RF08 | O sistema deve permitir priorizar solicitações. |
| RF09 | O sistema deve evitar duplicidade de solicitações para o mesmo CTe/NF. |
| RF10 | O sistema deve permitir visualizar histórico completo da solicitação. |

### 2.4 Requisitos Não Funcionais (RNF)

| ID | Descrição |
|----|-----------|
| RNF01 | O sistema deve suportar múltiplos usuários simultâneos. |
| RNF02 | O tempo de resposta deve ser inferior a 3 segundos. |
| RNF03 | O sistema deve possuir autenticação segura. |
| RNF04 | O sistema deve manter disponibilidade mínima de 95%. |
| RNF05 | O sistema deve ser acessível via navegador web. |

### 2.5 Regras de Negócio

- Cada solicitação deve possuir um protocolo único
- Apenas usuários internos podem assumir solicitações
- Solicitações não podem ser excluídas, apenas finalizadas
- Uma solicitação pode conter múltiplos CTe
- O sistema deve alertar quando houver duplicidade

### 2.6 Fora do Escopo

- Integração com sistemas fiscais (SEFAZ)
- Automação completa de cálculos de comissão
- Integração com WhatsApp
- Emissão automática de CTe

---

## 3. Fluxos e Comportamento do Sistema

### 3.1 Fluxo Principal do Usuário

1. Usuário acessa o sistema
2. Cria uma solicitação
3. Sistema gera protocolo
4. Solicitação entra na fila
5. Analista assume
6. Analista resolve
7. Solicitação é finalizada

### 3.2 Fluxos Alternativos

- Solicitação duplicada → sistema alerta
- Falta de documentos → sistema solicita anexos
- Erro no processo → retorno ao cliente

---

## 4. Mockups e Experiência do Usuário (UX)

### 4.1 Fluxo de Navegação

Login → Dashboard → Solicitações → Detalhes → Finalização

### 4.2 Wireframes ou Mockups das Telas

- Tela de login
- Dashboard com lista de solicitações
- Tela de criação de solicitação
- Tela de atendimento (chat + dados)

### 4.3 Fluxo de Interação do Usuário

1. Cliente abre solicitação
2. Sistema gera protocolo
3. Analista responde
4. Cliente envia documentos
5. Analista finaliza

### 4.4 Feedback Inicial de Usuários

A validar com equipe interna da empresa durante desenvolvimento.

---

## 5. Arquitetura do Sistema

### 5.1 Diagrama C4

#### Nível 1 — Contexto

- Cliente
- Funcionários internos
- Sistema SIGOF

#### Nível 2 — Containers

- Frontend (Web)
- Backend (API)
- Banco de Dados

#### Nível 3 — Componentes

- Controller
- Service
- Repository

### 5.2 Modelo de Dados

Principais entidades:

- Usuário
- Solicitação
- Mensagem
- Anexo
- Status

### 5.3 Principais Componentes

- API backend
- Sistema de autenticação
- Interface web
- Banco de dados
