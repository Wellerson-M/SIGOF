# [RFC] Request for Comments — SIGOF

**Sistema Inteligente de Gestão de Ocorrências de Frete**

**Projeto de Portfólio**

---

# Identificação

- **Título do Projeto:**  
  SIGOF — Sistema Inteligente de Gestão de Ocorrências de Frete

- **Linha de Projeto (Direction):**  
  Web Apps

- **Autor:**  
  Wellerson Meredyk

- **Data da Proposta:**  
  12/04/2026

- **Versão:**  
  1.0

---

# 1. Visão do Produto e Impacto (O Problema)

O objetivo desta seção é responder uma pergunta fundamental:

**Este projeto resolve um problema real ou é apenas um exercício técnico?**

A resposta é clara: **o SIGOF resolve um problema concreto em transportadoras de todo o Brasil.**

---

## 1.1 Contexto e Problema

O setor logístico de transportadoras lida frequentemente com a necessidade de correções em documentos de transporte eletrônico (CTe), como reversões de frete, troca de pagador, ajustes fiscais e inconsistências operacionais.

Atualmente, essas solicitações são realizadas de forma **descentralizada**, através de múltiplos canais como:

- e-mail
- WhatsApp
- ligações telefônicas
- solicitações internas entre setores
- anotações em papel

**Esse cenário gera diversos problemas operacionais:**

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

**Impacto direto para o negócio:**

- aumento do tempo de resolução (média de 2-5 dias por solicitação)
- redução da eficiência operacional
- perda de controle financeiro (ex: comissões e encargos inadequados)
- insatisfação do cliente pela falta de transparência
- retrabalho excessivo

---

## 1.2 Origem da Demanda e Evidências

Existe **interesse real** pela solução, demonstrado através da vivência prática no setor.

### Demanda Observada

O projeto é baseado em uma demanda real observada na empresa **Aceville Transportes**, onde o autor atua diretamente no processo de reversão de fretes.

**Contexto da empresa:**

- Múltiplas filiais e agências espalhadas geograficamente
- Processo de reversão realizado por equipe reduzida (2-3 pessoas)
- Alto volume de solicitações diárias (aproximadamente 20-30 por dia)
- Clientes diversos com demandas específicas

**Problema relatado:**

- desorganização contínua no fluxo de solicitações
- dificuldade de controle e acompanhamento em tempo real
- retrabalho e perda significativa de eficiência
- demora média de 2-5 dias para resolver uma ocorrência

### Observação de Processo Real

O problema foi identificado através da vivência prática no setor, onde foi possível observar:

- solicitações duplicadas para o mesmo CTe (ocorrem 3-4 vezes por semana)
- necessidade constante de comunicação manual entre colaboradores
- dependência de anotações físicas para manter controle
- ausência total de indicadores de desempenho
- frustração dos clientes pela falta de atualizações

### Evidência de Interesse Confirmada

A necessidade da solução é evidenciada por:

- **Volume diário:** 20-30 solicitações por dia na empresa observada
- **Dificuldades recorrentes:** mencionadas em 100% das conversas com a equipe
- **Impacto mensurável:** perda estimada de 15-20 horas/semana com retrabalho
- **Demanda de clientes:** múltiplos relatos de insatisfação pelo tempo de resolução

---

## 1.3 Análise de Soluções Existentes (Benchmark)

Foram analisadas **4 soluções** que tentam resolver problemas similares:

### Soluções Analisadas

**1. Jira Service Management**
- Link: https://www.atlassian.com/software/jira/service-management
- Público-alvo: Equipes de TI e suporte técnico
- Funcionalidades: gestão de tickets, workflows customizáveis, relatórios e automações
- Limitação: não atende regras específicas de logística e CTe; muito genérico; custo elevado

**2. Freshdesk**
- Link: https://www.freshworks.com/freshdesk/
- Público-alvo: Atendimento ao cliente
- Funcionalidades: centralização de chamados, integração multi-canal, base de conhecimento
- Limitação: não atende regras fiscais; sem lógica de negócio para frete

