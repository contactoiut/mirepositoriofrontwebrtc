// This file provides TypeScript definitions for Vite's environment variables.
// By defining `ImportMeta`, we augment the global interface to include `env`,
// making `import.meta.env` and its properties available to the TypeScript compiler.
// This avoids potential issues where `vite/client` types might not be resolved.

interface ImportMetaEnv {
  readonly VITE_PEER_SERVER_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
