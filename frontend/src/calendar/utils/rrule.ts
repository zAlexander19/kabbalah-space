import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type ByDay = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export type RRuleParts = {
  freq: Freq;
  interval?: number;
  byDay?: ByDay[];
  byMonthDay?: number;
  endsOn?: Date;
  count?: number;
};

const DAY_LABELS: Record<ByDay, string> = {
  MO: 'lunes', TU: 'martes', WE: 'miércoles', TH: 'jueves',
  FR: 'viernes', SA: 'sábados', SU: 'domingos',
};
const DAY_ORDER: ByDay[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const FREQ_LABEL: Record<Freq, { sg: string; pl: string }> = {
  DAILY: { sg: 'día', pl: 'días' },
  WEEKLY: { sg: 'semana', pl: 'semanas' },
  MONTHLY: { sg: 'mes', pl: 'meses' },
};

export function buildRRule(parts: RRuleParts): string {
  const segments: string[] = [`FREQ=${parts.freq}`];
  if (parts.interval && parts.interval > 1) segments.push(`INTERVAL=${parts.interval}`);
  if (parts.byDay && parts.byDay.length > 0) {
    const ordered = DAY_ORDER.filter(d => parts.byDay!.includes(d));
    segments.push(`BYDAY=${ordered.join(',')}`);
  }
  if (parts.byMonthDay) segments.push(`BYMONTHDAY=${parts.byMonthDay}`);
  if (parts.endsOn) {
    const u = parts.endsOn;
    const yyyy = u.getFullYear();
    const mm = String(u.getMonth() + 1).padStart(2, '0');
    const dd = String(u.getDate()).padStart(2, '0');
    segments.push(`UNTIL=${yyyy}${mm}${dd}T235959Z`);
  }
  if (parts.count) segments.push(`COUNT=${parts.count}`);
  return segments.join(';');
}

export function parseRRule(rrule: string): RRuleParts {
  const map: Record<string, string> = {};
  for (const seg of rrule.split(';')) {
    const [k, v] = seg.split('=');
    if (k && v) map[k.toUpperCase()] = v;
  }
  const out: RRuleParts = { freq: (map.FREQ as Freq) || 'WEEKLY' };
  if (map.INTERVAL) out.interval = parseInt(map.INTERVAL, 10);
  if (map.BYDAY) out.byDay = map.BYDAY.split(',') as ByDay[];
  if (map.BYMONTHDAY) out.byMonthDay = parseInt(map.BYMONTHDAY, 10);
  if (map.COUNT) out.count = parseInt(map.COUNT, 10);
  if (map.UNTIL) {
    const m = map.UNTIL.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m) out.endsOn = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  }
  return out;
}

export function describeRRule(rrule: string, _startDate: Date): string {
  const p = parseRRule(rrule);
  const interval = p.interval && p.interval > 1 ? p.interval : 1;
  const unitLabel = interval === 1 ? FREQ_LABEL[p.freq].sg : FREQ_LABEL[p.freq].pl;
  let s = interval === 1 ? `Cada ${unitLabel}` : `Cada ${interval} ${unitLabel}`;

  if (p.freq === 'WEEKLY' && p.byDay && p.byDay.length > 0) {
    const labels = DAY_ORDER.filter(d => p.byDay!.includes(d)).map(d => DAY_LABELS[d]);
    s += ` los ${formatList(labels)}`;
  }
  if (p.freq === 'MONTHLY' && p.byMonthDay) {
    s += ` el día ${p.byMonthDay}`;
  }
  if (p.count) s += `, ${p.count} ${p.count === 1 ? 'vez' : 'veces'}`;
  else if (p.endsOn) s += `, hasta el ${format(p.endsOn, "d 'de' MMMM 'de' yyyy", { locale: es })}`;
  return s;
}

function formatList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

export const WEEKDAY_FROM_DATE: Record<number, ByDay> = {
  0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA',
};