**3. Zendesk**
- Link: https://www.zendesk.com/
- Público-alvo: Suporte ao cliente
- Funcionalidades: gestão de tickets, automações, relatórios avançados
- Limitação: não contempla fluxo logístico; genérico demais

**4. Soluções Ad-Hoc**
- Planilhas Excel, Google Forms + Google Sheets
- Público-alvo: Empresas pequenas
- Funcionalidades: registro básico, acesso compartilhado
- Limitação: sem segurança adequada; sem escalabilidade

### Comparação

| Solução | Pontos Fortes | Limitações | Custo |
|---------|---------------|-----------|-------|
| Jira | Customização; Escalabilidade | Genérico; Complexo | $$$ |
| Freshdesk | Interface amigável; Integrado | Sem lógica de frete | $$ |
| Zendesk | Relatórios avançados; Escalável | Muito genérico | $$$ |
| Planilhas | Livre; Fácil | Sem segurança; Pouco profissional | $ |

### Diferencial do Projeto SIGOF

O SIGOF se diferencia por ser **focado especificamente em logística e transportadoras**, oferecendo:

- ser focado em ocorrências de frete e CTe
- contemplar regras específicas de regulamentação fiscal e logística
- permitir controle granular de erros operacionais com categorização
- integrar fluxo **interno** (operacional) e **externo** (cliente de forma segura)
- gerar indicadores logísticos em tempo real
- ser construído especificamente para o setor
- solução de **menor custo** para transportadoras pequenas e médias

---

## 1.4 Público-Alvo

**Segmentos principais:**

- Equipes operacionais de transportadoras (principalmente analistas)
- Setores de logística e faturamento
- Colaboradores internos (financeiro, comercial)
- Clientes que necessitam solicitar correções de frete

**Perfil do usuário:**

- usuários com conhecimento básico a intermediário de informática
- uso em ambiente corporativo durante horário comercial
- necessidade de rapidez na resposta e clareza nas informações
- acesso por navegador web (sem instalação de software)
- alguns usuários acessarão via mobile

---

## 1.5 Objetivos do Projeto

### Objetivo Geral

Desenvolver um **sistema web para centralizar, organizar e gerenciar solicitações de ocorrências de frete**, aumentando a eficiência operacional em pelo menos 30%, reduzindo erros e aumentando a rastreabilidade dos processos logísticos.

### Objetivos Específicos

1. **Centralizar** todas as solicitações em um único sistema, eliminando fragmentação
2. **Criar controle estruturado** por protocolo único para cada solicitação
3. **Permitir atribuição clara** de responsáveis e evitar falta de ownership
4. **Implementar priorização** de demandas baseada em critérios definidos
5. **Registrar histórico completo** e auditável de todas as operações
6. **Reduzir duplicidade** de solicitações e retrabalho
7. **Reduzir erros operacionais** através de validações e regras de negócio
8. **Gerar indicadores e relatórios** para análise de desempenho

---

## 1.6 Métricas de Sucesso (KPIs)

- **Tempo de resolução:** redução de 40% (de 3 dias para 1.8 dias em média)
- **Duplicidade de solicitações:** redução de 95%
- **Rastreabilidade:** 100% das solicitações registradas e rastreáveis
- **Erros operacionais:** redução de 50% através de validações
- **Aceitação de usuários:** 90% da equipe usando o sistema regularmente
- **Disponibilidade:** sistema online 99% do tempo
- **Satisfação do cliente:** aumento de 40% em satisfação com tempo de resposta

---

# 2. Engenharia de Requisitos

---

## 2.1 Personas

### Persona 1 — Analista de Logística (João Silva)

- **Contexto:** Trabalha na transportadora realizando correções de CTe. 28 anos, 5 anos de experiência.
- **Objetivo:** Resolver solicitações rapidamente e sem erros, com acompanhamento claro de seu desempenho
- **Habilidades:** Conhecimento intermediário de sistemas; profundo conhecimento em CTe
- **Principais dificuldades:**
  - demandas chegam desorganizadas de múltiplas fontes
  - falta de prioridade clara (o que resolver primeiro?)
  - retrabalho quando há solicitações duplicadas
  - falta de métricas pessoais de productividade

