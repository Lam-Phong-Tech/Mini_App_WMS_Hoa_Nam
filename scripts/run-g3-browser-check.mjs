import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Defaults retain the original local QA setup. Environment overrides let the
// same read-only Green check run against an isolated loopback server without
// modifying any runtime configuration.
const browserOrigin = process.env.G3_CDP_ORIGIN ?? "http://127.0.0.1:9227";
const appOrigin = process.env.G3_APP_ORIGIN ?? "http://localhost:2999";
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

const waitFor = async (cdp, expression, label, attempts = 80) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(cdp, expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const navigate = async (cdp, path) => {
  await cdp.command("Page.navigate", { url: `${appOrigin}${path}` });
  await waitFor(cdp, "document.readyState === 'complete' && Boolean(document.querySelector('.hn-page'))", path);
  await delay(300);
};

const screenshot = async (cdp, fileName) => {
  const image = await cdp.command("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  await writeFile(resolve(evidenceDirectory, fileName), Buffer.from(image.data, "base64"));
};

const baseMetrics = () => `(() => {
  const page = document.querySelector('.hn-page');
  const grid = document.querySelector('.product-grid');
  return {
    url: location.href,
    page: page ? { scrollTop: page.scrollTop, scrollHeight: page.scrollHeight, clientHeight: page.clientHeight, overflowY: getComputedStyle(page).overflowY } : null,
    windowScrollY: window.scrollY,
    grid: grid ? {
      className: grid.className,
      loadedCount: grid.dataset.loadedCount ?? null,
      columns: getComputedStyle(grid).gridTemplateColumns,
      domCards: grid.querySelectorAll('.product-card').length,
      virtualColumns: grid.dataset.virtualColumns ?? null,
    } : null,
  };
})()`;

await mkdir(evidenceDirectory, { recursive: true });
const version = await fetch(`${browserOrigin}/json/version`);
if (!version.ok) throw new Error("Chrome DevTools is unavailable");
const targetResponse = await fetch(`${browserOrigin}/json/new?${encodeURIComponent(`${appOrigin}/products?domain=POWER_TOOLS`)}`, { method: "PUT" });
if (!targetResponse.ok) throw new Error(`Unable to create Chrome target (${targetResponse.status})`);
const target = await targetResponse.json();
const cdp = await connect(target.webSocketDebuggerUrl);

try {
  await cdp.command("Page.enable");
  await cdp.command("Runtime.enable");
  await cdp.command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.command("Emulation.setTouchEmulationEnabled", { enabled: true });
  await cdp.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

  const results = { environment: { appOrigin, viewport: { width: 390, height: 844, dpr: 1 }, reducedMotion: true }, cases: {} };

  await navigate(cdp, "/categories?domain=POWER_TOOLS");
  await waitFor(cdp, "document.querySelectorAll('.catalogue-toolbar--domains > button').length === 3", "three canonical category tabs");
  await waitFor(cdp, "!document.querySelector('.catalogue-skeleton')", "Green category response");
  results.cases.categories = await evaluate(cdp, `(() => ({
    ...${baseMetrics()},
    tabCount: document.querySelectorAll('.catalogue-toolbar--domains > button').length,
    categoryCount: document.querySelectorAll('.category-card').length,
    labelsWrap: [...document.querySelectorAll('.catalogue-toolbar--domains > button')].map((item) => ({ text: item.textContent?.trim(), whiteSpace: getComputedStyle(item).whiteSpace, minWidth: getComputedStyle(item).minWidth })),
  }))()`);
  await screenshot(cdp, "categories-390x844.png");

  await navigate(cdp, "/products?domain=POWER_TOOLS");
  await waitFor(cdp, "document.querySelectorAll('.product-card').length >= 4", "first progressive product batch");
  results.cases.productsInitial = await evaluate(cdp, `${baseMetrics()}`);

  await evaluate(cdp, "document.querySelector('.product-card__link')?.click()");
  await waitFor(cdp, "Boolean(document.querySelector('.product-detail-template'))", "product detail");
  results.cases.detail = await evaluate(cdp, `(() => ({
    ...${baseMetrics()},
    hasGalleryLink: Boolean(document.querySelector('.detail-template__zoom')),
    variantButtons: document.querySelectorAll('.detail-template__variants button').length,
    relatedCards: document.querySelectorAll('.detail-template__related button[aria-label^=\"Xem\"] ').length,
  }))()`);
  if (!results.cases.detail.hasGalleryLink) throw new Error("Selected Green product has no public gallery media; gallery G3 case is not covered");
  await evaluate(cdp, "document.querySelector('.detail-template__zoom')?.click()");
  await waitFor(cdp, "Boolean(document.querySelector('.product-gallery--full'))", "gallery route");
  results.cases.gallery = await evaluate(cdp, `(() => ({
    ...${baseMetrics()},
    zoomControls: document.querySelectorAll('.product-gallery__zoom-controls button').length,
    closeControl: Boolean(document.querySelector('.product-gallery__close')),
  }))()`);
  await screenshot(cdp, "gallery-390x844.png");
  await evaluate(cdp, "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await waitFor(cdp, "Boolean(document.querySelector('.product-detail-template'))", "gallery close by Escape");

  await navigate(cdp, "/products?domain=POWER_TOOLS");
  await waitFor(cdp, "document.querySelectorAll('.product-card').length >= 4", "product list after gallery back");

  await evaluate(cdp, "document.querySelector('.catalogue-toolbar > button')?.click()" );
  await waitFor(cdp, "document.body.innerText.includes('Lọc & sắp xếp')", "filter sheet");
  const sheetWhileOpen = await evaluate(cdp, "(() => ({ open: document.body.innerText.includes('Lọc & sắp xếp'), pageOverflow: getComputedStyle(document.querySelector('.hn-page')).overflowY }))()" );
  await evaluate(cdp, "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))" );
  await waitFor(cdp, "!document.body.innerText.includes('Lọc & sắp xếp')", "filter sheet close by Escape");
  results.cases.filterSheet = { whileOpen: sheetWhileOpen, closedByEscape: true };

  const virtualProgress = [];
  for (let index = 0; index < 20; index += 1) {
    if (await evaluate(cdp, "Boolean(document.querySelector('.product-grid--virtual'))")) break;
    const before = await evaluate(cdp, "document.querySelectorAll('.product-card').length");
    await evaluate(cdp, "document.querySelector('.infinite-load button')?.click()" );
    await waitFor(
      cdp,
      `Boolean(document.querySelector('.product-grid--virtual')) || document.querySelectorAll('.product-card').length > ${before}`,
      `progressive batch ${index + 1}`,
    );
    virtualProgress.push(await evaluate(cdp, `${baseMetrics()}`));
  }
  await waitFor(cdp, "Boolean(document.querySelector('.product-grid--virtual'))", "virtual grid at 80 loaded and rendered records");
  results.cases.virtualAt80 = { metrics: await evaluate(cdp, `${baseMetrics()}`), progress: virtualProgress };
  await screenshot(cdp, "products-virtual-390x844.png");

  await evaluate(cdp, "document.querySelector('.hn-page').scrollTop = 4200");
  await delay(120);
  const focusBeforeVirtualScroll = await evaluate(cdp, `(() => {
    const target = document.querySelector('.product-grid--virtual .product-card__link');
    target?.focus({ preventScroll: true });
    return target?.getAttribute('aria-label') ?? null;
  })()`);
  await evaluate(cdp, "document.querySelector('.hn-page').scrollTop = 7600");
  await delay(120);
  results.cases.virtualFocus = await evaluate(cdp, `(() => ({
    focusedLabel: document.activeElement?.getAttribute?.('aria-label') ?? null,
    expectedLabel: ${JSON.stringify(focusBeforeVirtualScroll)},
    retained: document.activeElement?.getAttribute?.('aria-label') === ${JSON.stringify(focusBeforeVirtualScroll)},
  }))()`);

  await cdp.command("Emulation.setDeviceMetricsOverride", { width: 1024, height: 900, deviceScaleFactor: 1, mobile: false });
  await waitFor(cdp, "document.querySelector('.product-grid--virtual')?.dataset.virtualColumns === '4'", "virtual grid responsive 4-column resize");
  results.cases.virtualDesktopResize = await evaluate(cdp, `${baseMetrics()}`);
  await cdp.command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  const model = await evaluate(cdp, "document.querySelector('.product-card__code')?.textContent?.trim() ?? document.querySelector('.product-card__identity')?.textContent?.trim() ?? ''");
  await navigate(cdp, "/search");
  await waitFor(cdp, "Boolean(document.querySelector('.search-entry--page input'))", "search input");
  await evaluate(cdp, `(() => {
    const input = document.querySelector('.search-entry--page input');
    input.focus();
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    return document.activeElement === input;
  })()`);
  await cdp.command("Input.insertText", { text: "khong-co-ket-qua" });
  await cdp.command("Input.dispatchKeyEvent", { type: "rawKeyDown", modifiers: 2, windowsVirtualKeyCode: 65, code: "KeyA", key: "a" });
  await cdp.command("Input.dispatchKeyEvent", { type: "keyUp", modifiers: 2, windowsVirtualKeyCode: 65, code: "KeyA", key: "a" });
  await cdp.command("Input.insertText", { text: model });
  await waitFor(cdp, `document.querySelector('.search-entry--page input')?.value === ${JSON.stringify(model)} && document.querySelectorAll('.product-card').length === 1`, "committed final search query");
  results.cases.searchImeAndRace = await evaluate(cdp, `(() => ({
    input: document.querySelector('.search-entry--page input')?.value ?? null,
    caption: document.querySelector('.result-caption')?.textContent?.trim() ?? null,
    cards: document.querySelectorAll('.product-card').length,
    pageScrollY: document.querySelector('.hn-page')?.scrollTop ?? null,
  }))()`);
  await screenshot(cdp, "search-390x844.png");

  await cdp.command("Emulation.setDeviceMetricsOverride", { width: 1024, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(cdp, "/products?domain=POWER_TOOLS");
  await waitFor(cdp, "document.querySelectorAll('.product-card').length >= 4", "desktop first progressive batch");
  results.cases.desktopGrid = await evaluate(cdp, `${baseMetrics()}`);

  await cdp.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await navigate(cdp, "/products?domain=POWER_TOOLS");
  await waitFor(cdp, "document.querySelectorAll('.product-card').length >= 4", "normal-motion product batch");
  await delay(500);
  results.cases.optionalGsapMotion = await evaluate(cdp, `(() => ({
    gsapChunkLoaded: performance.getEntriesByType('resource').some((entry) => /gsap/i.test(entry.name)),
    visibleCards: [...document.querySelectorAll('.product-card')].every((node) => {
      const style = getComputedStyle(node); return style.opacity === '1' && style.transform === 'none';
    }),
  }))()`);
  await cdp.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

  await writeFile(resolve(evidenceDirectory, "interaction-results.json"), `${JSON.stringify(results, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(results)}\n`);
} catch (error) {
  const diagnostic = {
    error: error instanceof Error ? error.message : String(error),
    url: await evaluate(cdp, "location.href").catch(() => null),
    text: await evaluate(cdp, "document.body?.innerText?.slice(0, 4000) ?? ''").catch(() => null),
    cards: await evaluate(cdp, "document.querySelectorAll('.product-card').length").catch(() => null),
    page: await evaluate(cdp, "Boolean(document.querySelector('.hn-page'))").catch(() => null),
  };
  await writeFile(resolve(evidenceDirectory, "browser-failure.json"), `${JSON.stringify(diagnostic, null, 2)}\n`);
  throw error;
} finally {
  cdp.close();
}
