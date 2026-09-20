"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Brand } from "@/components/ui";

export default function CallbackPage() {
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    async function finish() {
      try {
        if (!isSupabaseConfigured()) throw new Error("Missing configuration");
        const supabase = createBrowserSupabase();
        const url = new URL(window.location.href);
        const fragment = new URLSearchParams(url.hash.slice(1));
        if (url.searchParams.has("error") || fragment.has("error"))
          throw new Error("Invalid invitation");
        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        // Browser client initialization consumes default Supabase invite URL fragments.
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        window.history.replaceState(window.history.state, "", "/auth/callback");
        if (error || !session) throw new Error("No session");
        window.location.replace("/account/password");
      } catch {
        window.history.replaceState(window.history.state, "", "/auth/callback");
        setFailed(true);
      }
    }
    void finish();
  }, []);
  return (
    <main className="standalone-page">
      <Brand />
      <div className="panel standalone-card">
        {failed ? (
          <>
            <h1>We couldn’t verify this link.</h1>
            <p>
              The invitation may have expired or already been used. Contact your
              administrator for a fresh link.
            </p>
            <Link href="/login" className="button button-primary">
              Return to sign-in
            </Link>
          </>
        ) : (
          <>
            <LoaderCircle size={28} className="spin green-text" />
            <h1>Connecting your account...</h1>
            <p>Please wait while we verify your invitation.</p>
          </>
        )}
      </div>
    </main>
  );
}