### Persona 2 — Cliente (Maria Oliveira)

- **Contexto:** Trabalha em empresa embarcadora, precisa solicitar correções de frete
- **Objetivo:** Resolver problemas de forma rápida e ter transparência do status
- **Habilidades:** Conhecimento básico de sistemas
- **Principais dificuldades:**
  - não sabe para quem enviar suas solicitações
  - falta de retorno ou comunicação lenta
  - não consegue acompanhar o status

### Persona 3 — Gestor/Supervisor (Carlos Souza)

- **Contexto:** Supervisor da área de reversões; responsável por métricas
- **Objetivo:** Garantir que processos sejam seguidos corretamente
- **Habilidades:** Conhecimento avançado de sistemas
- **Principais dificuldades:**
  - falta de visibilidade do que está sendo feito
  - dificuldade de gerar relatórios de desempenho
  - impossibilidade de identificar gargalos

---

## 2.2 Casos de Uso Principais

- Criar solicitação de ocorrência de novo CTe
- Anexar documentos comprobatórios
- Consultar status da solicitação em tempo real
- Atribuir solicitação a responsável
- Atualizar status do atendimento
- Trocar mensagens com cliente
- Visualizar histórico completo da solicitação
- Finalizar solicitação com resultado
- Gerar relatórios de desempenho
- Identificar solicitações duplicadas
- Priorizar solicitações por urgência

---

## 2.3 Requisitos Funcionais (RF)

| ID | Descrição |
|----|-----------|
| RF01 | O sistema deve permitir que usuários externos criem uma solicitação de ocorrência de frete. |
| RF02 | O sistema deve permitir anexar até 10 arquivos por solicitação (limite de 5MB cada). |
| RF03 | O sistema deve gerar automaticamente um número de protocolo único para cada solicitação. |
| RF04 | O sistema deve permitir que usuários internos visualizem todas as solicitações com filtros. |
| RF05 | O sistema deve permitir que um usuário interno assuma uma solicitação. |
| RF06 | O sistema deve permitir atualizar o status da solicitação. |
| RF07 | O sistema deve permitir comunicação em tempo real entre analista e cliente. |
| RF08 | O sistema deve permitir que supervisores priorizem solicitações. |
| RF09 | O sistema deve alertar quando há duplicidade de solicitação para o mesmo CTe/NF. |
| RF10 | O sistema deve permitir visualizar histórico completo com timestamp. |
| RF11 | O sistema deve gerar relatórios customizáveis. |
| RF12 | O sistema deve suportar diferentes perfis de usuário. |

---

## 2.4 Requisitos Não Funcionais (RNF)

| ID | Descrição |
|----|-----------|
| RNF01 | O sistema deve suportar no mínimo 50 usuários simultâneos. |
| RNF02 | O tempo de resposta deve ser inferior a 2 segundos para 95% das requisições. |
| RNF03 | O sistema deve possuir autenticação segura (JWT ou OAuth 2.0). |
| RNF04 | O sistema deve manter disponibilidade mínima de 99% durante horário comercial. |
| RNF05 | O sistema deve ser acessível via navegador web moderno. |
| RNF06 | Dados sensíveis devem ser criptografados em repouso. |
| RNF07 | O sistema deve fazer backup automático dos dados diariamente. |
| RNF08 | O sistema deve ser responsivo e acessível via dispositivos móveis. |
| RNF09 | Logs de todas as operações devem ser mantidos por no mínimo 12 meses. |
| RNF10 | O código deve seguir boas práticas de segurança (OWASP Top 10). |

---

## 2.5 Regras de Negócio

- Cada solicitação deve possuir um protocolo único e imutável
- Apenas usuários internos podem assumir solicitações
- Solicitações não podem ser excluídas, apenas finalizadas ou canceladas
- Uma solicitação pode conter múltiplos CTe relacionados
- O sistema deve alertar quando há duplicidade (mesmo CTe/NF em 7 dias)
- Apenas supervisores podem alterar prioridade
- Prazo máximo para atendimento inicial: 4 horas (horário comercial)
- Cliente recebe notificação a cada mudança de status

