/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_USE_MOCK_ANALYSIS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
