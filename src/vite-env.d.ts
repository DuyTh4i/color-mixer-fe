/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_TEST_URL: string;
  readonly VITE_API_PROD_URL: string;
  readonly VITE_INTERNAL_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
