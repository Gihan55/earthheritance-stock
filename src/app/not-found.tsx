import Link from "next/link";
import { Brand } from "@/components/ui";

export default function NotFoundPage() {
  return (
    <main className="standalone-page">
      <Brand />
      <section className="panel standalone-card">
        <span className="eyebrow">404 · PAGE NOT FOUND</span>
        <h1>A little off the path.</h1>
        <p>This page doesn’t exist. Let’s get you back to your workspace.</p>
        <Link href="/" className="button button-primary">
          Back to overview
        </Link>
      </section>
    </main>
  );
}
