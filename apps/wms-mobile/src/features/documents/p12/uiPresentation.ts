import type { State } from './controller';
import type { P16DataStateKind } from '../../system/P16DataState';

/** Only a verified zero can describe an empty source or a zero-result query. */
export function documentListState(
  state: Pick<State, 'list' | 'filters' | 'stockQueue'>,
): P16DataStateKind | null {
  if (state.list.status === 'error') return 'error';
  if (state.list.status !== 'ready') return 'loading';
  if (state.list.data?.items.length || state.list.data?.paging.total !== 0)
    return null;
  const { q, status, from, to } = state.filters;
  return q.trim() || status !== 'all' || from || to || state.stockQueue
    ? 'no-results'
    : 'empty';
}

/** Display only: preserve unknown source bytes, never infer file pages or data. */
export function documentFileMetadata(mime: string, bytes: number | null | undefined): string {
  const kind = ({'application/pdf':'PDF','image/png':'PNG','image/jpeg':'JPEG','image/webp':'WebP'} as Record<string,string>)[mime] ?? mime;
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return `${kind} · Chưa rõ dung lượng`;
  const size = bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${kind} · ${size}`;
}
