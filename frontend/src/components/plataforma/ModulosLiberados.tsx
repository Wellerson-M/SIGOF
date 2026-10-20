'use client';

import { useState } from 'react';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Janela } from '@/components/Janela';
import { MODULOS, type Modulo } from '@/lib/configuracao';

/**
 * Quais módulos a transportadora pode usar. Ela liga os que quiser dentre
 * os liberados; bloquear desliga na hora, mas não apaga o que ela tinha
 * configurado (volta como estava se for liberado de novo).
 */
export function ModulosLiberados({
  empresa,
  liberados,
  aoSalvar,
  aoFechar,
}: Readonly<{
  empresa: string;
  liberados: Modulo[];
  aoSalvar: (modulos: Modulo[]) => Promise<boolean>;
  aoFechar: () => void;
}>) {
  const [marcados, setMarcados] = useState<Modulo[]>(liberados);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    const deuCerto = await aoSalvar(marcados);
    setSalvando(false);
    if (deuCerto) aoFechar();
  }

  return (
    <Janela
      titulo={`Módulos de ${empresa}`}
      aoFechar={aoFechar}
      largura="max-w-lg"
    >
      <p className="mb-3 text-sm text-texto-suave">
        A transportadora só usa o que estiver liberado aqui; dentre esses, o
        administrador dela liga o que quiser. Bloquear não apaga o que ela
        configurou.
      </p>
      <ul className="mb-4 flex flex-col gap-2">
        {MODULOS.map((modulo) => (
          <li key={modulo.id}>
            <label className="flex items-start gap-2 text-sm text-texto">
              <input
                type="checkbox"
                checked={marcados.includes(modulo.id)}
                onChange={(evento) =>
                  setMarcados((atuais) =>
                    evento.target.checked
                      ? [...atuais, modulo.id]
                      : atuais.filter((m) => m !== modulo.id),
                  )
                }
                className="mt-1"
              />
              <span>
                <span className="font-medium">{modulo.nome}</span>
                <span className="block text-xs text-texto-suave">
                  {modulo.descricao}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={aoFechar} className={BOTAO_SECUNDARIO}>
          Voltar
        </button>
        <button
          type="button"
          disabled={salvando}
          onClick={() => void salvar()}
          className={BOTAO_PRIMARIO}
        >
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </Janela>
  );
}
