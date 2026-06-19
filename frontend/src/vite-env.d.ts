/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base del backend (sin slash final). Inyectada en build time. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
