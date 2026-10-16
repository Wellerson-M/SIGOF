import { redirect } from 'next/navigation';

/** A raiz leva para o painel; se não houver sessão, o painel manda para o login. */
export default function Raiz() {
  redirect('/inicio');
}
