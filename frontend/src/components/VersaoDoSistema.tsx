'use client';

import { useEffect, useState } from 'react';
import {
  descreverVersao,
  versaoNoAr,
  type VersaoDescrita,
  type VersaoNoAr,
} from '@/lib/sistema';

/** Busca uma vez a versão no ar; falha não atrapalha a tela. */
export function useVersaoNoAr(): {
  dados: VersaoNoAr;
  descrita: VersaoDescrita;
} | null {
  const [dados, setDados] = useState<VersaoNoAr | null>(null);
  useEffect(() => {
    let cancelado = false;
    versaoNoAr().then(
      (v) => {
        if (!cancelado) setDados(v);
      },
      () => undefined,
    );
    return () => {
      cancelado = true;
    };
  }, []);
  return dados ? { dados, descrita: descreverVersao(dados) } : null;
}

/** Rodapé do menu lateral: em que ambiente e versão a pessoa está. */
export function VersaoDoSistema() {
  const versao = useVersaoNoAr();
  if (!versao) return null;
  const { descrita } = versao;
  return (
    <p
      className="px-5 py-4 text-[11px] leading-tight opacity-60"
      title={`${descrita.ambiente} · ${descrita.rotulo}`}
    >
      {descrita.ambiente}
      <br />
      {descrita.rotulo}
    </p>
  );
}
