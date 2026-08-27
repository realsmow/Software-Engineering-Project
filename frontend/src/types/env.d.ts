/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** tRPC endpoint. Optional — defaults to "/trpc" via the dev proxy. */
  readonly VITE_TRPC_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_ENABLE_MOCKS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
