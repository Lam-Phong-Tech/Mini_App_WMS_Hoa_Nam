import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";

const exportedAt = "2026-08-23T16:32:30+07:00";
const warehouse = "Kho tổng Hòa Nam";
const outputDir = path.resolve("docs", "inventory-qr-export-2026-08-23");
const svgDir = path.join(outputDir, "svg");
const pngDir = path.join(outputDir, "png");

const inventory = [
  { sku: "HN-PV-BASE-001", name: "SKU baseline Hòa Nam", available: 42, items: ["HN-PV-2026-00004", "HN-PV-2026-00002"] },
  { sku: "HN-PV-BASE-004", name: "Máy Khoan", available: 1, items: ["HN-PV-BASE-004-20260822-001"] },
  { sku: "HN-PRD-SEED-001", name: "Máy bơm PV mẫu Hòa Nam", available: 4, items: ["HN-PRD-SEED-001-123-234", "SN-HN-SEED-0003", "SN-HN-SEED-0002", "SN-HN-SEED-0001"] },
  { sku: "DCPL02-8", name: "Khoan và siết DC – DCPL02-8", available: 1, items: ["DCPL02-8-001"] },
  { sku: "DCPB04-10", name: "Khoan và siết DC – DCPB04-10", available: 1, items: ["DCPB04-10-001"] },
  { sku: "DCPB05-10", name: "Khoan và siết DC – DCPB05-10", available: 1, items: ["DCPB05-10-001"] },
  { sku: "DCPB1218", name: "Khoan và siết DC – DCPB1218", available: 1, items: ["DCPB1218-001"] },
  { sku: "DCPB698", name: "Khoan và siết DC – DCPB698", available: 1, items: ["DCPB698-001"] },
  { sku: "DCPB80", name: "Khoan và siết DC – DCPB80", available: 1, items: ["DCPB80-001"] },
  { sku: "DCPB968", name: "Khoan và siết DC – DCPB968", available: 1, items: ["DCPB968-001"] },
  { sku: "DCJZ02-16", name: "Khoan và siết DC – DCJZ02-16", available: 1, items: ["DCJZ02-16-001"] },
  { sku: "DCJZ03-13", name: "Khoan và siết DC – DCJZ03-13", available: 1, items: ["DCJZ03-13-001"] },
  { sku: "DCJZ05-13", name: "Khoan và siết DC – DCJZ05-13", available: 1, items: ["DCJZ05-13-001"] },
  { sku: "DCJZ06-13", name: "Khoan và siết DC – DCJZ06-13", available: 1, items: ["DCJZ06-13-001"] },
  { sku: "DCJZ1202", name: "Khoan và siết DC – DCJZ1202", available: 1, items: ["DCJZ1202-001"] },
  { sku: "DCJZ20160", name: "Khoan và siết DC – DCJZ20160", available: 1, items: ["DCJZ20160-001"] },
];

const qrItems = inventory.flatMap((product) =>
  product.items.map((itemCode) => ({
    ...product,
    itemCode,
    payload: `HN1|SKU=${product.sku}|ITEM=${itemCode}`,
  })),
);

await fs.mkdir(svgDir, { recursive: true });
await fs.mkdir(pngDir, { recursive: true });

const cards = [];
for (const item of qrItems) {
  const fileName = safeFileName(`${item.sku}__${item.itemCode}`);
  const options = {
    errorCorrectionLevel: "M",
    margin: 4,
    width: 900,
    color: { dark: "#06142A", light: "#FFFFFF" },
  };
  const svg = await QRCode.toString(item.payload, { ...options, type: "svg" });
  await fs.writeFile(path.join(svgDir, `${fileName}.svg`), svg, "utf8");
  await QRCode.toFile(path.join(pngDir, `${fileName}.png`), item.payload, options);
  cards.push({ ...item, fileName, svg });
}