---

## 2.6 Fora do Escopo

- Integração com sistemas fiscais (SEFAZ)
- Automação completa de cálculos de comissão
- Integração com WhatsApp para notificações
- Emissão automática de CTe corrigido
- Integração com sistemas ERP legados

---

# 3. Fluxos e Comportamento do Sistema

---

## 3.1 Fluxo Principal do Usuário (Happy Path)

1. **Cliente acessa o sistema** (autenticado)
2. **Clica em "Nova Solicitação"**
3. **Preenche formulário** com tipo, CTe/NF, descrição e anexos
4. **Sistema gera protocolo automaticamente**
5. **Solicitação entra na fila** de analistas (status: "Novo")
6. **Analista visualiza** no dashboard e assume
7. **Analista analisa** e conversa com cliente se necessário
8. **Analista marca como "Resolvido"** com descrição da ação
9. **Cliente recebe notificação** e confirma resolução
10. **Solicitação é finalizada** automaticamente
11. **Histórico completo fica registrado** para auditoria

---

## 3.2 Fluxos Alternativos

### Cenário: Solicitação Duplicada
- **Trigger:** mesmo CTe/NF em 7 dias
- **Ação:** sistema exibe alerta
- **Resultado:** usuário escolhe vincular ou prosseguir

### Cenário: Falta de Documentação
- **Trigger:** solicitação sem anexos suficientes
- **Ação:** analista marca como "Aguardando documentação"
- **Resultado:** cliente é alertado; SLA pause

### Cenário: Erro no Processamento
- **Trigger:** problema não pode ser resolvido
- **Ação:** analista marca como "Escalado"
- **Resultado:** supervisor é notificado

---

# 4. Mockups e Experiência do Usuário (UX)

---

## 4.1 Fluxo de Navegação

**Cliente:**
```
Login/Registro → Dashboard Cliente → Nova Solicitação → Meus Tickets → Detalhes → Chat
```

**Analista Interno:**
```
Login → Dashboard Principal → Fila de Solicitações → Detalhes → Atender → Chat → Finalizar
```

**Supervisor:**
```
Login → Dashboard Gerencial → Relatórios → Solicitações → Métricas
```

---

## 4.2 Wireframes das Principais Telas

### Tela 1: Login/Registro
- Campo de e-mail/login
- Campo de senha
- Opção de redefinir senha
- Links para registro (clientes)

### Tela 2: Dashboard Cliente
- Histórico das minhas solicitações (tabela com protocolo, status, data)
- Botão "Nova Solicitação" destacado
- Filtros rápidos (todos, em análise, resolvidos)
- Busca por protocolo

### Tela 3: Criar Solicitação
- Tipo de ocorrência (dropdown)
- Número da CTe/NF
- Descrição do problema (textarea)
- Upload de anexos (drag and drop)
- Botões: Cancelar | Enviar

### Tela 4: Dashboard Analista
- Fila de solicitações (protocolo, cliente, status, prioridade, data)
- Filtros (status, prioridade, minha fila)
- Botão de assumir solicitação
- Indicador visual de SLA

### Tela 5: Detalhes da Solicitação
- Informações do cliente
- Detalhes do CTe/NF
- Histórico de ações (timeline)
- Chat com cliente
- Botões de ação (assumir, atualizar status, finalizar)
- Anexos (visualização em miniatura)

### Tela 6: Dashboard Gerencial
- KPIs principais em cards
- Gráfico de solicitações por status
- Gráfico de tempo médio por analista
- Tabela de top erros
- Acesso a relatórios

---

## 4.3 Fluxo de Interação do Usuário (Passo a Passo)

### Fluxo: Cliente solicita correção de frete

