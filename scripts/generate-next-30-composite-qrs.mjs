import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";

const codes = [
  "DCJZ05-13",
  "DCJZ06-13",
  "DCJZ1202",
  "DCJZ1240",
  "DCJZ1250",
  "DCJZ1250S",
  "DCJZ14-10",
  "DCJZ1605",
  "DCJZ20160",
  "DCJZ2040",
  "DCJZ2050",
  "DCJZ2060",
  "DCJZ2090",
  "DCJZ23",
  "DCJZ23-10",
  "DCZC04-24",
  "DCZC13",
  "DCZC22",
  "DCZC02-26",
  "DCZC02-28",
  "DCZC05-26L",
  "DCVC800",
  "DDE-68",
  "DCSM03-100",
  "DCSM03-115",
  "DCSM03-125",
  "DCSM04-100",
  "DCSM04-115",
  "DCSM04-125",
  "DCSM04-100P",
];

const outputDir = path.resolve("docs", "qr-test-codes-composite-next-30");
const svgDir = path.join(outputDir, "svg");

function payloadFor(code) {
  return `HN1|SKU=${code}|ITEM=${code}-001`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeFileName(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

await fs.mkdir(svgDir, { recursive: true });

const rows = [];
const payloads = [];

for (const [index, code] of codes.entries()) {
  const payload = payloadFor(code);
  const svg = await QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: {
      dark: "#06142a",
      light: "#ffffff",
    },
  });

  const fileName = `${String(index + 31).padStart(3, "0")}-${safeFileName(code)}.svg`;
  await fs.writeFile(path.join(svgDir, fileName), svg, "utf8");
  payloads.push(payload);
  rows.push({ index: index + 31, code, payload, svg });
}

await fs.writeFile(path.join(outputDir, "codes.txt"), `${codes.join("\n")}\n`, "utf8");
await fs.writeFile(path.join(outputDir, "payloads.txt"), `${payloads.join("\n")}\n`, "utf8");

const articles = rows
  .map(
    (row) => `    <article>
      <div class="qr">${row.svg}</div>
      <div class="index">#${String(row.index).padStart(3, "0")}</div>
      <div class="code">${escapeHtml(row.code)}</div>
      <div class="raw">${escapeHtml(row.payload)}</div>
    </article>`
  )
  .join("\n");

const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>QR test WMS Hoa Nam — batch 31-60</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f3f6fa;
      color: #06142a;
      font-family: Arial, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 1;
      background: rgba(255,255,255,.94);
      border-bottom: 1px solid #d6e0ec;
      padding: 16px;
      backdrop-filter: blur(10px);
    }
    h1 { margin: 0; font-size: 20px; letter-spacing: -.04em; }
    p { margin: 6px 0 0; color: #69758a; font-size: 13px; line-height: 1.5; }
    main {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 14px;
      padding: 16px;
    }
    article {
      break-inside: avoid;
      background: white;
      border: 1px solid #d6e0ec;
      border-radius: 18px;
      padding: 14px;
      box-shadow: 0 10px 24px rgba(15, 23, 42, .06);
      text-align: center;
    }
    .qr {
      display: grid;
      place-items: center;
      width: 100%;
      aspect-ratio: 1;
      border-radius: 14px;
      background: #fff;
      border: 1px solid #eef2f7;
      padding: 8px;
    }
    .qr svg { width: 100%; height: 100%; display: block; }
    .index {
      margin-top: 10px;
      color: #1c70f2;
      font-size: 12px;
      font-weight: 900;
    }
    .code {
      margin-top: 4px;
      font-size: 15px;
      font-weight: 900;
      letter-spacing: .02em;
      word-break: break-word;
    }
    .raw {
      margin-top: 4px;
      color: #69758a;
      font-size: 10px;
      font-weight: 700;
      word-break: break-all;
    }
    @media print {
      body { background: white; }
      header { position: static; }
      main { grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 10px; }
      article { box-shadow: none; border-radius: 10px; padding: 10px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>QR test WMS Hoa Nam — batch 31-60</h1>
    <p>30 mã kế tiếp lấy theo cột “Mã máy” trong Excel. Payload composite: HN1|SKU=&lt;mã&gt;|ITEM=&lt;mã&gt;-001.</p>
  </header>
  <main>
${articles}
  </main>
</body>
</html>
`;

await fs.writeFile(path.join(outputDir, "qr-test-codes-composite-next-30.html"), html, "utf8");

console.log(JSON.stringify({ outputDir, count: codes.length, first: codes[0], last: codes.at(-1) }, null, 2));
