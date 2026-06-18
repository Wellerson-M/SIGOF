# Guia de Imagens — Onde colocar cada print na RFC

Este guia diz **exatamente qual imagem vai em cada seção** do arquivo `docs/rfc.md`.

## Antes de começar

1. Crie a pasta de imagens: `docs/assets/`
2. Salve todos os prints e diagramas lá dentro.
3. Para inserir uma imagem no markdown, use:
   ```markdown
   ![Descrição da imagem](assets/nome-do-arquivo.png)
   ```
   (o caminho é relativo a `docs/rfc.md`, por isso é só `assets/...`)

> **Boa notícia:** os diagramas C4, o DER e os fluxogramas **já estão prontos como Mermaid** dentro da RFC e renderizam sozinhos no GitHub. Você **não precisa** gerar imagem para eles — só se a banca exigir versão em imagem. O foco do seu trabalho manual é: **prints de processos reais, mockups e evidências.**

---

## Tabela: o que colocar em cada seção

| Seção da RFC | Imagem necessária | Origem / Como obter | Prioridade |
|--------------|-------------------|---------------------|------------|
| **1.1 Contexto e Problema** | Print de um e-mail real bagunçado de solicitação (anonimizado — borre nomes/dados sensíveis) | Sua caixa de e-mail da Aceville | 🔴 Alta — é a prova do problema |
| **1.2 Origem da Demanda** | Print de conversa/WhatsApp/planilha atual usada pela equipe + foto de anotação em papel se houver | Seu dia a dia na Aceville | 🔴 Alta — é a evidência |
| **1.2 Evidência de Interesse** | Print de um formulário/questionário respondido pela equipe OU foto de conversa confirmando a dor | Você cria um Google Forms rápido | 🔴 Alta — exigido pela NP |
| **1.3 Benchmark** | Print da interface do Jira, Freshdesk e Zendesk (telas públicas dos sites) | Sites das ferramentas | 🟡 Média |
| **2.1 Personas** | (Opcional) Avatar/ilustração de cada persona | unDraw, Freepik ou avatar genérico | 🟢 Baixa |
| **2.2 Casos de Uso** | Diagrama de casos de uso UML (atores + casos) | draw.io / Lucidchart — ver nota abaixo | 🟡 Média |
| **3.1 Fluxo Principal** | ✅ Já tem fluxograma Mermaid | — | ✅ Pronto |
| **3.2 Fluxos Alternativos** | (Opcional) Pode adicionar mini-fluxogramas Mermaid | — | 🟢 Baixa |
| **4.1 Fluxo de Navegação** | ✅ Já tem diagrama Mermaid | — | ✅ Pronto |
| **4.2 Wireframes (Telas 1–6)** | ✅ Os 6 mockups do Google Stitch já inseridos (em `docs/stitch_interface_sigof_corporativa/`) | Ver `mockup.md` | ✅ Pronto |
| **4.3 Fluxo de Interação** | (Opcional) Sequência das telas do Stitch lado a lado | Stitch | 🟢 Baixa |
| **4.4 Feedback de Usuários** | Print do feedback real da equipe da Aceville | Conversa/formulário | 🔴 Alta — exigido NP3 |
| **5.1 Diagrama C4** | ✅ Já tem 3 níveis em Mermaid | — | ✅ Pronto |
| **5.2 Modelo de Dados (DER)** | ✅ Já tem DER em Mermaid | — | ✅ Pronto |
| **9. Apêndices** | Link do protótipo Stitch + prints das evidências de extensão | Stitch + Aceville | 🔴 Alta |
| **10. Parecer da Banca** | Foto/scan dos 3 pareceres assinados pelos professores | Dia da apresentação | 🔴 Alta — NP3 |

---

## Onde colar os mockups (✅ já feito)

As 6 telas geradas no Stitch **já foram inseridas** na seção **4.2** da RFC, cada uma abaixo do seu título. Os arquivos usados foram os `screen.png` dentro de `docs/stitch_interface_sigof_corporativa/`:

- **Tela 1: Login** → `login_sigof/screen.png` ✅
- **Tela 2: Dashboard do Solicitante** → `dashboard_do_solicitante_sigof/screen.png` ✅
- **Tela 3: Criar Solicitação** → `nova_solicita_o_sigof/screen.png` ✅
- **Tela 4: Dashboard Analista** → `dashboard_do_analista_sigof/screen.png` ✅
- **Tela 5: Detalhes da Solicitação** → `detalhes_da_solicita_o_sigof/screen.png` ✅
- **Tela 6: Dashboard Gerencial** → `dashboard_gerencial_sigof/screen.png` ✅

> **Pendência:** os mockups atuais mostram tipos de ocorrência genéricos (avaria, extravio) nas linhas de exemplo. Como o escopo foi definido como **foco em CTe**, o ideal é **regerar essas telas** usando o prompt base atualizado em `mockup.md` (que já força os tipos "Reversão de frete", "Troca de pagador", "Ajuste fiscal de CTe"). Enquanto isso, há uma nota na RFC explicando que os dados são ilustrativos.

---

## Sobre o diagrama de casos de uso (2.2)

O Mermaid **não** faz bem o diagrama UML clássico de casos de uso (aquele com o "boneco" ator e elipses). Para esse, use uma ferramenta visual:

- **draw.io** (https://app.diagrams.net/) — gratuito, tem template de Use Case UML
- Exporte como PNG → `docs/assets/casos-de-uso.png`
- Cole na seção 2.2

Se preferir não fazer o UML clássico, a lista de casos de uso que já está na RFC é aceitável — confirme com seu professor o nível de exigência.

---

## Checklist final de imagens

**Evidências do problema (NP1/NP2):**
- [ ] Print de e-mail bagunçado (1.1)
- [ ] Print do processo atual / planilha / papel (1.2)
- [ ] Print do formulário de validação respondido (1.2)
- [ ] Prints do benchmark — Jira, Freshdesk, Zendesk (1.3)

**Design (NP2/NP3):**
- [ ] 6 mockups do Stitch (4.2)
- [ ] Diagrama de casos de uso (2.2) — opcional
- [ ] Link do protótipo navegável (Apêndice C)

**Validação e banca (NP3):**
- [ ] Print do feedback real da equipe Aceville (4.4 e Apêndice D)
- [ ] 3 pareceres dos professores (seção 10)
