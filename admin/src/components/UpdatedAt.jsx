import { useState } from 'react';

const storageKey = 'petgo-admin-timezone';
const zones = ['local', 'America/Sao_Paulo', 'America/Cuiaba'];

export default function UpdatedAt({ value }) {
  const [zone, setZone] = useState(() => {
    try { const saved = localStorage.getItem(storageKey); return zones.includes(saved) ? saved : 'local'; }
    catch { return 'local'; }
  });
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    timeZone: zone === 'local' ? localZone : zone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'shortOffset'
  }).format(new Date(value));
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
      <p>Última consulta: <time dateTime={value}>{formatted}</time>.</p>
      <label className="flex items-center gap-2">
        Fuso
        <select value={zone} onChange={(event) => {
          setZone(event.target.value);
          try { localStorage.setItem(storageKey, event.target.value); } catch { /* Preferência apenas local. */ }
        }} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700">
          <option value="local">Computador ({localZone})</option>
          <option value="America/Sao_Paulo">Brasília</option>
          <option value="America/Cuiaba">Cuiabá</option>
        </select>
      </label>
      <p className="w-full">Horário da consulta dos dados, não um relógio em tempo real.</p>
    </div>
  );
}
