import { formatDateTime } from '../lib/dateTime.mjs';

export default function UpdatedAt({ value }) {
  return <p className="mt-4 text-sm text-slate-500">
    Última consulta: <time dateTime={value}>{formatDateTime(value, 'America/Sao_Paulo')}</time> · Horário de Brasília.
  </p>;
}
