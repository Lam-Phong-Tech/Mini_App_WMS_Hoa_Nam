import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const argumentsByName = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  argumentsByName.set(process.argv[index], process.argv[index + 1]);
}

const url = argumentsByName.get("--url");
const outputPath = argumentsByName.get("--output");
const scrollTop = Number(argumentsByName.get("--scroll") ?? "0");
const scrollSelector = argumentsByName.get("--scroll-selector") ?? "window";
const debugPort = Number(argumentsByName.get("--debug-port") ?? "9227");
const settleMilliseconds = Number(argumentsByName.get("--settle-ms") ?? "400");

if (!url || !outputPath || !Number.isFinite(scrollTop) || !Number.isFinite(settleMilliseconds)) {
  throw new Error(
    "Usage: node scripts/capture-g2-visual.mjs --url <URL> --output <PNG> [--scroll <px>] [--scroll-selector <CSS|window>] [--settle-ms <ms>] [--debug-port <port>]",
  );
}

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
    const resolver = pending.get(message.id);
    if (!resolver) return;
    pending.delete(message.id);
    if (message.error) resolver.reject(new Error(`${message.error.message} (${message.error.code})`));
    else resolver.resolve(message.result);
  });

  return {
    command(method, params = {}) {
      const id = nextId;
      nextId += 1;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolveCommand, rejectCommand) => {
        pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
      });
    },
    close() {
      socket.close();
    },
  };
};

const browserOrigin = `http://127.0.0.1:${debugPort}`;
const versionResponse = await fetch(`${browserOrigin}/json/version`);
if (!versionResponse.ok) throw new Error(`Chrome DevTools is unavailable at ${browserOrigin}`);

const newTargetResponse = await fetch(`${browserOrigin}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
if (!newTargetResponse.ok) throw new Error(`Chrome could not open the requested target: ${newTargetResponse.status}`);
const target = await newTargetResponse.json();
const cdp = await connect(target.webSocketDebuggerUrl);

try {
  await cdp.command("Page.enable");
  await cdp.command("Runtime.enable");
  await cdp.command("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp.command("Emulation.setTouchEmulationEnabled", { enabled: true });
  await cdp.command("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await cdp.command("Page.navigate", { url });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { result } = await cdp.command("Runtime.evaluate", {
      expression: "document.readyState",
      returnByValue: true,
    });
    if (result.value === "complete") break;
    await delay(100);
  }

  await cdp.command("Runtime.evaluate", {
    expression: "document.fonts ? document.fonts.ready.then(() => true) : true",
    awaitPromise: true,
    returnByValue: true,
  });
  await delay(settleMilliseconds);

  const selectorLiteral = JSON.stringify(scrollSelector);
  await cdp.command("Runtime.evaluate", {
    expression: `(() => {
      const top = ${JSON.stringify(scrollTop)};
      const selector = ${selectorLiteral};
      const root = selector === "window" ? window : document.querySelector(selector);
      if (!root) throw new Error("Scroll root not found: " + selector);
      if (root === window) window.scrollTo({ top, left: 0, behavior: "instant" });
      else root.scrollTo({ top, left: 0, behavior: "instant" });
      return true;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  await delay(200);

  const metrics = await cdp.command("Runtime.evaluate", {
    expression: `(() => {
      const selector = ${selectorLiteral};
      const root = selector === "window" ? window : document.querySelector(selector);
      const rect = document.querySelector(".pv-topbar, .hn-topbar")?.getBoundingClientRect();
      return {
        url: location.href,
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        scroll_selector: selector,
        scroll_top: root === window ? window.scrollY : root?.scrollTop ?? null,
        topbar_y: rect?.y ?? null,
        fonts: document.fonts?.status ?? "unavailable",
        reduced_motion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        content: (() => {
          const content = document.querySelector(".hn-content");
          if (!content) return null;
          const style = getComputedStyle(content);
          return {
            width: style.width,
            min_width: style.minWidth,
            max_width: style.maxWidth,
            padding: style.padding,
            rect: content.getBoundingClientRect().toJSON(),
            scroll_width: content.scrollWidth,
          };
        })(),
        search: (() => {
          const search = document.querySelector(".hn-topbar-search");
          if (!search) return null;
          const style = getComputedStyle(search);
          return {
            rect: search.getBoundingClientRect().toJSON(),
            height: style.height,
            min_height: style.minHeight,
            margin: style.margin,
            padding: style.padding,
          };
        })(),
        header: (() => {
          const header = document.querySelector(".hn-header");
          if (!header) return null;
          const style = getComputedStyle(header);
          return {
            rect: header.getBoundingClientRect().toJSON(),
            margin: style.margin,
            padding: style.padding,
          };
        })(),
        topbar: (() => {
          const topbar = document.querySelector(".hn-topbar");
          if (!topbar) return null;
          const style = getComputedStyle(topbar);
          return {
            rect: topbar.getBoundingClientRect().toJSON(),
            display: style.display,
            gap: style.gap,
            row_gap: style.rowGap,
            padding: style.padding,
            grid_template_rows: style.gridTemplateRows,
          };
        })(),
        domain_grid: (() => {
          const grid = document.querySelector(".domain-grid");
          if (!grid) return null;
          const style = getComputedStyle(grid);
          return {
            columns: style.gridTemplateColumns,
            gap: style.gap,
            rect: grid.getBoundingClientRect().toJSON(),
            cards: [...grid.children].map((card) => card.getBoundingClientRect().toJSON()),
          };
        })(),
      };
    })()`,
    returnByValue: true,
  });
  const screenshot = await cdp.command("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });

  const absoluteOutputPath = resolve(outputPath);
  await mkdir(dirname(absoluteOutputPath), { recursive: true });
  await writeFile(absoluteOutputPath, Buffer.from(screenshot.data, "base64"));
  process.stdout.write(`${JSON.stringify(metrics.result.value)}\n`);
} finally {
  cdp.close();
}
