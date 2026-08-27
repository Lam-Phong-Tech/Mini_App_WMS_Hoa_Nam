import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";

const codes = [
  "DCSM04-115P",
  "DCSM04-125P",
  "DCSM08-100",
  "DCSM08-115",
  "DCSM41100",
  "DCSM41115",
  "DCSM41125",
  "DCSM41150",
  "DCSJ10",
  "DCSJ25",
  "DCSN100",
  "DCSP02-180",
  "DCSP150",
  "DCSP75",
  "DCMY125",
  "DCMY140S",
  "DCMY155",
  "DCJF15",
  "DCJF22",
  "DCMY02-185",
  "DCMY165S",
  "DCJF32",
  "DCJJ1",
  "DCJJ2",
  "DCMD12",
  "DCMQ85",
  "DCZE125",
  "DCMB82",
  "DCMD20",
  "DCMP6",
];

const batchStart = 61;
const batchEnd = 90;
const outputDir = path.resolve("docs", "qr-test-codes-composite-61-90");
const svgDir = path.join(outputDir, "svg");

function payloadFor(code) {
  return `HN1|SKU=${code}|ITEM=${code}-001`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeFileName(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

await fs.mkdir(svgDir, { recursive: true });

const rows = [];
const payloads = [];

for (const [index, code] of codes.entries()) {
  const absoluteIndex = batchStart + index;
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

  const fileName = `${String(absoluteIndex).padStart(3, "0")}-${safeFileName(code)}.svg`;
  await fs.writeFile(path.join(svgDir, fileName), svg, "utf8");
  payloads.push(payload);
  rows.push({ index: absoluteIndex, code, payload, svg });
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
    </article>`,
  )
  .join("\n");

const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>QR test WMS Hoa Nam — batch ${batchStart}-${batchEnd}</title>
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
    <h1>QR test WMS Hoa Nam — batch ${batchStart}-${batchEnd}</h1>
    <p>30 mã kế tiếp lấy theo cột “Mã máy” trong Excel. Payload composite: HN1|SKU=&lt;mã&gt;|ITEM=&lt;mã&gt;-001.</p>
  </header>
  <main>
${articles}
  </main>
</body>
</html>
`;

await fs.writeFile(path.join(outputDir, "qr-test-codes-composite-61-90.html"), html, "utf8");

console.log(JSON.stringify({ outputDir, count: codes.length, first: codes[0], last: codes.at(-1) }, null, 2));
