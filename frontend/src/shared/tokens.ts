export const ink = {
  void:      '#0e1014',
  obsidian:  '#15181d',
  basalt:    '#1b1f25',
  ash:       '#252a32',
  bone:      'rgba(245,243,235,0.92)',
  ember:     '#e9c349',
  emberSoft: 'rgba(233,195,73,0.18)',
  border:    'rgba(120,120,120,0.18)',
} as const;

export const motion = {
  swift:   { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
  flowing: { duration: 0.6,  ease: [0.16, 1, 0.3, 1] as const },
  unveil:  { duration: 0.9,  ease: [0.16, 1, 0.3, 1] as const },
  breath:  { duration: 8,    ease: 'easeInOut' as const, repeat: Infinity, repeatType: 'mirror' as const },
  stagger: 0.04,
} as const;

export const space = { xs: 4, sm: 8, md: 13, lg: 21, xl: 34, xxl: 55 } as const;

export const SEFIRA_COLORS: Record<string, string> = {
  keter: '#d1d5db',
  jojma: '#9ca3af',
  bina: '#71717a',
  jesed: '#3b82f6',
  gevura: '#ef4444',
  tiferet: '#f59e0b',
  netzaj: '#10b981',
  hod: '#f97316',
  yesod: '#8b5cf6',
  maljut: '#a16207',
};

export const CONNECTIONS: { n1: string; n2: string; label?: string }[] = [
  { n1: 'keter',   n2: 'jojma',   label: 'א' }, { n1: 'keter',   n2: 'bina',    label: 'ב' },
  { n1: 'keter',   n2: 'tiferet', label: 'ג' }, { n1: 'jojma',   n2: 'bina',    label: 'ד' },
  { n1: 'jojma',   n2: 'tiferet', label: 'ה' }, { n1: 'bina',    n2: 'tiferet', label: 'ז' },
  { n1: 'jojma',   n2: 'jesed',   label: 'ו' }, { n1: 'bina',    n2: 'gevura',  label: 'ח' },
  { n1: 'jesed',   n2: 'netzaj',  label: 'כ' }, { n1: 'gevura',  n2: 'hod',     label: 'מ' },
  { n1: 'jesed',   n2: 'gevura',  label: 'ט' }, { n1: 'netzaj',  n2: 'hod',     label: 'פ' },
  { n1: 'jesed',   n2: 'tiferet', label: 'י' }, { n1: 'gevura',  n2: 'tiferet', label: 'ל' },
  { n1: 'netzaj',  n2: 'tiferet', label: 'נ' }, { n1: 'hod',     n2: 'tiferet', label: 'ע' },
  { n1: 'yesod',   n2: 'tiferet', label: 'ס' }, { n1: 'netzaj',  n2: 'yesod',   label: 'צ' },
  { n1: 'hod',     n2: 'yesod',   label: 'ר' }, { n1: 'netzaj',  n2: 'maljut',  label: 'ק' },
  { n1: 'hod',     n2: 'maljut',  label: 'ש' }, { n1: 'yesod',   n2: 'maljut',  label: 'ת' },
];

export const API_BASE = 'http://127.0.0.1:8000';
