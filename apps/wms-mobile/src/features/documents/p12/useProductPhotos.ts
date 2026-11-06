import { useEffect, useState } from 'react';
import { getSessionGeneration } from '../../../auth/session';
import {
  p06Catalog,
  p06ImageUri,
  p06PrimaryImage,
  type P06CatalogService,
} from '../../../services/wms/p06Catalog';
import { uuid } from './contract';

type Service = Pick<P06CatalogService, 'context' | 'gallery'>;
/** Optional CURRENT catalogue imagery. Never enrich historical quantities/identity. */
export function useProductPhotos(
  ids: readonly (string | null)[],
  scope: string,
  enabled: boolean,
  service: Service = p06Catalog,
) {
  const key = JSON.stringify([...new Set(ids.filter(uuid))].sort());
  const sessionGeneration = getSessionGeneration();
  const [result, setResult] = useState<{
    scope: string;
    key: string;
    generation?: number;
    photos: Record<string, string>;
  }>({ scope: '', key: '', photos: {} });
  useEffect(() => {
    if (!enabled || !scope || key === '[]') return;
    const abort = new AbortController(),
      generation = getSessionGeneration(),
      photos: Record<string, string> = {};
    let live = true,
      next = 0;
    const current = () =>
      live && !abort.signal.aborted && generation === getSessionGeneration();
    async function read() {
      try {
        const context = await service.context({ signal: abort.signal });
        if (!current()) return;
        const queue: string[] = JSON.parse(key);
        async function worker() {
          while (current() && next < queue.length) {
            const id = queue[next++];
            try {
              // P06 checks session, warehouse, permission and response sku_id.
              const gallery = await service.gallery(context.data, id, {
                signal: abort.signal,
              });
              if (!current()) return;
              const image = p06PrimaryImage(gallery.data),
                uri = image && p06ImageUri(image);
              if (uri) photos[id] = uri;
              setResult({ scope, key, generation, photos: { ...photos } });
            } catch {
              // Missing/forbidden images never blank the document or its evidence.
            }
          }
        }
        await Promise.all(
          Array.from({ length: Math.min(4, queue.length) }, () => worker()),
        );
      } catch {
        // Catalogue availability is independent of the owner document GET.
      }
    }
    read().catch(() => undefined);
    return () => {
      live = false;
      abort.abort();
    };
  }, [key, scope, enabled, service, sessionGeneration]);
  return enabled &&
    result.scope === scope &&
    result.key === key &&
    result.generation === sessionGeneration
    ? result.photos
    : {};
}
