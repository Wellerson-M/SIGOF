/**
 * Erros que a aplicação lança de propósito.
 *
 * Tudo que herda de `ErroDeAplicacao` é um erro esperado — entrada inválida,
 * recurso inexistente, regra de negócio violada — e vira uma resposta 4xx com
 * a mensagem do próprio erro. Qualquer outra exceção é tratada como falha
 * interna: vira 500 com mensagem genérica, e o detalhe fica só no log
 * (RFC seção 6.1 — detalhes internos nunca vazam para o cliente).
 */
export class ErroDeAplicacao extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly detalhes?: unknown,
  ) {
    super(mensagem);
    this.name = new.target.name;
  }
}

/** 400 — a requisição chegou malformada ou com campos inválidos. */
export class ErroDeValidacao extends ErroDeAplicacao {
  constructor(mensagem = 'Requisição inválida', detalhes?: unknown) {
    super(400, 'VALIDACAO', mensagem, detalhes);
  }
}

/** 401 — sem sessão válida. */
export class ErroNaoAutenticado extends ErroDeAplicacao {
  constructor(mensagem = 'Autenticação necessária') {
    super(401, 'NAO_AUTENTICADO', mensagem);
  }
}

/** 403 — autenticado, mas o perfil não permite a ação. */
export class ErroAcessoNegado extends ErroDeAplicacao {
  constructor(mensagem = 'Você não tem permissão para esta ação') {
    super(403, 'ACESSO_NEGADO', mensagem);
  }
}

/**
 * 404 — o recurso não existe *ou pertence a outra empresa*.
 *
 * As duas situações respondem igual de propósito: responder 403 para o
 * recurso de outra empresa confirmaria que ele existe (RFC seção 5.5).
 */
export class ErroNaoEncontrado extends ErroDeAplicacao {
  constructor(mensagem = 'Recurso não encontrado') {
    super(404, 'NAO_ENCONTRADO', mensagem);
  }
}

/** 409 — conflito com o estado atual (ex.: duplicidade não confirmada). */
export class ErroDeConflito extends ErroDeAplicacao {
  constructor(mensagem: string, detalhes?: unknown) {
    super(409, 'CONFLITO', mensagem, detalhes);
  }
}

/** 422 — a requisição é válida, mas uma regra de negócio impede a ação. */
export class ErroDeRegraDeNegocio extends ErroDeAplicacao {
  constructor(mensagem: string, detalhes?: unknown) {
    super(422, 'REGRA_DE_NEGOCIO', mensagem, detalhes);
  }
}
