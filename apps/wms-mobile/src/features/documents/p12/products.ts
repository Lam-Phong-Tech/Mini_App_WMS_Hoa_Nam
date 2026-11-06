import { uuid, type Page, type Scan } from './contract';

export interface ProductGroup {
  key: string;
  skuId: string | null;
  name: string | null;
  code: string | null;
  rows: Scan[];
  quantity: number | null;
  unit: string | null;
  mixedUnits: boolean;
  serialCount: number;
  complete: boolean;
}
const oneText = (values: unknown[]): string | null => {
  const strings = values.filter(
    (v): v is string => typeof v === 'string' && !!v.trim(),
  );
  if (strings.length !== values.length) return null;
  const unique = [...new Set(strings)];
  return unique.length === 1 ? unique[0] : null;
};

/** Groups loaded evidence, never planned lines or a synthetic inventory total. */
export function productGroups(page?: Page<Scan>, query = '') {
  const paging = page?.paging,
    summary = page?.summary;
  const terminal =
    typeof paging?.hasMore === 'boolean'
      ? paging.hasMore === false
      : typeof paging?.page === 'number' &&
        typeof paging.lastPage === 'number' &&
        paging.page === paging.lastPage;
  const complete =
    !!page &&
    !!paging &&
    terminal &&
    !page.refreshRequired &&
    summary?.coverage === 'CURRENT_QUERY' &&
    page.items.length === paging?.total &&
    summary.entry_count === paging.total;
  const buckets = new Map<string, Scan[]>();
  for (const row of page?.items ?? []) {
    const key = uuid(row.sku_id) ? 'sku:' + row.sku_id : 'entry:' + row.id;
    const rows = buckets.get(key) ?? [];
    rows.push(row);
    buckets.set(key, rows);
  }
  const all: ProductGroup[] = [...buckets].map(([key, rows]) => {
    const units = [
      ...new Set(
        rows
          .map(r => r.unit)
          .filter((v): v is string => typeof v === 'string' && !!v.trim()),
      ),
    ];
    const unit =
      units.length === 1 &&
      rows.every(r => typeof r.unit === 'string' && !!r.unit.trim())
        ? units[0]
        : null;
    const quantity =
      complete &&
      unit &&
      rows.every(
        r =>
          typeof r.quantity === 'number' &&
          Number.isFinite(r.quantity) &&
          r.quantity >= 0,
      )
        ? rows.reduce((sum, r) => sum + r.quantity!, 0)
        : null;
    return {
      key,
      skuId: uuid(rows[0].sku_id) ? String(rows[0].sku_id) : null,
      name: oneText(rows.map(r => r.sku_name)),
      code: oneText(rows.map(r => r.sku_code)),
      rows,
      quantity,
      unit,
      mixedUnits: units.length > 1,
      complete,
      serialCount: new Set(
        rows
          .map(r => r.serial_number)
          .filter((v): v is string => typeof v === 'string' && !!v.trim()),
      ).size,
    };
  });
  const needle = query.trim().toLocaleLowerCase();
  // Filter complete loaded groups, not just matched rows/quantities within them.
  const groups = all.filter(
    group =>
      !needle ||
      group.rows.some(row =>
        [row.sku_code, row.sku_name, row.raw_code, row.serial_number].some(
          value =>
            typeof value === 'string' &&
            value.toLocaleLowerCase().includes(needle),
        ),
      ),
  );
  return {
    groups,
    complete,
    loaded: page?.items.length ?? 0,
    total: paging?.total ?? null,
  };
}
