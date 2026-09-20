"use client";
import Link from "next/link";
import { Brand } from "@/components/ui";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone-page">
      <Brand />
      <section className="panel standalone-card">
        <h1>Something needs attention.</h1>
        <p>
          We couldn’t load this page. Check your connection and Supabase
          configuration, including the foundation migration, then try again.
        </p>
        <div className="center-actions">
          <button className="button button-primary" onClick={reset}>
            Try again
          </button>
          <Link href="/login" className="button button-secondary">
            Go to sign-in
          </Link>
        </div>
      </section>
    </main>
  );
}
