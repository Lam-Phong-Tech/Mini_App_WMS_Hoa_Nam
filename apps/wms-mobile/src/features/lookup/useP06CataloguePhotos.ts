import { useEffect, useRef, useState } from 'react';
import type {
  P06CatalogService,
  P06Context,
  P06GalleryImage,
  P06Card,
} from '../../services/wms/p06Catalog';

/** Gallery is a separate P06 read; its failure never changes stock, count or list semantics. */
export function useP06CataloguePhotos(
  service: P06CatalogService,
  context: P06Context | undefined,
  scopeKey: string | undefined,
  cards: readonly P06Card[] | undefined,
  enabled: boolean,
) {
  type Cache = {
    context?: P06Context;
    scope?: string;
    photos: Record<string, readonly P06GalleryImage[]>;
  };
  const cache = useRef<Cache>({ photos: {} }),
    [result, setResult] = useState<Cache>(cache.current);
  useEffect(() => {
    if (!enabled || !context || !scopeKey || !cards?.length) return;
    if (cache.current.context !== context || cache.current.scope !== scopeKey) {
      cache.current = { context, scope: scopeKey, photos: {} };
      setResult({ ...cache.current });
    }
    const scopeCache = cache.current,
      abort = new AbortController();
    let live = true,
      next = 0;
    const queue = cards.filter(
      card => card.card_type === 'SKU' && !(card.sku_id in scopeCache.photos),
    );
    async function worker() {
      while (live && next < queue.length) {
        const card = queue[next++];
        let images: readonly P06GalleryImage[] = [];
        try {
          images = (
            await service.gallery(context!, card.sku_id, {
              signal: abort.signal,
            })
          ).data;
        } catch {
          if (!live) return;
          continue;
        }
        if (!live || cache.current !== scopeCache) return;
        scopeCache.photos = { ...scopeCache.photos, [card.sku_id]: images };
        setResult({ ...scopeCache });
      }
    }
    for (let n = 0; n < Math.min(4, queue.length); n++) void worker();
    return () => {
      live = false;
      abort.abort();
    };
  }, [service, context, scopeKey, cards, enabled]);
  return enabled && result.context === context && result.scope === scopeKey
    ? result.photos
    : {};
}
