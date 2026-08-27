import { getMiniSessionToken } from "@/services/auth-session.service";

const LINK_CONTEXT_STORAGE_KEY = "miniapp_wms_link_context";
const WMS_ACCESS_TOKEN_STORAGE_KEY = "miniapp_wms_access_token";

export interface WmsLinkContext {
  documentId?: string;
  warehouseId?: string;
  lineId?: string;
  ifMatch?: string;
  accessToken?: string;
}

const FIELD_ALIASES: Record<keyof WmsLinkContext, string[]> = {
  documentId: ["documentId", "document_id", "inbound_document_id", "doc_id"],
  warehouseId: ["warehouseId", "warehouse_id", "dst_warehouse_id"],
  lineId: ["lineId", "line_id", "inbound_line_id"],
  ifMatch: ["ifMatch", "if_match", "version", "etag"],
  accessToken: ["wmsToken", "wms_token", "access_token", "token"],
};

export function getWmsLinkContext(): WmsLinkContext {
  const stored = readStoredContext();
  const fromUrl = readContextFromUrl();
  const merged = compactContext({ ...stored, ...fromUrl });

  if (Object.keys(fromUrl).length > 0) {
    writeStoredContext(merged);
  }

  return merged;
}

export function mergeWmsLinkContext(patch: WmsLinkContext): WmsLinkContext {
  const merged = compactContext({
    ...getWmsLinkContext(),
    ...patch,
  });

  writeStoredContext(merged);
  return merged;
}

export function getWmsAuthHeaders(): Record<string, string | undefined> {
  const token = getWmsAccessToken();

  return {
    Authorization: token ? `Bearer ${token}` : undefined,
  };
}

export function clearWmsLinkContext() {
  try {
    window.localStorage.removeItem(LINK_CONTEXT_STORAGE_KEY);
    window.sessionStorage.removeItem(LINK_CONTEXT_STORAGE_KEY);
    window.sessionStorage.removeItem(WMS_ACCESS_TOKEN_STORAGE_KEY);
  } catch {
    // Không để lỗi storage làm kẹt logout/session gate.
  }
}

export function getWmsApiBaseUrl() {
  if (import.meta.env.DEV) {
    if (import.meta.env.VITE_WMS_DEV_DIRECT === "true") {
      return (
        import.meta.env.VITE_WMS_API_BASE_URL ||
        import.meta.env.VITE_API_BASE_URL ||
        ""
      );
    }

    return (
      import.meta.env.VITE_WMS_DEV_PROXY_BASE_URL ||
      "http://localhost:2999/wms-api"
    );
  }

  return (
    import.meta.env.VITE_WMS_API_BASE_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    ""
  );
}

function readContextFromUrl(): WmsLinkContext {
  const params = new URLSearchParams(window.location.search);
  const context: WmsLinkContext = {};

  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<
    [keyof WmsLinkContext, string[]]
  >) {
    const value = aliases
      .map((alias) => params.get(alias))
      .find((candidate) => Boolean(candidate?.trim()));

    if (value) {
      context[field] = value.trim();
    }
  }

  return context;
}

function readStoredContext(): WmsLinkContext {
  try {
    const raw =
      window.localStorage.getItem(LINK_CONTEXT_STORAGE_KEY) ||
      window.sessionStorage.getItem(LINK_CONTEXT_STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as WmsLinkContext) : {};
    const accessToken =
      window.sessionStorage.getItem(WMS_ACCESS_TOKEN_STORAGE_KEY) || undefined;

    return compactContext({ ...stored, accessToken });
  } catch {
    return {};
  }
}

function writeStoredContext(context: WmsLinkContext) {
  try {
    const { accessToken, ...safeContext } = context;

    window.sessionStorage.setItem(
      LINK_CONTEXT_STORAGE_KEY,
      JSON.stringify(compactContext(safeContext)),
    );
    window.localStorage.setItem(
      LINK_CONTEXT_STORAGE_KEY,
      JSON.stringify(compactContext(safeContext)),
    );

    if (accessToken) {
      window.sessionStorage.setItem(WMS_ACCESS_TOKEN_STORAGE_KEY, accessToken);
    }
  } catch {
    // Some embedded WebViews can temporarily block sessionStorage.
    // Link context remains available from the current URL for this render.
  }
}

function getWmsAccessToken() {
  try {
    return (
      getWmsLinkContext().accessToken ||
      window.sessionStorage.getItem(WMS_ACCESS_TOKEN_STORAGE_KEY) ||
      getMiniSessionToken() ||
      undefined
    );
  } catch {
    return getMiniSessionToken() || getWmsLinkContext().accessToken;
  }
}

function compactContext(context: WmsLinkContext): WmsLinkContext {
  return Object.fromEntries(
    Object.entries(context).filter(([, value]) => Boolean(value)),
  ) as WmsLinkContext;
}
