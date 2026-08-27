import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";

const codes = [
  "DCPL02-8",
  "DCPL04-5",
  "DCPL04-8",
  "DCPL05-8",
  "DCPL16-162",
  "DCPL16-162S",
  "DCPL165",
  "DCPL198",
  "DCPL2045",
  "DCPL208",
  "DCPB04-10",
  "DCPB05-10",
  "DCPB1218",
  "DCPB1288",
  "DCPB1718",
  "DCPB1718S",
  "DCPB2088",
  "DCPB298",
  "DCPB298S",
  "DCPB3088",
  "DCPB356",
  "DCPB358",
  "DCPB488",
  "DCPB598",
  "DCPB698",
  "DCPB80",
  "DCPB968",
  "DCJZ02-16",
  "DCJZ03-13",
  "DCJZ04-13",
];

const outputDir = path.resolve("docs", "qr-test-codes");
const svgDir = path.join(outputDir, "svg");
const compositeOutputDir = path.resolve("docs", "qr-test-codes-composite");
const compositeSvgDir = path.join(compositeOutputDir, "svg");

await fs.mkdir(svgDir, { recursive: true });
await fs.mkdir(compositeSvgDir, { recursive: true });

const cards = [];
const compositeCards = [];

for (const code of codes) {
  const svg = await QRCode.toString(code, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    scale: 9,
    color: {
      dark: "#06142A",
      light: "#FFFFFF",
    },
  });
  const fileName = `${code.replace(/[^a-zA-Z0-9_-]/g, "_")}.svg`;

  await fs.writeFile(path.join(svgDir, fileName), svg, "utf8");
  cards.push({ code, fileName, svg });

  const compositePayload = `HN1|SKU=${code}|ITEM=${code}-001`;
  const compositeSvg = await QRCode.toString(compositePayload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    scale: 9,
    color: {
      dark: "#06142A",
      light: "#FFFFFF",
    },
  });

  await fs.writeFile(path.join(compositeSvgDir, fileName), compositeSvg, "utf8");
  compositeCards.push({ code, payload: compositePayload, fileName, svg: compositeSvg });
}

const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>QR test WMS Hoa Nam</title>
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
    .code {
      margin-top: 10px;
      font-size: 15px;
      font-weight: 900;
      letter-spacing: .02em;
      word-break: break-word;
    }
    .raw {
      margin-top: 4px;
      color: #69758a;
      font-size: 11px;
      font-weight: 700;
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
    <h1>QR test WMS Hoa Nam</h1>
    <p>Mỗi QR chứa đúng raw code in bên dưới. In trang này hoặc mở trực tiếp để quét bằng Mini App.</p>
  </header>
  <main>
    ${cards
      .map(
        ({ code, svg }) => `<article>
      <div class="qr">${svg}</div>
      <div class="code">${escapeHtml(code)}</div>
      <div class="raw">RAW: ${escapeHtml(code)}</div>
    </article>`,
      )
      .join("\n")}
  </main>
</body>
</html>
`;

await fs.writeFile(path.join(outputDir, "qr-test-codes.html"), html, "utf8");
await fs.writeFile(path.join(outputDir, "codes.txt"), codes.join("\n"), "utf8");

const compositeHtml = buildHtml({
  title: "QR test WMS Hoa Nam — chuẩn nhập kho",
  description:
    "Mỗi QR chứa payload composite HN1|SKU=<mã>|ITEM=<mã>-001 để backend ghi nhận như một physical unit/candidate.",
  cards: compositeCards,
  rawLine: (card) => `RAW: ${card.payload}`,
  labelLine: (card) => card.code,
});

await fs.writeFile(
  path.join(compositeOutputDir, "qr-test-codes-composite.html"),
  compositeHtml,
  "utf8",
);
await fs.writeFile(
  path.join(compositeOutputDir, "payloads.txt"),
  compositeCards.map((card) => card.payload).join("\n"),
  "utf8",
);

console.log(`Generated ${codes.length} QR codes`);
console.log(path.join(outputDir, "qr-test-codes.html"));
console.log(svgDir);
console.log(path.join(compositeOutputDir, "qr-test-codes-composite.html"));
console.log(compositeSvgDir);

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildHtml({ title, description, cards, rawLine, labelLine }) {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
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
    .code {
      margin-top: 10px;
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
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
  </header>
  <main>
    ${cards
      .map(
        (card) => `<article>
      <div class="qr">${card.svg}</div>
      <div class="code">${escapeHtml(labelLine(card))}</div>
      <div class="raw">${escapeHtml(rawLine(card))}</div>
    </article>`,
      )
      .join("\n")}
  </main>
</body>
</html>
`;
}
