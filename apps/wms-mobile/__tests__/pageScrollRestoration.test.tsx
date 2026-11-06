import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { ScrollView, Text } from 'react-native';
import { Page } from '../src/ui/Page';
import { AppProviders } from '../src/app/App';

let tree: Renderer.ReactTestRenderer | undefined;
let raf: jest.SpyInstance;
beforeEach(() => {
  raf = jest
    .spyOn(global, 'requestAnimationFrame')
    .mockImplementation(callback => {
      callback(0);
      return 1;
    });
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  raf.mockRestore();
});
const scroll = (y: number) =>
  tree!.root
    .findByType(ScrollView)
    .props.onScroll({ nativeEvent: { contentOffset: { y } } });
const resize = () =>
  tree!.root.findByType(ScrollView).props.onContentSizeChange(390, 2000);

test('TC10 zero initial position does not suppress manual scroll or restore top on append', async () => {
  const changed = jest.fn();
  const view = (rows: number) => (
    <AppProviders>
      <Page initialScrollY={0} onScrollPositionChange={changed}>
        <Text>{'rows:' + rows}</Text>
      </Page>
    </AppProviders>
  );
  await act(async () => {
    tree = Renderer.create(view(10));
  });
  const initialCalls = raf.mock.calls.length;
  await act(async () => scroll(300));
  expect(changed).toHaveBeenLastCalledWith(300);
  await act(async () => tree!.update(view(20)));
  await act(async () => resize());
  expect(raf.mock.calls.length).toBe(initialCalls);
});

test('TC10 reflecting user position back into initialScrollY is not a new restore command', async () => {
  const changed = jest.fn();
  function Echo() {
    const [y, setY] = React.useState(0);
    return (
      <Page
        initialScrollY={y}
        onScrollPositionChange={next => {
          changed(next);
          setY(next);
        }}
      >
        <Text>list</Text>
      </Page>
    );
  }
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <Echo />
      </AppProviders>,
    );
  });
  const before = raf.mock.calls.length;
  await act(async () => scroll(200));
  await act(async () => scroll(400));
  expect(changed.mock.calls.map(c => c[0])).toEqual([200, 400]);
  expect(raf.mock.calls.length).toBe(before);
});

test('TC10 genuine positive Back target still retries content clamping and then stops', async () => {
  const changed = jest.fn();
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <Page initialScrollY={500} onScrollPositionChange={changed}>
          <Text>list</Text>
        </Page>
      </AppProviders>,
    );
  });
  await act(async () => scroll(0));
  expect(changed).not.toHaveBeenCalled();
  const before = raf.mock.calls.length;
  await act(async () => resize());
  expect(raf.mock.calls.length).toBeGreaterThan(before);
  await act(async () => scroll(500));
  expect(changed).toHaveBeenLastCalledWith(500);
  const acknowledged = raf.mock.calls.length;
  await act(async () => resize());
  expect(raf.mock.calls.length).toBe(acknowledged);
});

test('TC10 an explicit reset to zero does not wait forever for a redundant zero event', async () => {
  const changed = jest.fn();
  const view = (initial: number) => (
    <AppProviders>
      <Page initialScrollY={initial} onScrollPositionChange={changed}>
        <Text>list</Text>
      </Page>
    </AppProviders>
  );
  await act(async () => {
    tree = Renderer.create(view(500));
  });
  await act(async () => scroll(500));
  const before = raf.mock.calls.length;
  await act(async () => tree!.update(view(0)));
  expect(raf.mock.calls.length).toBeGreaterThan(before);
  await act(async () => scroll(50));
  expect(changed).toHaveBeenLastCalledWith(50);
});
