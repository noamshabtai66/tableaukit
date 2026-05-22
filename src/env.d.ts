/// <reference types="astro/client" />
import type { User, SupabaseClient } from "@supabase/supabase-js";

declare namespace App {
  interface Locals {
    user: User | null;
    supabase: SupabaseClient;
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
