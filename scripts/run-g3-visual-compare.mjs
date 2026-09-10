/*
 * Local-only UIUX-G3 structural visual comparison.
 *
 * The Designer endpoint must be a local render of the locked commit and the
 * target endpoint must use the Green public adapter. This script intentionally
 * records structural evidence only: their product/config/media data differs,
 * so it must never be used to claim a zero-pixel diff.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const browserOrigin = "http://127.0.0.1:9330";
const designerOrigin = "http://127.0.0.1:4174";
const targetOrigin = "http://127.0.0.1:3201";
const evidenceDirectory = resolve("docs/uiux-migration/evidence/g3");
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

const connect = async (webSocketUrl) => {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(`${message.error.message} (${message.error.code})`));
    else entry.resolve(message.result);
  });
  return {
    command(method, params = {}) {
      const id = nextId;
      nextId += 1;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolveCommand, rejectCommand) => pending.set(id, { resolve: resolveCommand, reject: rejectCommand }));
    },
    close() { socket.close(); },
  };
};

const evaluate = async (cdp, expression) => {
  const result = await cdp.command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};

const waitFor = async (cdp, expression, label, attempts = 120) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(cdp, expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const screenshot = async (cdp, fileName) => {
  const image = await cdp.command("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  await writeFile(resolve(evidenceDirectory, fileName), Buffer.from(image.data, "base64"));
};

const metrics = (kind) => `(() => {
  const selector = ${JSON.stringify(kind === "designer" ? ".pv-app" : ".hn-page")};
  const root = document.querySelector(selector);
  return {
    url: location.href,
    root: selector,
    root_present: Boolean(root),
    scroll: root === document.querySelector('.hn-page') ? root?.scrollTop ?? null : window.scrollY,
    fonts: document.fonts?.status ?? "unavailable",
    reduced_motion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    input_count: document.querySelectorAll('input[type=search]').length,
    cards: document.querySelectorAll('.product-card, .pv-product-card').length,
    gallery: Boolean(document.querySelector('.product-gallery--full, .pv-image-viewer')),
  };
})()`;

await mkdir(evidenceDirectory, { recursive: true });
const chrome = await fetch(`${browserOrigin}/json/version`);
if (!chrome.ok) throw new Error(`Chrome DevTools is unavailable at ${browserOrigin}`);
const newTarget = await fetch(`${browserOrigin}/json/new?${encodeURIComponent(`${targetOrigin}/products?domain=POWER_TOOLS`)}`, { method: "PUT" });
if (!newTarget.ok) throw new Error(`Unable to create visual-comparison tab (${newTarget.status})`);
const target = await newTarget.json();
const cdp = await connect(target.webSocketDebuggerUrl);

const results = {
  recorded_at: new Date().toISOString(),
  decision_scope: "Designer snapshot is rendered locally for G3 QA only; target continues to read Green public runtime data.",
  environment: {
    designer_commit: "86079f965f2fcb43a7e3efbbc9467d119b47921f",
    designer_origin: designerOrigin,
    target_origin: targetOrigin,
    browser: "Chrome via DevTools Protocol",
    viewport: { width: 390, height: 844, dpr: 1 },
    motion: "reduced",
  },
  cases: {},
  claim_boundary: "Structural visual comparison only. Product data, media, names and copy differ by design; no zero-pixel or absolute visual-match claim is made.",
};

const navigate = async (url, selector, label) => {
  await cdp.command("Page.navigate", { url });
  await waitFor(cdp, `document.readyState === 'complete' && Boolean(document.querySelector(${JSON.stringify(selector)}))`, label);
  await evaluate(cdp, "document.fonts ? document.fonts.ready.then(() => true) : true");
  await delay(500);
};

try {
  await cdp.command("Page.enable");
  await cdp.command("Runtime.enable");
  await cdp.command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.command("Emulation.setTouchEmulationEnabled", { enabled: true });
  await cdp.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

  await navigate(`${designerOrigin}/preview/#view=catalog`, ".pv-catalog-screen", "Designer catalog");
  results.cases.catalog_designer = await evaluate(cdp, metrics("designer"));
  await screenshot(cdp, "visual-designer-catalog-390x844.png");

  await navigate(`${targetOrigin}/products?domain=POWER_TOOLS`, ".product-card", "Green target catalog");
  results.cases.catalog_target = await evaluate(cdp, metrics("target"));
  await screenshot(cdp, "visual-target-catalog-390x844.png");

  await navigate(`${designerOrigin}/preview/#view=search`, "#pv-search", "Designer search");
  results.cases.search_designer = await evaluate(cdp, metrics("designer"));
  await screenshot(cdp, "visual-designer-search-390x844.png");

  await navigate(`${targetOrigin}/search`, ".search-entry--page input", "Green target search");
  results.cases.search_target = await evaluate(cdp, metrics("target"));
  await screenshot(cdp, "visual-target-search-390x844.png");

  await navigate(`${designerOrigin}/preview/#view=detail&product=dczc02-26`, ".pv-product-detail", "Designer detail");
  results.cases.detail_designer = await evaluate(cdp, metrics("designer"));
  await screenshot(cdp, "visual-designer-detail-390x844.png");
  await evaluate(cdp, "document.querySelector('.pv-detail-photo-button')?.click()");
  await waitFor(cdp, "Boolean(document.querySelector('.pv-image-viewer'))", "Designer gallery");
  results.cases.gallery_designer = await evaluate(cdp, metrics("designer"));
  await screenshot(cdp, "visual-designer-gallery-390x844.png");

  await navigate(`${targetOrigin}/products?domain=POWER_TOOLS`, ".product-card__link", "Green target product entry");
  await evaluate(cdp, "document.querySelector('.product-card__link')?.click()");
  await waitFor(cdp, "Boolean(document.querySelector('.product-detail-template'))", "Green target detail");
  results.cases.detail_target = await evaluate(cdp, metrics("target"));
  await screenshot(cdp, "visual-target-detail-390x844.png");
  await evaluate(cdp, "document.querySelector('.detail-template__zoom')?.click()");
  await waitFor(cdp, "Boolean(document.querySelector('.product-gallery--full'))", "Green target gallery");
  results.cases.gallery_target = await evaluate(cdp, metrics("target"));
  await screenshot(cdp, "visual-target-gallery-390x844.png");

  for (const [name, value] of Object.entries(results.cases)) {
    if (!value.root_present || value.fonts !== "loaded" || value.reduced_motion !== true) {
      throw new Error(`Visual case ${name} is missing its deterministic root/font/motion condition`);
    }
  }
  await writeFile(resolve(evidenceDirectory, "visual-comparison-results.json"), `${JSON.stringify(results, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(results)}\n`);
} catch (error) {
  await writeFile(resolve(evidenceDirectory, "visual-comparison-failure.json"), `${JSON.stringify({ error: error instanceof Error ? error.message : String(error), results }, null, 2)}\n`);
  throw error;
} finally {
  cdp.close();
}
