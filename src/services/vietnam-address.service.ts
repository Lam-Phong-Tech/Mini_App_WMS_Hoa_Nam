export interface VietnamProvince {
  code: number;
  name: string;
}

export interface VietnamWard {
  code: number;
  name: string;
  province_code?: number;
}

interface ProvinceApiRecord {
  code?: number;
  name?: string;
  province_code?: number;
  wards?: ProvinceApiRecord[];
}

const PROVINCES_API_BASE_URL = "https://provinces.open-api.vn/api/v2";
const ADDRESS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let provinceCache:
  | {
      loadedAt: number;
      items: VietnamProvince[];
    }
  | undefined;
let provinceInFlight: Promise<VietnamProvince[]> | undefined;
const wardCache = new Map<
  number,
  {
    loadedAt: number;
    items: VietnamWard[];
  }
>();
const wardInFlight = new Map<number, Promise<VietnamWard[]>>();

export async function getVietnamProvinces() {
  if (
    provinceCache &&
    Date.now() - provinceCache.loadedAt < ADDRESS_CACHE_TTL_MS
  ) {
    return provinceCache.items;
  }

  if (provinceInFlight) return provinceInFlight;

  provinceInFlight = fetchJson<ProvinceApiRecord[]>(
    `${PROVINCES_API_BASE_URL}/`,
  )
    .then((records) =>
      records
        .map(mapProvince)
        .filter(isVietnamProvince)
        .sort((left, right) => left.name.localeCompare(right.name, "vi")),
    )
    .then((items) => {
      provinceCache = {
        loadedAt: Date.now(),
        items,
      };
      return items;
    })
    .finally(() => {
      provinceInFlight = undefined;
    });

  return provinceInFlight;
}

export async function getVietnamWards(provinceCode: number) {
  const cached = wardCache.get(provinceCode);
  if (cached && Date.now() - cached.loadedAt < ADDRESS_CACHE_TTL_MS) {
    return cached.items;
  }

  const inFlight = wardInFlight.get(provinceCode);
  if (inFlight) return inFlight;

  const request = fetchJson<ProvinceApiRecord>(
    `${PROVINCES_API_BASE_URL}/p/${provinceCode}?depth=2`,
  )
    .then((record) =>
      (Array.isArray(record.wards) ? record.wards : [])
        .map(mapWard)
        .filter(isVietnamWard),
    )
    .then((items) => {
      wardCache.set(provinceCode, {
        loadedAt: Date.now(),
        items,
      });
      return items;
    })
    .finally(() => {
      wardInFlight.delete(provinceCode);
    });

  wardInFlight.set(provinceCode, request);
  return request;
}

async function fetchJson<TResponse>(url: string): Promise<TResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`ADDRESS_API_${response.status}`);
    }

    return (await response.json()) as TResponse;
  } finally {
    window.clearTimeout(timeout);
  }
}

function mapProvince(record?: ProvinceApiRecord): VietnamProvince | undefined {
  if (!record?.code || !record.name) return undefined;
  return {
    code: record.code,
    name: record.name,
  };
}

function isVietnamProvince(
  value: VietnamProvince | undefined,
): value is VietnamProvince {
  return Boolean(value);
}

function mapWard(record?: ProvinceApiRecord): VietnamWard | undefined {
  if (!record?.code || !record.name) return undefined;
  return {
    code: record.code,
    name: record.name,
    province_code: record.province_code,
  };
}

function isVietnamWard(value: VietnamWard | undefined): value is VietnamWard {
  return Boolean(value);
}
