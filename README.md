# SIGOF — Sistema Inteligente de Gestão de Ocorrências de Frete

## Sobre o Projeto

O **SIGOF** é uma aplicação web interna desenvolvida para centralizar e organizar o processo de gestão de ocorrências de frete na **Aceville Transportes**.

O sistema surgiu de uma necessidade real observada no ambiente de trabalho: solicitações de reversão de frete, correções de CTe e ajustes operacionais são comunicadas internamente de forma caótica — e-mails vagos sem número de CTe ou NF, fila de atendimento desordenada e analistas perdendo tempo caçando informações incompletas.

O SIGOF substitui esse fluxo por um sistema de tickets estruturado, de uso exclusivo dos funcionários internos da Aceville.

> **Visão de produto:** o MVP é validado internamente na Aceville (parceira de extensão do projeto), mas a arquitetura é desenhada como **multi-tenant**, permitindo a evolução para um produto SaaS voltado a transportadoras pequenas e médias. Detalhes na [RFC, seção 1.7](docs/rfc.md).

---

## Objetivo

Desenvolver uma plataforma que permita:

- Centralizar solicitações em um único sistema
- Gerar protocolos para cada atendimento
- Organizar e priorizar demandas
- Atribuir responsáveis
- Registrar histórico completo das ocorrências
- Melhorar a eficiência operacional

---

## Problema

Atualmente, a comunicação interna de ocorrências de frete apresenta:

- E-mails vagos sem CTe, NF ou contexto mínimo ("favor reverter")
- Analista precisa caçar manualmente a informação nos históricos de e-mail
- Fila desordenada — quem cobra retorno sobe na fila, não quem tem mais urgência
- Falta de controle e priorização clara
- Risco de duplicidade de solicitações
- Dependência de colaboradores específicos
- Ausência de histórico estruturado e auditável

---

## Solução Proposta

O SIGOF propõe a criação de um sistema web que:

- Permite abertura de solicitações via portal
- Gera número de protocolo automaticamente
- Centraliza todas as demandas
- Possibilita acompanhamento em tempo real
- Permite interação entre equipe e solicitante
- Organiza o fluxo de atendimento

---

## Público-Alvo

Uso exclusivamente interno — funcionários da Aceville Transportes:

- **Analistas de Reversões** — recebem e resolvem os tickets
- **Financeiro** — abre tickets ao identificar divergências em cobranças
- **Vendedores / Comercial** — abre tickets ao receber reclamações de clientes
- **Supervisores** — acompanham métricas e priorizam demandas

---

## Funcionalidades Principais

- Cadastro de solicitações de ocorrência
- Anexos de documentos
- Geração de protocolo
- Gestão de status (aberto, em andamento, concluído)
- Atribuição de responsável
- Priorização de demandas
- Histórico completo de atendimento
- Comunicação entre equipe e solicitante

---

## Tecnologias (planejadas)

- **Frontend:** React / Next.js
- **Backend:** Node.js
- **Banco de Dados:** PostgreSQL
- **Controle de versão:** Git + GitHub

---

## Status do Projeto

🚧 Em fase de planejamento (RFC - Projeto de Portfólio)

---

## Documentação

A documentação completa do projeto pode ser encontrada em:

- **[RFC Completa](docs/rfc.md)** - Especificação técnica detalhada, requisitos, arquitetura e planejamento do projeto
