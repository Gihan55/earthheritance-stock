import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export async function createServerSupabase() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (values) => {
          try {
            values.forEach(({ name, value, options }) =>
              store.set(name, value, options),
            );
          } catch {
            /* Server Components cannot write cookies; the proxy refreshes them. */
          }
        },
      },
    },
  );
}
export function createAdminSupabase() {
  if (!process.env.SUPABASE_SECRET_KEY)
    throw new Error(
      "Staff invitations require the server-side Supabase secret key.",
    );
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
