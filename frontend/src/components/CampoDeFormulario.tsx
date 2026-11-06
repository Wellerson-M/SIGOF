import { CampoDeSenha } from '@/components/CampoDeSenha';

const CLASSE_DO_CAMPO =
  'h-10 rounded-md border border-borda bg-superficie px-3 text-sm text-texto outline-none focus:border-foco';

interface PropriedadesDoCampo {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  tipo?: 'text' | 'email' | 'password';
  dica?: string;
  autoComplete?: string;
}

/** Campo das telas de acesso (entrar, esqueci a senha, nova senha). */
export function CampoDeFormulario({
  id,
  rotulo,
  valor,
  aoMudar,
  tipo = 'text',
  dica,
  autoComplete,
}: Readonly<PropriedadesDoCampo>) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {rotulo}
      </label>
      {tipo === 'password' ? (
        <CampoDeSenha
          id={id}
          name={id}
          value={valor}
          onChange={(evento) => aoMudar(evento.target.value)}
          autoComplete={autoComplete}
          aria-describedby={dica ? `${id}-dica` : undefined}
          className={CLASSE_DO_CAMPO}
        />
      ) : (
        <input
          id={id}
          name={id}
          type={tipo}
          value={valor}
          onChange={(evento) => aoMudar(evento.target.value)}
          autoComplete={autoComplete}
          aria-describedby={dica ? `${id}-dica` : undefined}
          className={CLASSE_DO_CAMPO}
        />
      )}
      {dica && (
        <span id={`${id}-dica`} className="text-xs text-texto-suave">
          {dica}
        </span>
      )}
    </div>
  );
}