1. **Cliente acessa**: www.sigof-app.com.br/login
2. **Faz login** com suas credenciais
3. **Vê dashboard** mostrando suas solicitações
4. **Clica em "Nova Solicitação"**
5. **Seleciona tipo**: "Reversão de frete"
6. **Insere número da CTe**
7. **Descreve o problema**
8. **Anexa comprovantes** (arquivo PDF)
9. **Clica em "Enviar"**
10. **Sistema exibe**: "Protocolo: **SOL-2026-04-0001**"
11. **Cliente recebe e-mail** de confirmação
12. **(Depois) Cliente vê**: "Assumida por João Silva"
13. **(Depois) Cliente vê**: "Em análise"
14. **(Depois) Cliente vê**: "Resolvida - reversão processada"
15. **Cliente confirma** e fornece feedback

---

## 4.4 Feedback Inicial de Usuários

A ser coletado com a equipe da Aceville Transportes durante desenvolvimento.

---

# 5. Arquitetura do Sistema

---

## 5.1 Diagrama C4

### Nível 1: Diagrama de Contexto

**Atores Externos:**
- **Clientes da transportadora**
- **Analistas internos**
- **Supervisores**
- **Administrador**

**Sistemas Externos:**
- **Sistema de CTe**
- **E-mail (SMTP)**
- **Banco de Dados**

### Nível 2: Diagrama de Containers

**Components:**
1. **Frontend (React/Vue.js)** — interface web responsiva
2. **API Backend (Node.js/Express)** — processamento, lógica de negócio
3. **Banco de Dados (PostgreSQL)** — armazenamento de solicitações
4. **Serviço de Notificações** — envio de e-mails (SendGrid)
5. **Cache (Redis)** — cache de dados frequentes
6. **Storage (AWS S3)** — armazenamento de anexos

**Comunicação:**
- Frontend ↔ Backend: REST API (JSON/HTTPS)
- Backend ↔ Database: SQL/TCP
- Backend → E-mail Service: HTTPS

### Nível 3: Diagrama de Componentes (Backend)

**Estrutura Interna:**
```
├── AuthController/AuthService
├── SolicitacaoController/SolicitacaoService
├── MensagemController/MensagemService
├── RelatorioService
├── NotificacaoService
├── ValidadorCTe
└── RepositoriosDatabase
```

---

## 5.2 Modelo de Dados

**Principais Entidades:**

- **Usuário** — informações de usuários (clientes, analistas, supervisores)
- **Solicitacao** — registro principal (protocolo, status, CTe)
- **Mensagem** — chat entre analista e cliente
- **Anexo** — arquivos associados à solicitação
- **StatusHistorico** — auditoria de mudanças de status
- **Notificacao** — registro de notificações enviadas

**Relacionamentos:**
- Usuário (1) ← → (N) Solicitação
- Solicitacao (1) ← → (N) Mensagem
- Solicitacao (1) ← → (N) Anexo
- Solicitacao (1) ← → (N) StatusHistorico

---

## 5.3 Principais Componentes

1. **API REST Backend** — lógica de negócio, validações, integrações
2. **Sistema de Autenticação** — login, recuperação de senha, múltiplos perfis
3. **Sistema de Notificações** — e-mails automáticos para cada ação
4. **Interface Web** — frontend moderno, responsivo, acessível
5. **Banco de Dados** — PostgreSQL, backups automáticos, replicação

---

## 5.4 Stack Tecnológica

| Componente | Tecnologia | Justificativa |
|------------|-----------|---------------|
| **Frontend** | React.js | Popular, comunidade grande, componentes reutilizáveis |
| **Backend** | Node.js + Express | Full-stack JavaScript, performance, escalabilidade |
| **Banco de Dados** | PostgreSQL | Robusto, ACID, JSON support, open-source |
| **Autenticação** | JWT | Stateless, seguro, escalável |
| **Cache** | Redis | Performance, sessões rápidas |
| **Storage** | AWS S3 | Escalável, seguro, pay-as-you-use |
| **E-mails** | SendGrid | Confiável, bom deliverability |
| **Deploy** | Docker + AWS | Containerização, CI/CD, escalabilidade |

---

# 6. Segurança e Privacidade

---

## 6.1 Medidas de Segurança

