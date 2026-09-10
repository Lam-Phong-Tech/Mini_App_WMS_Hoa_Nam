/*
 * UIUX-G3 local-only QA harness.
 *
 * This file is never imported by the Mini App. It creates an in-memory public
 * API double for browser evidence only, starts a local Vite instance against
 * it, then terminates both processes. It accepts no writes; in particular it
 * has no quote endpoint. Do not use this script for UAT, Customer or
 * Production.
 */
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const qaApiPort = 3210;
const qaAppPort = 3211;
const chromeDebugPort = 9330;
const appOrigin = `http://127.0.0.1:${qaAppPort}`;
const apiOrigin = `http://127.0.0.1:${qaApiPort}`;
const browserOrigin = `http://127.0.0.1:${chromeDebugPort}`;
const evidenceDirectory = resolve("docs/uiux-migration/evidence/g3");

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
const noOp = () => {};

const success = (data, meta = {}) => ({
  success: true,
  message: "G3 local QA fixture only",
  data,
  meta,
  error_code: null,
  errors: null,
});

const failure = (errorCode, meta = {}) => ({
  success: false,
  message: "G3 local QA fixture only",
  data: null,
  meta,
  error_code: errorCode,
  errors: null,
});

const category = { code: "QA_POWER", name: "Danh mục QA cô lập", domain: "POWER_TOOLS" };
const toProduct = (index, imageMode = "ok") => ({
  id: `g3-qa-${String(index).padStart(3, "0")}`,
  slug: `g3-qa-product-${String(index).padStart(3, "0")}`,
  name: `Sản phẩm QA ${String(index).padStart(3, "0")}`,
  short_description: "Bản ghi cô lập phục vụ kiểm thử UIUX-G3; không phải Catalogue vận hành.",
  description: "Bản ghi cô lập phục vụ kiểm thử UIUX-G3; không phải Catalogue vận hành.",
  primary_code: `G3QA-${String(index).padStart(3, "0")}`,
  model: `G3QA-${String(index).padStart(3, "0")}`,
  domain: "POWER_TOOLS",
  brand: { code: "G3_QA", name: "QA cô lập" },
  category,
  images: [{
    // A missing same-origin path is still a syntactically valid public media
    // URL. The browser therefore exercises <img onError>, rather than only
    // the pre-render invalid-URL fallback branch.
    url: imageMode === "broken"
      ? `/g3-qa-missing-image-${index}.svg`
      : "https://example.invalid/g3-qa-only-image.svg",
    alt_text: `Ảnh QA ${index}`,
    is_primary: true,
  }],
  features: [{ code: "qa", name: "Dữ liệu QA cô lập" }],
  specifications: [{ code: "power", label: "Công suất", value: "QA" }],
  variants: [{ id: `g3-qa-variant-${index}`, code: `G3QA-${index}`, name: "Bản QA", unit: "bộ", availability: "IN_STOCK" }],
  availability: "IN_STOCK",
  updated_at: "2026-09-10T00:00:00+07:00",
});

const baseConfig = (maintenance = false) => ({
  config_version: "g3-local-qa-only",
  hotline: null,
  zalo_oa: null,
  support_hours: null,
  privacy_policy_url: "https://example.invalid/g3-qa-privacy",
  privacy_version: "g3-qa-only",
  maintenance: {
    enabled: maintenance,
    message: maintenance ? "G3 QA maintenance state only" : null,
  },
  min_supported_app_version: null,
  feature_flags: { quote_request: false },
});

const qaState = {
  scenario: "normal",
  requests: [],
};

const scenarioProductCount = (scenario) => {
  if (scenario === "threshold-79") return 79;
  if (scenario === "threshold-80") return 80;
  if (scenario === "threshold-81") return 81;
  if (scenario === "append-error") return 4;
  return 20;
};

