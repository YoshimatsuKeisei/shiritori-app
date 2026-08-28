/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DICTIONARY_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
