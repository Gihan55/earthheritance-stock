// Renders the markdown documentation into print-styled HTML and then
// converts each file to PDF using headless Microsoft Edge.
//
// Usage:  node scripts/export-docs-pdf.mjs            (both documents)
//         node scripts/export-docs-pdf.mjs user-guide (one document)
//
// Output: docs/pdf/<name>.pdf  (temporary HTML is cleaned up automatically)

import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { marked } from "marked";

const ROOT = process.cwd();
const DOCS = join(ROOT, "docs");
const OUT = join(DOCS, "pdf");

const DOCUMENTS = {
  "user-guide": "Earthheritance — User Guide",
  "system-document": "Earthheritance — System Document",
};

const EDGE_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

function findEdge() {
  for (const candidate of EDGE_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("Microsoft Edge was not found in its usual locations.");
}

const PAGE_CSS = `
@page {
  size: A4;
  margin: 20mm 16mm 18mm 16mm;
}
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  font-family: "Segoe UI", Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.55;
  color: #1f2a1c;
  max-width: 175mm;
  margin: 0 auto;
}
.cover {
  height: 245mm;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  page-break-after: always;
  border: 1px solid #dce5d3;
  border-radius: 10px;
  background: linear-gradient(160deg, #f4f8ee 0%, #e7f0dc 100%);
  padding: 20mm 14mm;
}
.cover .mark { font-size: 30pt; margin-bottom: 8mm; }
.cover h1 { font-size: 26pt; margin: 0 0 4mm; border: none; color: #2e4a1e; }
.cover .subtitle { font-size: 12pt; color: #55703f; margin: 0 0 14mm; }
.cover .meta { font-size: 9.5pt; color: #6c7a60; }
.cover .meta div { margin-top: 2mm; }
h1, h2, h3, h4 { color: #2e4a1e; line-height: 1.25; }
h1 { font-size: 18pt; margin: 0 0 6mm; }
h2 {
  font-size: 14.5pt;
  margin: 9mm 0 3mm;
  padding-bottom: 1.5mm;
  border-bottom: 2px solid #cfe0bd;
  page-break-after: avoid;
}
h3 { font-size: 12pt; margin: 6mm 0 2mm; page-break-after: avoid; }
h4 { font-size: 10.5pt; margin: 5mm 0 2mm; page-break-after: avoid; }
p, li { orphans: 2; widows: 2; }
a { color: #3f6d2c; text-decoration: none; }
code {
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 9pt;
  background: #f0f4e9;
  border-radius: 3px;
  padding: 0.5mm 1.2mm;
}
pre {
  background: #f7faf2;
  border: 1px solid #dde7d1;
  border-radius: 6px;
  padding: 3.5mm 4mm;
  overflow-x: hidden;
  page-break-inside: avoid;
}
pre code { background: none; padding: 0; white-space: pre-wrap; word-break: break-word; }
table {
  border-collapse: collapse;
  width: 100%;
  margin: 3mm 0 4mm;
  font-size: 9.5pt;
  page-break-inside: auto;
}
th {
  background: #e7f0dc;
  color: #2e4a1e;
  text-align: left;
}
th, td { border: 1px solid #cdd9be; padding: 1.8mm 2.5mm; vertical-align: top; }
tr { page-break-inside: avoid; }
blockquote {
  margin: 3mm 0;
  padding: 2.5mm 4mm;
  border-left: 3px solid #9dbb7c;
  background: #f4f8ee;
  color: #3c4a31;
}
hr { border: none; border-top: 1px solid #d8e2ca; margin: 6mm 0; }
`;

function renderHtml(title, markdown) {
  const body = marked.parse(markdown, { gfm: true, breaks: false });
  const generated = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<section class="cover">
  <div class="mark">&#127793;</div>
  <h1>Earthheritance</h1>
  <p class="subtitle">${title}</p>
  <div class="meta">
    <div>Cocopeat Manufacturing &amp; Export Management</div>
    <div>Generated: ${generated}</div>
    <div>earthheritance-stock-manage.vercel.app</div>
  </div>
</section>
${body}
</body>
</html>`;
}

function toPdf(edge, htmlPath, pdfPath) {
  execFileSync(
    edge,
    [
      "--headless",
      "--disable-gpu",
      "--no-first-run",
      `--print-to-pdf=${pdfPath}`,
      "--no-pdf-header-footer",
      htmlPath,
    ],
    { stdio: "pipe" },
    { timeout: 120000 },
  );
}

const requested = process.argv[2];
const names =
  requested && requested !== "all" ? [requested] : Object.keys(DOCUMENTS);

mkdirSync(OUT, { recursive: true });
const edge = findEdge();

for (const name of names) {
  const title = DOCUMENTS[name];
  if (!title) {
    console.error(`Unknown document "${name}". Known: ${names.join(", ")}`);
    process.exit(1);
  }
  const md = readFileSync(join(DOCS, `${name}.md`), "utf8");
  const htmlPath = join(OUT, `${name}.print.html`);
  const pdfPath = join(OUT, `${name}.pdf`);
  writeFileSync(htmlPath, renderHtml(title, md), "utf8");
  toPdf(edge, htmlPath, pdfPath);
  rmSync(htmlPath);
  const sizeKB = Math.round(readFileSync(pdfPath).byteLength / 1024);
  console.log(`OK  docs/pdf/${name}.pdf (${sizeKB} KB)`);
}
