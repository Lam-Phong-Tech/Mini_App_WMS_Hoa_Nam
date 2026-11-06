import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Image } from 'react-native';
import { useProductPhotos } from '../src/features/documents/p12/useProductPhotos';
import { ProductPhoto } from '../src/features/documents/p12/ProductPhoto';
import { p06MockImage, mockId } from '../src/web/p06ReviewFixtures';
import type { P06CatalogService } from '../src/services/wms/p06Catalog';

const image = () => ({
  ...p06MockImage(),
  full_url: 'https://images.bigk.click/Handtool/D210108.jpg?v=r2-20260906',
});
test('catalogue thumbnails are bounded, keyed by actual SKU and reject late old-scope responses', async () => {
  const pending: {
    id: string;
    signal: AbortSignal;
    resolve: (v: any) => void;
  }[] = [];
  const service = {
    context: jest.fn(async () => ({ data: {} })),
    gallery: jest.fn(
      (_context: unknown, id: string, opts: any) =>
        new Promise(resolve =>
          pending.push({ id, signal: opts.signal, resolve }),
        ),
    ),
  } as unknown as P06CatalogService;
  const ids = Array.from({ length: 9 }, (_, i) => mockId(i + 1));
  let observed: Record<string, string> = {};
  function Probe({ scope }: { scope: string }) {
    observed = useProductPhotos(
      [...ids, ids[0], null, 'unverified'],
      scope,
      true,
      service,
    );
    return null;
  }
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(<Probe scope="first-document-session" />);
  });
  expect(pending).toHaveLength(4);
  expect(new Set(pending.map(p => p.id)).size).toBe(4);
  await act(async () => {
    tree.update(<Probe scope="other-document-session" />);
  });
  expect(pending.slice(0, 4).every(p => p.signal.aborted)).toBe(true);
  expect(pending).toHaveLength(8);
  await act(async () => {
    pending[0].resolve({ data: [image()] });
  });
  expect(observed).toEqual({});
  await act(async () => {
    pending[4].resolve({ data: [image()] });
  });
  expect(observed).toEqual({ [ids[0]]: image().full_url });
  expect(pending).toHaveLength(9);
  await act(async () => {
    tree.unmount();
  });
  expect(pending.slice(4).every(p => p.signal.aborted)).toBe(true);
});

test('gallery failure, unapproved origin and catalogue gate failure leave imagery empty', async () => {
  const service = {
    context: jest.fn(async () => ({ data: {} })),
    gallery: jest.fn(async (_c: unknown, id: string) => {
      if (id === mockId(1)) throw new Error('forbidden');
      return {
        data: [{ ...image(), full_url: 'https://unapproved.invalid/demo.jpg' }],
      };
    }),
  } as unknown as P06CatalogService;
  let observed: Record<string, string> = {};
  function Probe({ scope }: { scope: string }) {
    observed = useProductPhotos([mockId(1), mockId(2)], scope, true, service);
    return null;
  }
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(<Probe scope="one" />);
  });
  expect(observed).toEqual({});
  (service.context as jest.Mock).mockRejectedValueOnce(new Error('gate'));
  await act(async () => {
    tree.update(<Probe scope="two" />);
  });
  expect(observed).toEqual({});
  expect(service.gallery).toHaveBeenCalledTimes(2);
  await act(async () => {
    tree.unmount();
  });
});

test('image download error retains a placeholder and a new URI can recover without auth headers', async () => {
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <ProductPhoto uri={image().full_url} style={{}} size={30} />,
    );
  });
  expect(tree.root.findByType(Image).props.source).toEqual({
    uri: image().full_url,
  });
  expect(tree.root.findByType(Image).props.headers).toBeUndefined();
  await act(async () => {
    tree.root.findByType(Image).props.onError();
  });
  expect(tree.root.findAllByType(Image)).toHaveLength(0);
  await act(async () => {
    tree.update(
      <ProductPhoto uri={image().full_url + '2'} style={{}} size={30} />,
    );
  });
  expect(tree.root.findAllByType(Image)).toHaveLength(1);
  await act(async () => {
    tree.unmount();
  });
});
