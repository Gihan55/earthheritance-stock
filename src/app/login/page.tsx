import Link from "next/link";
import { ArrowRight, Globe2, Leaf, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/ui";
import { LoginForm } from "@/components/forms";
import { isLocalPreview, isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const configured = isSupabaseConfigured();
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <span className="auth-eyebrow">
            <Leaf size={17} />
            NATURALLY CONNECTED
          </span>
          <h1>
            From local roots.
            <br />
            To a world
            <br />
            of possibility.
          </h1>
          <p>
            A shared space for your people, your products,
            <br />
            and every step of the export journey.
          </p>
          <div className="auth-orbit" aria-hidden="true">
            <Globe2 size={200} strokeWidth={0.5} />
            <span className="auth-orbit-leaf">
              <Leaf size={45} strokeWidth={1.3} />
            </span>
          </div>
        </div>
        <span className="auth-story-footer">
          COCOPEAT MANUFACTURING & EXPORT MANAGEMENT
        </span>
      </section>
      <section className="auth-panel">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <div className="auth-form-wrap">
          <span className="section-icon">
            <ShieldCheck size={25} />
          </span>
          <span className="eyebrow">YOUR CONNECTED WORKSPACE</span>
          <h2>Welcome back.</h2>
          <p className="auth-description">
            Sign in to keep good things growing.
          </p>
          {!configured && (
            <div className="notice">
              The workspace is not connected to Supabase yet. Live sign-in and
              saving are unavailable.
            </div>
          )}
          {reason === "access" && (
            <div className="notice">
              Please sign in with an active staff account. If access has been
              disabled or not assigned, contact your administrator.
            </div>
          )}
          {reason === "invitation" && (
            <div className="notice">
              This invitation could not be verified. It may have expired or
              already been used. Ask your administrator for help.
            </div>
          )}
          <LoginForm configured={configured} />
          {isLocalPreview() && (
            <Link href="/" className="preview-login-link">
              Explore the read-only preview <ArrowRight size={16} />
            </Link>
          )}
          <div className="auth-security-note">
            <ShieldCheck size={15} />
            Secure, role-based access for your team.
          </div>
        </div>
        <div className="auth-copyright">
          Earthheritance · Built for a growing business.
        </div>
      </section>
    </main>
  );
}
