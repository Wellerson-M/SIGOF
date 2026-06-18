# Mockups — Prompts para Google Stitch

Este arquivo contém os prompts prontos para gerar os mockups do **SIGOF** no [Google Stitch](https://stitch.withgoogle.com/).

## Como usar

1. Acesse https://stitch.withgoogle.com/ e faça login com sua conta Google.
2. Crie um novo projeto **Web**.
3. **Comece colando o "Prompt base" (abaixo) uma vez** para fixar o estilo visual.
4. Depois, gere **uma tela por vez** colando cada prompt da seção "Telas".
5. Ajuste o que quiser direto no Stitch e **exporte cada tela como PNG**.
6. Salve os PNGs na pasta `docs/assets/` do repositório (crie a pasta) com os nomes sugeridos em cada tela.
7. Veja o arquivo [`guia-de-imagens.md`](guia-de-imagens.md) para saber onde colar cada print na RFC.

> **Dica:** o Stitch tende a gerar resultados melhores em inglês. Cada prompt abaixo tem a versão em português (principal) e você pode traduzir se quiser refinar. Mantenha o mesmo vocabulário visual entre as telas para consistência.

---

## Prompt base (cole primeiro, define o estilo)

```
Crie o design de um sistema web interno corporativo chamado SIGOF (Sistema
de Gestão de Ocorrências de Frete) para uma transportadora. É uma ferramenta
de tickets de uso interno, séria e profissional, usada por funcionários no
desktop durante o horário comercial.

Estilo visual:
- Design limpo, moderno e corporativo (estilo SaaS / dashboard).
- Paleta: azul-marinho como cor primária, cinza-claro de fundo, branco nos
  cards, com acentos em verde (sucesso/resolvido), amarelo (em andamento) e
  vermelho (urgente/atrasado).
- Tipografia sem serifa, legível, hierarquia clara.
- Layout em desktop com menu lateral fixo à esquerda (logo SIGOF no topo) e
  área de conteúdo à direita.
- Componentes com cantos levemente arredondados, sombras suaves e bom
  espaçamento. Acessível e responsivo.
- Idioma de toda a interface: Português do Brasil.

Importante sobre os dados de exemplo: os tipos de ocorrência devem ser
sempre relacionados a correção fiscal/documental de CTe. Use apenas estes
tipos nas linhas de exemplo: "Reversão de frete", "Troca de pagador",
"Ajuste fiscal de CTe". Os solicitantes são funcionários internos (ex.:
"Ana Lima - Financeiro", "Carlos Souza - Comercial"), NÃO empresas clientes.
```

---

## Telas

### Tela 1 — Login
**Arquivo sugerido:** `docs/assets/01-login.png`

```
Tela de login do SIGOF, centralizada, fundo azul-marinho com um card branco
no centro. O card contém: o logo/nome "SIGOF" no topo com o subtítulo
"Sistema de Gestão de Ocorrências de Frete", um campo de "E-mail corporativo",
um campo de "Senha", um link "Esqueci minha senha" e um botão primário
"Entrar" em azul ocupando a largura do card. Sem opção de cadastro público
(usuários são criados pelo administrador). Visual sóbrio e profissional.
```

---

### Tela 2 — Dashboard do Solicitante (Financeiro / Comercial)
**Arquivo sugerido:** `docs/assets/02-dashboard-solicitante.png`

```
Dashboard de um funcionário solicitante no SIGOF. Menu lateral esquerdo com
itens: Início, Nova Solicitação, Minhas Solicitações, Sair. No topo da área
de conteúdo, um botão grande e destacado "Nova Solicitação" e um campo de
busca por protocolo. Abaixo, filtros rápidos em formato de abas/chips:
"Todas", "Em análise", "Resolvidas". Em seguida, uma tabela "Minhas
Solicitações" com as colunas: Protocolo, Tipo, CTe/NF, Status (com badge
colorido), Responsável e Data. Mostrar de 5 a 7 linhas de exemplo com status
variados (Novo, Em andamento, Resolvido).
```

---

### Tela 3 — Criar Nova Solicitação
**Arquivo sugerido:** `docs/assets/03-nova-solicitacao.png`

```
Formulário "Nova Solicitação" do SIGOF, dentro do layout com menu lateral.
Um card de formulário com os campos: "Tipo de ocorrência" (dropdown com
opções: Reversão de frete, Troca de pagador, Ajuste fiscal, Outro), "Número
do CTe", "Número da NF", "Pagador correto", "Descrição do problema" (área de
texto grande) e uma área de upload de anexos do tipo arrastar-e-soltar
("Arraste os arquivos aqui ou clique para enviar — até 10 arquivos, 5MB cada").
No rodapé do card, dois botões: "Cancelar" (secundário) e "Enviar
solicitação" (primário azul).
```

---

### Tela 4 — Dashboard do Analista (Fila)
**Arquivo sugerido:** `docs/assets/04-dashboard-analista.png`

```
Dashboard do analista de reversões no SIGOF. Menu lateral com: Início, Fila
de Solicitações, Minha Fila, Relatórios, Sair. No topo, cards de resumo com
números: "Novas", "Em andamento", "Aguardando doc", "Resolvidas hoje".
Abaixo, filtros (Status, Prioridade, Minha fila) e uma tabela "Fila de
Solicitações" com colunas: Protocolo, Solicitante, Tipo, Prioridade (badge
colorido: Baixa, Média, Alta, Urgente), Status, SLA (com indicador visual de
tempo — verde/amarelo/vermelho) e um botão "Assumir" em cada linha. Mostrar
6 a 8 linhas de exemplo.
```

---

### Tela 5 — Detalhes da Solicitação
**Arquivo sugerido:** `docs/assets/05-detalhes-solicitacao.png`

```
Tela de detalhes de uma solicitação no SIGOF, layout em duas colunas dentro
do menu lateral. No topo: o número do protocolo "SOL-2026-04-0001", um badge
de status e um badge de prioridade. Coluna esquerda (mais larga): bloco
"Dados da solicitação" (solicitante, área, tipo, CTe, NF, pagador correto,
descrição), abaixo um bloco "Anexos" com miniaturas de arquivos, e abaixo uma
"Linha do tempo / Histórico" mostrando eventos com data e autor (Criada,
Assumida por João Silva, Status alterado, etc.). Coluna direita: um painel de
"Conversa" estilo chat entre o analista e o solicitante interno, com balões de
mensagem e um campo de digitação no rodapé. No topo da página, botões de
ação: "Assumir", "Atualizar status", "Finalizar".
```

---

### Tela 6 — Dashboard Gerencial (Supervisor)
**Arquivo sugerido:** `docs/assets/06-dashboard-gerencial.png`

```
Dashboard gerencial do supervisor no SIGOF. Menu lateral com: Início,
Relatórios, Solicitações, Métricas, Sair. No topo, uma linha de cards com
KPIs: "Tempo médio de resolução", "Solicitações abertas", "Resolvidas no mês",
"Taxa de duplicidade". Abaixo, dois gráficos lado a lado: um gráfico de pizza
"Solicitações por status" e um gráfico de barras "Tempo médio por analista".
Abaixo, uma tabela "Top tipos de ocorrência" e um botão "Exportar relatório".
Visual de painel analítico, com cores nos gráficos seguindo a paleta.
```

---

## Checklist de exportação

- [ ] `01-login.png`
- [ ] `02-dashboard-solicitante.png`
- [ ] `03-nova-solicitacao.png`
- [ ] `04-dashboard-analista.png`
- [ ] `05-detalhes-solicitacao.png`
- [ ] `06-dashboard-gerencial.png`

Depois de exportar, opcionalmente pegue o **link do protótipo navegável** no Stitch e cole no **Apêndice C** da RFC.
