import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

// Run after npm run build. Only starts an isolated local server; no cloud access.
test(
  "unconfigured production fails closed while public error pages work",
  { timeout: 90000 },
  async () => {
    const probe = createServer();
    await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const port = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
    const origin = `http://127.0.0.1:${port}`;
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(import.meta.resolve("next/dist/bin/next")),
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        env: {
          ...process.env,
          NODE_ENV: "production",
          NEXT_PUBLIC_SUPABASE_URL: "",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
          SUPABASE_SECRET_KEY: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    try {
      let ready = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        if (child.exitCode !== null)
          throw new Error(`Production server exited: ${output}`);
        try {
          await fetch(`${origin}/login`, { signal: AbortSignal.timeout(1000) });
          ready = true;
          break;
        } catch {
          await delay(500);
        }
      }
      assert.ok(ready, `Server did not become ready: ${output}`);
      for (const path of [
        "/",
        "/settings",
        "/team",
        "/roles",
        "/setup",
        "/account/password",
        "/modules/supplier-payments",
        "/modules/buyer-receipts",
        "/modules/buyers",
        "/modules/exports",
        "/modules/reports",
        "/modules/reports/export?report=stock",
      ]) {
        const response = await fetch(`${origin}${path}`, {
          redirect: "manual",
        });
        assert.equal(response.status, 307, `${path} must require sign-in`);
        assert.equal(response.headers.get("location"), "/login?reason=setup");
      }
      const login = await fetch(`${origin}/login`);
      assert.equal(login.status, 200);
      assert.equal(login.headers.get("x-frame-options"), "DENY");
      assert.equal(login.headers.get("x-powered-by"), null);
      const loginHtml = await login.text();
      assert.ok(loginHtml.includes("not connected to Supabase"));
      assert.ok(!loginHtml.includes("Explore the read-only preview"));
      const missing = await fetch(`${origin}/nonexistent-page`);
      assert.equal(missing.status, 404);
      assert.ok((await missing.text()).includes("A little off the path"));
      const invalidConfirmation = await fetch(
        `${origin}/auth/confirm?type=signup&token_hash=invalid`,
        { redirect: "manual" },
      );
      assert.equal(invalidConfirmation.status, 307);
      assert.ok(
        invalidConfirmation.headers
          .get("location")
          .endsWith("/login?reason=invitation"),
      );
    } finally {
      child.kill();
      if (child.exitCode === null)
        await new Promise((resolve) => child.once("exit", resolve));
    }
  },
);
