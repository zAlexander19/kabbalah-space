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

// Topología y letras del Árbol de la Vida (esquema tradicional del diagrama de
// referencia). 22 senderos: incluye los cruces Jojmá–Gevurá (ט) y Biná–Jésed (ק),
// y Maljut conecta sólo con Yesod.
export const CONNECTIONS: { n1: string; n2: string; label?: string }[] = [
  // Desde Kéter
  { n1: 'keter',   n2: 'bina',    label: 'ו' }, // Vav
  { n1: 'keter',   n2: 'jojma',   label: 'ה' }, // Hei
  { n1: 'keter',   n2: 'tiferet', label: 'ד' }, // Dálet
  // Desde Jojmá
  { n1: 'jojma',   n2: 'bina',    label: 'ש' }, // Shin (horizontal)
  { n1: 'jojma',   n2: 'jesed',   label: 'ב' }, // Bet
  { n1: 'jojma',   n2: 'tiferet', label: 'ז' }, // Zayin
  { n1: 'jojma',   n2: 'gevura',  label: 'ט' }, // Tet (diagonal cruzada)
  // Desde Biná
  { n1: 'bina',    n2: 'gevura',  label: 'ג' }, // Guímel
  { n1: 'bina',    n2: 'tiferet', label: 'ע' }, // Áin
  { n1: 'bina',    n2: 'jesed',   label: 'ק' }, // Kuf (diagonal cruzada)
  // Desde Gevurá
  { n1: 'gevura',  n2: 'jesed',   label: 'א' }, // Álef (horizontal)
  { n1: 'gevura',  n2: 'tiferet', label: 'צ' }, // Tsadi
  { n1: 'gevura',  n2: 'hod',     label: 'פ' }, // Pei
  // Desde Jésed
  { n1: 'jesed',   n2: 'tiferet', label: 'ח' }, // Jet
  { n1: 'jesed',   n2: 'netzaj',  label: 'כ' }, // Kaf
  // Desde Tiféret
  { n1: 'tiferet', n2: 'hod',     label: 'ס' }, // Sámej
  { n1: 'tiferet', n2: 'netzaj',  label: 'י' }, // Yud
  { n1: 'tiferet', n2: 'yesod',   label: 'ר' }, // Reish
  // Desde Hod
  { n1: 'hod',     n2: 'netzaj',  label: 'מ' }, // Mem (horizontal)
  { n1: 'hod',     n2: 'yesod',   label: 'ל' }, // Lámed
  // Desde Nétsaj
  { n1: 'netzaj',  n2: 'yesod',   label: 'נ' }, // Nun
  // Desde Yesod
  { n1: 'yesod',   n2: 'maljut',  label: 'ת' }, // Tav
];

export const API_BASE = 'http://127.0.0.1:8000';
