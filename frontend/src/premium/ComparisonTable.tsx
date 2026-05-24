interface Row {
  label: string;
  free: string;
  premium: string;
}

const ROWS: Row[] = [
  { label: 'Preguntas guía del Espejo', free: 'Sin límite, cooldown 30 días', premium: 'Sin límite, cooldown 7 días' },
  { label: 'Reflexión libre por sefirá o árbol', free: '1 por mes', premium: 'Sin límite' },
  { label: 'Actividades en el calendario', free: 'Hasta 10 activas', premium: 'Sin límite' },
  { label: 'Actividades recurrentes (RRULE)', free: '—', premium: 'Incluidas' },
  { label: 'Histórico en Mi Evolución', free: 'Últimos 12 meses', premium: 'Sin límite' },
  { label: 'Google Calendar sync', free: 'Incluido', premium: 'Incluido' },
  { label: 'Análisis IA personalizado en reflexiones', free: '—', premium: 'Incluido' },
  { label: 'Resumen semanal por correo', free: '—', premium: 'Incluido' },
  { label: 'Alertas y recordatorios contextuales', free: '—', premium: 'Incluidos' },
];

export function ComparisonTable() {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="text-left text-[10px] uppercase tracking-[0.2em] text-stone-500 pb-3 pr-4">
              Capacidad
            </th>
            <th className="text-center text-xs text-stone-400 pb-3 px-4 border-l border-stone-800/70">
              Free
            </th>
            <th className="text-center text-xs text-amber-100 pb-3 px-4 border-l border-amber-300/20">
              Premium
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, i) => (
            <tr key={row.label} className={i % 2 === 0 ? 'bg-stone-950/40' : ''}>
              <td className="text-sm text-stone-200 py-3 pr-4">{row.label}</td>
              <td className="text-center text-sm text-stone-400 py-3 px-4 border-l border-stone-800/40">
                {row.free}
              </td>
              <td className="text-center text-sm text-amber-100/90 py-3 px-4 border-l border-amber-300/10">
                {row.premium}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
