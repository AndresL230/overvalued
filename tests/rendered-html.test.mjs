import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`https://overvalued.party${pathname}`, {
      headers: {
        accept: "text/html",
        "x-forwarded-host": "overvalued.party",
        "x-forwarded-proto": "https",
      },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders production Overvalued metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Overvalued — Candidate Exchange<\/title>/i);
  assert.match(html, /Trade the résumé\. Watch the room decide\./i);
  assert.match(html, /property="og:image" content="https:\/\/overvalued\.party\/og\.png"/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Starter Project/i);
});

test("ships the exchange, booth board, and bespoke social card", async () => {
  const [app, board, styles, packageJson] = await Promise.all([
    readFile(new URL("app/overvalued-app.tsx", projectRoot), "utf8"),
    readFile(new URL("app/board/board-screen.tsx", projectRoot), "utf8"),
    readFile(new URL("app/globals.css", projectRoot), "utf8"),
    readFile(new URL("package.json", projectRoot), "utf8"),
    access(new URL("public/og.png", projectRoot)),
  ]);

  assert.match(app, /CANDIDATE EXCHANGE · NYC/);
  assert.match(app, /LIST YOURSELF/);
  assert.match(app, /VIEW RÉSUMÉ/);
  assert.match(app, /REDACTED TEST SAMPLE/);
  assert.doesNotMatch(app, /resume-dossier/);
  assert.match(board, /NEXT REFERENCE CHECK/);
  assert.match(board, /TRADE FROM YOUR PHONE/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /--yes:\s*#b7f34a/i);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