await fs.writeFile(
  path.join(outputDir, "manifest.json"),
  JSON.stringify({ exportedAt, warehouse, inventory, qrItems }, null, 2),
  "utf8",
);
await fs.writeFile(
  path.join(outputDir, "payloads.txt"),
  qrItems.map((item) => item.payload).join("\n"),
  "utf8",
);
await fs.writeFile(
  path.join(outputDir, "inventory-summary.csv"),
  [
    "sku_code,product_name,available_qty,item_qr_count,warehouse,data_as_of",
    ...inventory.map((item) =>
      [item.sku, item.name, item.available, item.items.length, warehouse, exportedAt]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n"),
  "utf8",
);
await fs.writeFile(path.join(outputDir, "inventory-qrs.html"), buildHtml(cards), "utf8");

console.log(`Generated ${qrItems.length} inventory item QR codes in ${outputDir}`);

function buildHtml(items) {
  const firstItem = items[0];
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>QR sản phẩm đang tồn kho</title>
  <style>
    *{box-sizing:border-box} body{margin:0;background:#f3f6fa;color:#06142a;font-family:Arial,sans-serif}
    header{padding:18px 20px;background:#fff;border-bottom:1px solid #d6e0ec} h1{margin:0;font-size:22px}
    header p{margin:7px 0 0;color:#69758a;font-size:13px;line-height:1.5}
    .focus{display:grid;place-items:center;padding:16px;background:#fff;border-bottom:1px solid #d6e0ec}
    .focus-card{width:min(92vw,520px);text-align:center}
    .focus-qr{aspect-ratio:1;padding:18px}.focus-qr svg{width:100%;height:100%}
    main{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;padding:16px}
    article{break-inside:avoid;background:#fff;border:1px solid #d6e0ec;border-radius:18px;padding:14px;text-align:center;cursor:pointer}
    article:hover{border-color:#0f73dc;box-shadow:0 10px 28px rgba(15,115,220,.14)}
    .qr{aspect-ratio:1;padding:14px}.qr svg{width:100%;height:100%}.sku{font-size:16px;font-weight:900}
    .name{margin-top:4px;color:#44536a;font-size:12px;min-height:30px}.item{margin-top:8px;font-size:12px;font-weight:800;word-break:break-all}
    .payload{margin-top:6px;color:#69758a;font-size:9px;word-break:break-all}
    @media print{body{background:#fff}header{position:static}.focus{display:none}main{grid-template-columns:repeat(3,1fr);gap:8px;padding:8px}article{border-radius:8px;padding:8px}}
  </style>
</head>
<body>
  <header><h1>QR sản phẩm đang tồn kho</h1><p>${escapeHtml(warehouse)} · ${escapeHtml(exportedAt)} · ${items.length} item IN_STOCK. Mỗi QR chứa payload composite SKU + ITEM cho luồng xuất kho.</p></header>
  <section class="focus" aria-live="polite">
    <div class="focus-card">
      <div class="focus-qr">${firstItem.svg}</div>
      <div class="sku" id="focus-sku">${escapeHtml(firstItem.sku)}</div>
      <div class="name" id="focus-name">${escapeHtml(firstItem.name)}</div>
      <div class="item" id="focus-item">ITEM: ${escapeHtml(firstItem.itemCode)}</div>
      <div class="payload" id="focus-payload">${escapeHtml(firstItem.payload)}</div>
    </div>
  </section>
  <main>${items.map((item) => `<article data-sku="${escapeHtml(item.sku)}" data-name="${escapeHtml(item.name)}" data-item="${escapeHtml(item.itemCode)}" data-payload="${escapeHtml(item.payload)}"><div class="qr">${item.svg}</div><div class="sku">${escapeHtml(item.sku)}</div><div class="name">${escapeHtml(item.name)}</div><div class="item">ITEM: ${escapeHtml(item.itemCode)}</div><div class="payload">${escapeHtml(item.payload)}</div></article>`).join("\n")}</main>
  <script>
    document.querySelectorAll("article").forEach((card) => {
      card.addEventListener("click", () => {
        document.querySelector(".focus-qr").innerHTML = card.querySelector(".qr").innerHTML;
        document.getElementById("focus-sku").textContent = card.dataset.sku;
        document.getElementById("focus-name").textContent = card.dataset.name;
        document.getElementById("focus-item").textContent = "ITEM: " + card.dataset.item;
        document.getElementById("focus-payload").textContent = card.dataset.payload;
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  </script>
</body>
</html>`;
}

function safeFileName(value) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
