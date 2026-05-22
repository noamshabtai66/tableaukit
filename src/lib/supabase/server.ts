import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { parse } from "cookie";
import type { AstroCookies } from "astro";

// Astro 5's AstroCookies API doesn't expose getAll(), so we read the raw
// "cookie" request header and parse it ourselves. Writes go through
// AstroCookies.set() — Astro's adapter writes them to the response.
export function createSupabaseServerClient(
  cookies: AstroCookies,
  request: Request,
) {
  return createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL!,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const cookieHeader = request.headers.get("cookie") ?? "";
          const parsed = parse(cookieHeader);
          return Object.entries(parsed).map(([name, value]) => ({
            name,
            value: value ?? "",
          }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookies.set(name, value, options as CookieOptions);
          });
        },
      },
    },
  );
}