- **Autenticação:** JWT com expiração de 24 horas
- **Criptografia em trânsito:** HTTPS/TLS em todas as conexões
- **Criptografia em repouso:** dados sensíveis criptografados no banco
- **Autorização:** RBAC (Role-Based Access Control)
- **Validação de entrada:** sanitização de todos os inputs
- **Rate limiting:** proteção contra força bruta
- **Auditoria:** logs de todas as operações com timestamp
- **CORS:** configuração restrita para origens autorizadas
- **OWASP Top 10:** implementação de boas práticas

---

## 6.2 Privacidade e LGPD

**Dados coletados:**
- E-mail, nome, telefone (usuários)
- Número de CTe/NF (dados operacionais)
- Informações de pagador (dados operacionais)

**Armazenamento:**
- Banco PostgreSQL com criptografia
- Backups criptografados

**Direitos do Usuário (LGPD):**
- Acesso aos seus dados
- Correção/retificação
- Esquecimento (exclusão)
- Portabilidade de dados

**Retenção:**
- Usuários: 12 meses após deleção
- Solicitações: 5 anos mínimo (retenção fiscal)
- Logs: 2 anos para auditoria

**Compartilhamento:**
- Sem compartilhamento com terceiros
- Apenas Aceville Transportes tem acesso
- Processadores assinam DPA (Data Processing Agreement)

---

# 7. Planejamento do Projeto

**Metodologia:** Agile com sprints de 2 semanas

| Marco | Descrição | Duração | Prazo |
|-------|-----------|---------|-------|
| **M1** | Setup, PoC, arquitetura | 1 semana | Semana 1 |
| **M2** | MVP: autenticação + criar solicitar + assumir | 2 semanas | Semana 3 |
| **M3** | Fase 2: chat, histórico, status | 2 semanas | Semana 5 |
| **M4** | Fase 3: priorização, alertas, notificações | 2 semanas | Semana 7 |
| **M5** | Dashboards e relatórios | 1 semana | Semana 8 |
| **M6** | Testes, ajustes, segurança | 2 semanas | Semana 10 |
| **M7** | Deploy, treinamento | 1 semana | Semana 11 |
| **M8** | Go-live e suporte | 1 semana | Semana 12 |

**Total estimado: 3 meses**

---

# 8. Referências

- **Documentação de CTe:** https://www.sefaz.rs.gov.br/
- **OWASP Top 10:** https://owasp.org/www-project-top-ten/
- **REST API Best Practices:** https://restfulapi.net/
- **PostgreSQL Documentation:** https://www.postgresql.org/docs/
- **React Documentation:** https://react.dev/
- **LGPD - Lei 13.709/2018:** http://www.planalto.gov.br/
- **JWT Best Practices:** https://tools.ietf.org/html/rfc7519

---

# 9. Apêndices

## 9.1 Glossário de Termos

- **CTe:** Conhecimento de Transporte Eletrônico
- **NF:** Nota Fiscal
- **SEFAZ:** Sistema da Secretaria da Fazenda
- **RFC:** Request for Comments
- **MVP:** Minimum Viable Product
- **SLA:** Service Level Agreement
- **OWASP:** Open Web Application Security Project
- **LGPD:** Lei Geral de Proteção de Dados
- **JWT:** JSON Web Token
- **RBAC:** Role-Based Access Control
- **DPA:** Data Processing Agreement

## 9.2 Links Úteis

- Repositório GitHub: https://github.com/Wellerson-M/SIGOF
- Mockups Figma: https://figma.com/ (a definir)
- Documentação Técnica: https://github.com/Wellerson-M/SIGOF/wiki

---

# 10. Parecer do Comitê de Avaliação

(A ser preenchido pelos professores durante avaliação)

**Avaliador 1:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**Status:** [ ] Aprovado  [ ] Ajustar  [ ] Rejeitado

Observações:

---

**Avaliador 2:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**Status:** [ ] Aprovado  [ ] Ajustar  [ ] Rejeitado

Observações:

---

**Avaliador 3:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**Status:** [ ] Aprovado  [ ] Ajustar  [ ] Rejeitado

Observações:

---

**Data da Avaliação:** \_\_\_\_/\_\_\_\_/\_\_\_\_\_\_

**Resultado Final:** [ ] APROVADO  [ ] A REVISAR  [ ] REJEITADO
