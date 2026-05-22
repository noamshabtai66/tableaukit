import { createClient } from "@supabase/supabase-js";

// Server-only — NEVER import this from a .astro page that runs on the client,
// and NEVER import from a component that renders client-side. Service role
// bypasses all RLS policies.
export function createSupabaseAdminClient() {
  return createClient(
    import.meta.env.PUBLIC_SUPABASE_URL!,
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
