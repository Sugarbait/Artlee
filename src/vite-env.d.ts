/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_SUPABASE_SERVICE_ROLE_KEY: string
  readonly VITE_AZURE_CLIENT_ID: string
  readonly VITE_AZURE_TENANT_ID: string
  readonly VITE_RETELL_API_KEY: string
  readonly VITE_HIPAA_MODE: string
  readonly VITE_PHI_ENCRYPTION_KEY: string
  readonly VITE_AUDIT_ENCRYPTION_KEY: string
  readonly VITE_OPENAI_API_KEY: string
  readonly VITE_APP_ENVIRONMENT: string
  // Add other env variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