const productPage = (scenario, requestedCursor) => {
  if (scenario === "empty") return success({ items: [], page_info: { limit: 20, has_more: false, next_cursor: null } });
  if (scenario === "rate-limit") return failure("RATE_LIMITED", { retry_after_seconds: 30 });
  if (scenario === "append-error" && requestedCursor) return failure("UPSTREAM_UNAVAILABLE");

  const offset = requestedCursor ? Number.parseInt(requestedCursor.replace("g3qa-", ""), 10) : 0;
  if (!Number.isInteger(offset) || offset < 0) return failure("INVALID_CURSOR");
  const productCount = scenarioProductCount(scenario);
  const imageMode = scenario === "image-error" ? "broken" : "ok";
  const products = Array.from({ length: productCount }, (_, index) => toProduct(index + 1, imageMode));
  const pageSize = scenario === "append-error" ? 4 : 20;
  const items = products.slice(offset, offset + pageSize);
  const nextOffset = offset + items.length;
  return success({
    items,
    page_info: {
      limit: pageSize,
      has_more: nextOffset < products.length || scenario === "append-error",
      next_cursor: nextOffset < products.length || scenario === "append-error" ? `g3qa-${nextOffset}` : null,
    },
  });
};

const sendJson = (response, status, body) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(`${JSON.stringify(body)}\n`);
};

const qaApi = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", apiOrigin);
  qaState.requests.push({ method: request.method ?? "GET", path: url.pathname, scenario: qaState.scenario });

  if (url.pathname === "/__g3qa/scenario" && request.method === "GET") {
    qaState.scenario = url.searchParams.get("value") ?? "normal";
    sendJson(response, 200, { scenario: qaState.scenario });
    return;
  }
  if (url.pathname === "/__g3qa/requests" && request.method === "GET") {
    sendJson(response, 200, { requests: qaState.requests });
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    if (url.pathname.includes("broken")) {
      response.writeHead(404, { "Cache-Control": "no-store" });
      response.end();
      return;
    }
    response.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
    response.end('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="100%" height="100%" fill="#d6edf7"/><text x="24" y="120" fill="#0c6286" font-size="20">G3 QA</text></svg>');
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, 405, failure("METHOD_NOT_ALLOWED"));
    return;
  }
  if (url.pathname === "/api/v1/public/config") {
    sendJson(response, 200, success(baseConfig(qaState.scenario === "maintenance")));
    return;
  }
  if (url.pathname === "/api/v1/public/home") {
    sendJson(response, 200, success({
      domains: [{ code: "POWER_TOOLS", name: "Dụng cụ điện" }],
      sections: [{ code: "NEWEST", title: "QA local only", items: [toProduct(1)] }],
    }));
    return;
  }
  if (url.pathname === "/api/v1/public/categories") {
    sendJson(response, 200, success([category]));
    return;
  }
  if (url.pathname === "/api/v1/public/facets") {
    sendJson(response, 200, success({ category: [{ ...category, count: scenarioProductCount(qaState.scenario) }], power_source: [], feature: [], spec: [] }));
    return;
  }
  if (url.pathname === "/api/v1/public/health/version") {
    sendJson(response, 200, success({ status: "ok" }));
    return;
  }
  if (url.pathname === "/api/v1/public/products") {
    if (qaState.scenario === "loading") await delay(1300);
    sendJson(response, 200, productPage(qaState.scenario, url.searchParams.get("cursor")));
    return;
  }
  if (url.pathname === "/api/v1/public/products/qa-unavailable") {
    sendJson(response, 404, failure("PRODUCT_NOT_AVAILABLE"));
    return;
  }
  if (/^\/api\/v1\/public\/products\/[^/]+\/related$/.test(url.pathname)) {
    sendJson(response, 200, success({ items: [], page_info: { limit: 2, has_more: false, next_cursor: null } }));
    return;
  }
  if (/^\/api\/v1\/public\/products\/[^/]+$/.test(url.pathname)) {
    const index = Number.parseInt(url.pathname.match(/(\d+)$/)?.[1] ?? "1", 10);
    sendJson(response, 200, success(toProduct(index, qaState.scenario === "image-error" ? "broken" : "ok")));
    return;
  }
  sendJson(response, 404, failure("RESOURCE_NOT_FOUND"));
});

const listen = (server, port) => new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(port, "127.0.0.1", () => {
    server.off("error", rejectListen);
    resolveListen();
  });
});

const closeServer = (server) => new Promise((resolveClose) => server.close(resolveClose));

const waitForHttp = async (url, label, attempts = 100) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The local Vite server has not bound its port yet.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
};

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

