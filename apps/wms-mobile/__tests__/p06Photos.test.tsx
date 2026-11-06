import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import {
  p06ImageUri,
  p06PrimaryImage,
  type P06CatalogService,
} from '../src/services/wms/p06Catalog';
import {
  p06MockImage,
  p06MockHarness,
  mockId,
} from '../src/web/p06ReviewFixtures';
import { useP06CataloguePhotos } from '../src/features/lookup/useP06CataloguePhotos';

describe('P06 verified public product images', () => {
  const image = {
    ...p06MockImage(),
    full_url: 'https://images.bigk.click/Handtool/D210108.jpg?v=r2-20260906',
  };
  it('uses the exact verified public CDN URI without changing UNKNOWN metadata or inventing a thumbnail', () => {
    expect(p06ImageUri(image)).toBe(image.full_url);
    expect(image.access).toBe('UNKNOWN');
    expect(image.thumbnail_url).toBeNull();
    expect(p06ImageUri(image, [])).toBeUndefined();
    expect(p06ImageUri({ ...image, access: 'UNAVAILABLE' })).toBeUndefined();
  });
  it.each([
    'https://images.bigk.click.evil.invalid/Handtool/D210108.jpg',
    'https://user:pass@images.bigk.click/Handtool/D210108.jpg',
    'http://images.bigk.click/Handtool/D210108.jpg',
    'https://images.bigk.click/Handtool/D210108.jpg?token=secret',
    'https://images.bigk.click/Handtool/D210108.jpg#fragment',
    'https://images.bigk.click/Handtool/D210108.svg',
    'https://unapproved.example.invalid/product.jpg',
  ])(
    'unavailable/unapproved/credential-bearing image remains a placeholder: %s',
    uri => {
      expect(p06ImageUri({ ...image, full_url: uri })).toBeUndefined();
    },
  );
  it('hero and list select the authored primary displayable image rather than the first unrelated thumbnail', () => {
    const second = { ...image, image_id: mockId(302), is_primary: true };
    expect(p06PrimaryImage([{ ...image, is_primary: false }, second])).toBe(
      second,
    );
    expect(p06PrimaryImage([{ ...second, access: 'UNAVAILABLE' }, image])).toBe(
      image,
    );
  });
  it('gallery enrichment has at most4 active reads and suppresses a late result after scope changes', async () => {
    const h = p06MockHarness(),
      calls: { signal?: AbortSignal; resolve: (v: any) => void }[] = [];
    const service = {
      ...h.service,
      gallery: jest.fn(
        (_context: any, _id: string, options: any) =>
          new Promise<any>(resolve =>
            calls.push({ signal: options.signal, resolve }),
          ),
      ),
    } as P06CatalogService;
    let observed: Record<string, readonly unknown[]> = {};
    // Keep the list identity stable; a real list response is immutable between reads.
    const cards = h.cards.slice(0, 9);
    function StableProbe({ scope }: { scope: string }) {
      observed = useP06CataloguePhotos(service, h.context, scope, cards, true);
      return null;
    }
    let tree!: Renderer.ReactTestRenderer;
    await act(async () => {
      tree = Renderer.create(<StableProbe scope="old-family" />);
    });
    expect(calls).toHaveLength(4);
    await act(async () => {
      tree.update(<StableProbe scope="new-family" />);
    });
    expect(calls.slice(0, 4).every(call => call.signal?.aborted)).toBe(true);
    expect(calls).toHaveLength(8);
    await act(async () => {
      calls[0].resolve({ data: [image] });
    });
    expect(observed).toEqual({});
    await act(async () => {
      calls[4].resolve({ data: [image] });
    });
    expect(observed[cards[0].sku_id]).toEqual([image]);
    expect(calls).toHaveLength(9);
    await act(() => tree.unmount());
    expect(calls.slice(4).every(call => call.signal?.aborted)).toBe(true);
  });
});
