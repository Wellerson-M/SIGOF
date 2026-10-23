'use client';

import { usePathname } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  Alerta,
  Aviso,
  BOTAO_PRIMARIO,
  BOTAO_SECUNDARIO,
  CAMPO,
  Janela,
  ROTULO,
} from '@/components/Janela';
import { useVersaoNoAr } from '@/components/VersaoDoSistema';
import { mensagemDoErro } from '@/lib/solicitacoes';
import {
  CATEGORIAS,
  sugestoes,
  type CategoriaDeSugestao,
} from '@/lib/sugestoes';

/**
 * Botão sempre à mão, no canto da tela, para quem está testando mandar
 * melhorias, problemas e dúvidas. Só aparece nos ambientes em que o
 * operador definiu para onde as mensagens vão (SUGESTOES_EMAIL).
 */
export function CaixaDeSugestoes() {
  const versao = useVersaoNoAr();
  const caminho = usePathname();
  const [aberta, setAberta] = useState(false);
  const [categoria, setCategoria] = useState<CategoriaDeSugestao>('SUGESTAO');
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviada, setEnviada] = useState(false);

  if (!versao?.dados.sugestoes) return null;

  function abrir() {
    setErro(null);
    setEnviada(false);
    setAberta(true);
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await sugestoes.enviar({ categoria, titulo, texto, pagina: caminho });
      setEnviada(true);
      setTitulo('');
      setTexto('');
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="fixed bottom-4 right-4 z-40 h-10 rounded-full bg-primaria px-4 text-sm font-semibold text-sobre-primaria shadow-lg hover:opacity-90"
      >
        Sugestões
      </button>
      {aberta && (
        <Janela
          titulo="Sugestões, problemas e dúvidas"
          aoFechar={() => setAberta(false)}
        >
          {enviada ? (
            <div className="flex flex-col gap-4">
              <Aviso>Recebido, obrigado! Sua mensagem foi enviada.</Aviso>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEnviada(false)}
                  className={BOTAO_SECUNDARIO}
                >
                  Enviar outra
                </button>
                <button
                  type="button"
                  onClick={() => setAberta(false)}
                  className={BOTAO_PRIMARIO}
                >
                  Fechar
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => void enviar(e)} className="grid gap-3">
              <p className="text-xs text-texto-suave">
                Esta mensagem vai direto para quem desenvolve o sistema, junto
                com o seu nome e a tela em que você está.
              </p>
              <label className={ROTULO}>
                O que é?
                <select
                  value={categoria}
                  onChange={(e) =>
                    setCategoria(e.target.value as CategoriaDeSugestao)
                  }
                  className={CAMPO}
                >
                  {CATEGORIAS.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className={ROTULO}>
                Título
                <input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  required
                  minLength={3}
                  maxLength={100}
                  placeholder="Em poucas palavras"
                  className={CAMPO}
                />
              </label>
              <label className={ROTULO}>
                Conte com detalhes
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  required
                  minLength={5}
                  maxLength={4000}
                  rows={6}
                  className="rounded-md border border-borda bg-fundo px-3 py-2 text-sm text-texto"
                />
              </label>
              {erro && <Alerta>{erro}</Alerta>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAberta(false)}
                  className={BOTAO_SECUNDARIO}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviando}
                  className={BOTAO_PRIMARIO}
                >
                  {enviando ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
            </form>
          )}
        </Janela>
      )}
    </>
  );
}