const waitFor = async (cdp, expression, label, attempts = 100) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(cdp, expression)) return;
    await delay(80);
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const screenshot = async (cdp, fileName) => {
  const image = await cdp.command("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  await writeFile(resolve(evidenceDirectory, fileName), Buffer.from(image.data, "base64"));
};

const browserMetrics = () => `(() => {
  const grid = document.querySelector('.product-grid');
  const output = document.querySelector('.catalogue-toolbar output')?.textContent?.trim() ?? null;
  return {
    url: location.href,
    output,
    state: document.querySelector('.system-state')?.className ?? null,
    cards: document.querySelectorAll('.product-card').length,
    fallbackImages: document.querySelectorAll('.public-image--fallback').length,
    skeleton: Boolean(document.querySelector('.catalogue-skeleton')),
    grid: grid ? {
      className: grid.className,
      loadedCount: Number(grid.dataset.loadedCount ?? 0),
      virtualColumns: grid.dataset.virtualColumns ?? null,
    } : null,
  };
})()`;

const setScenario = async (scenario) => {
  const response = await fetch(`${apiOrigin}/__g3qa/scenario?value=${encodeURIComponent(scenario)}`);
  if (!response.ok) throw new Error(`Unable to set QA scenario ${scenario}`);
};

const loadScenario = async (cdp, scenario, path) => {
  await setScenario(scenario);
  await cdp.command("Storage.clearDataForOrigin", { origin: appOrigin, storageTypes: "all" });
  await cdp.command("Page.navigate", { url: `${appOrigin}${path}` });
  await waitFor(cdp, "document.readyState === 'complete' && Boolean(document.querySelector('.hn-page'))", `${scenario} route`);
};

const drainList = async (cdp, expectedCount, expectsVirtual) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const metrics = await evaluate(cdp, browserMetrics());
    const completed = metrics.grid?.loadedCount === expectedCount
      && metrics.output === `Đã hiển thị ${expectedCount}`
      && (expectsVirtual ? metrics.grid?.className.includes("product-grid--virtual") : !metrics.grid?.className.includes("product-grid--virtual"));
    if (completed) return metrics;
    const clicked = await evaluate(cdp, `(() => {
      const button = document.querySelector('.infinite-load button');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`);
    if (!clicked) await delay(100);
    await delay(120);
  }
  throw new Error(`Timed out draining local QA list to ${expectedCount}`);
};

await mkdir(evidenceDirectory, { recursive: true });
await listen(qaApi, qaApiPort);

const vite = spawn(
  process.execPath,
  [resolve("node_modules/vite/bin/vite.js"), ".", "--host", "127.0.0.1", "--port", String(qaAppPort), "--mode", "g3-qa"],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      VITE_APP_ENV: "DEV",
      VITE_USE_DEV_MOCK: "false",
      VITE_PUBLIC_API_BASE_URL: apiOrigin,
    },
    stdio: "ignore",
    windowsHide: true,
  },
);

let cdp;
const results = {
  recorded_at: new Date().toISOString(),
  scope: "Local-only in-memory G3 QA adapter; not runtime/UAT/Customer/Production.",
  environment: {
    app_origin: appOrigin,
    fixture_origin: apiOrigin,
    browser_debug_port: chromeDebugPort,
    viewport: { width: 390, height: 844, dpr: 1 },
  },
  cases: {},
  writes: [],
};

