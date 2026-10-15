# Política de segurança

## Como relatar uma vulnerabilidade

**Não abra uma issue pública.** Use o relato privado do GitHub: aba **Security** → **Report a vulnerability**.

Inclua:
- o que é possível fazer explorando a falha (por exemplo, um usuário de uma empresa ler dados de outra);
- os passos para reproduzir;
- a versão ou o commit afetado.

Você recebe uma resposta em até 5 dias úteis. A correção é publicada assim que estiver pronta, e o relato só é divulgado depois disso.

## Versões suportadas

Só a versão atual da branch `main` recebe correções de segurança.

## Práticas adotadas

- Senhas com Argon2id; nenhum segredo no código (tudo por variável de ambiente).
- Isolamento entre empresas em toda consulta ao banco, com testes que tentam acessar dados de outra empresa.
- Dependabot, CodeQL e secret scanning com push protection ativos no repositório.