try {
  await waitForHttp(`${appOrigin}/`, "local G3 QA app");
  const chrome = await fetch(`${browserOrigin}/json/version`);
  if (!chrome.ok) throw new Error(`Chrome DevTools is unavailable at ${browserOrigin}`);
  const createdTarget = await fetch(`${browserOrigin}/json/new?${encodeURIComponent(`${appOrigin}/products?domain=POWER_TOOLS`)}`, { method: "PUT" });
  if (!createdTarget.ok) throw new Error(`Unable to create Chrome target (${createdTarget.status})`);
  const target = await createdTarget.json();
  cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.command("Page.enable");
  await cdp.command("Runtime.enable");
  await cdp.command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.command("Emulation.setTouchEmulationEnabled", { enabled: true });
  await cdp.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

  await loadScenario(cdp, "loading", "/products?domain=POWER_TOOLS");
  await waitFor(cdp, "Boolean(document.querySelector('.catalogue-skeleton'))", "loading skeleton");
  results.cases.loading = await evaluate(cdp, browserMetrics());
  await screenshot(cdp, "qa-loading-390x844.png");
  // The in-viewport sentinel may legitimately reveal the second four-card
  // batch immediately; assert the first batch was retained without treating
  // that native observer scheduling as an error.
  await waitFor(cdp, "document.querySelectorAll('.product-card').length >= 4", "loaded products after skeleton");

  await loadScenario(cdp, "empty", "/products?domain=POWER_TOOLS");
  await waitFor(cdp, "Boolean(document.querySelector('.system-state--empty'))", "empty state");
  results.cases.empty = await evaluate(cdp, browserMetrics());
  await screenshot(cdp, "qa-empty-390x844.png");

  await loadScenario(cdp, "append-error", "/products?domain=POWER_TOOLS");
  await waitFor(cdp, "document.querySelectorAll('.product-card').length >= 4", "append-error initial cards");
  await evaluate(cdp, "document.querySelector('.infinite-load button')?.click()");
  await waitFor(cdp, "Boolean(document.querySelector('.infinite-load__error'))", "append error preservation");
  results.cases.append_error = await evaluate(cdp, browserMetrics());
  await screenshot(cdp, "qa-append-error-390x844.png");

  await loadScenario(cdp, "rate-limit", "/products?domain=POWER_TOOLS");
  await waitFor(cdp, "Boolean(document.querySelector('.system-state--rate-limited'))", "rate-limited state");
  results.cases.rate_limit = await evaluate(cdp, browserMetrics());
  await screenshot(cdp, "qa-rate-limit-390x844.png");

  await loadScenario(cdp, "maintenance", "/products?domain=POWER_TOOLS");
  await waitFor(cdp, "Boolean(document.querySelector('.system-state--maintenance'))", "maintenance state");
  results.cases.maintenance = await evaluate(cdp, browserMetrics());
  await screenshot(cdp, "qa-maintenance-390x844.png");

  await loadScenario(cdp, "normal", "/products/qa-unavailable");
  await waitFor(cdp, "Boolean(document.querySelector('.system-state--unavailable'))", "unavailable product state");
  results.cases.unavailable = await evaluate(cdp, browserMetrics());
  await screenshot(cdp, "qa-unavailable-390x844.png");

  await loadScenario(cdp, "image-error", "/products?domain=POWER_TOOLS");
  await waitFor(cdp, "document.querySelectorAll('.product-card').length >= 4", "image-error cards");
  await waitFor(cdp, "document.querySelectorAll('.public-image--fallback').length >= 4", "image fallback");
  results.cases.image_error = await evaluate(cdp, browserMetrics());
  await screenshot(cdp, "qa-image-error-390x844.png");

  for (const [scenario, expectedCount, expectsVirtual] of [
    ["threshold-79", 79, false],
    ["threshold-80", 80, true],
    ["threshold-81", 81, true],
  ]) {
    await loadScenario(cdp, scenario, "/products?domain=POWER_TOOLS");
    await waitFor(cdp, "document.querySelectorAll('.product-card').length >= 4", `${scenario} initial cards`);
    results.cases[scenario] = await drainList(cdp, expectedCount, expectsVirtual);
    await screenshot(cdp, `qa-${scenario}-390x844.png`);
  }

  results.writes = qaState.requests.filter((entry) => entry.method !== "GET" && entry.method !== "HEAD");
  if (results.writes.length) throw new Error(`QA fixture observed unexpected write methods: ${JSON.stringify(results.writes)}`);
  await writeFile(resolve(evidenceDirectory, "qa-interaction-results.json"), `${JSON.stringify(results, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(results)}\n`);
} catch (error) {
  const diagnostic = {
    error: error instanceof Error ? error.message : String(error),
    scenario: qaState.scenario,
    requests: qaState.requests,
  };
  await writeFile(resolve(evidenceDirectory, "qa-browser-failure.json"), `${JSON.stringify(diagnostic, null, 2)}\n`);
  throw error;
} finally {
  cdp?.close();
  vite.kill();
  vite.on("error", noOp);
  await closeServer(qaApi);
}
