import {
  APP_FRAME_HEIGHT,
  APP_FRAME_WIDTH,
  fixedAppFrameMetrics,
  innerAppUrl,
  mountFixedAppFrame,
} from '../src/web/fixedAppFrame';

test('width-constrained viewport contains one 494x950 app canvas without reflow', () => {
  expect(fixedAppFrameMetrics(375, 808)).toEqual({
    scale: 375 / 494,
    renderedWidth: 375,
    renderedHeight: (950 * 375) / 494,
  });
});

test('height-constrained viewport uses height and desktop never enlarges the canvas', () => {
  const compact = fixedAppFrameMetrics(900, 760);
  expect(compact.scale).toBe(0.8);
  expect(compact.renderedWidth).toBeCloseTo(395.2);
  expect(compact.renderedHeight).toBe(760);
  expect(fixedAppFrameMetrics(1920, 1080)).toEqual({
    scale: 1,
    renderedWidth: APP_FRAME_WIDTH,
    renderedHeight: APP_FRAME_HEIGHT,
  });
});

test('inner URL preserves route/query and replaces only the private frame marker', () => {
  expect(
    innerAppUrl('http://127.0.0.1:5176/?mode=dev&hn-frame=old#p02/history'),
  ).toBe('http://127.0.0.1:5176/?mode=dev&hn-frame=1#p02/history');
});

test('a new web build changes only the iframe cache identity while preserving the same origin and route', () => {
  const first=new URL(innerAppUrl('https://appqr.lptech.info.vn/?mode=test&hn-build=old#p01','index-build-a.js'));
  const next=new URL(innerAppUrl('https://appqr.lptech.info.vn/?mode=test&hn-build=old#p01','index-build-b.js'));
  expect(first.origin).toBe('https://appqr.lptech.info.vn');
  expect(first.searchParams.get('hn-frame')).toBe('1');
  expect(first.searchParams.get('hn-build')).toBe('index-build-a.js');
  expect(next.searchParams.get('hn-build')).toBe('index-build-b.js');
  expect(next.searchParams.get('mode')).toBe('test');
  expect(next.hash).toBe('#p01');
  expect(first.toString()).not.toBe(next.toString());
});

test('host mounts exactly one same-origin fixed iframe and updates only geometry', () => {
  const children: FakeFrame[] = [];
  const host = {
    style: {} as Record<string, string>,
    replaceChildren(frame: FakeFrame) {
      children.splice(0, children.length, frame);
    },
  };
  type FakeFrame = {
    src: string;
    title: string;
    style: Record<string, string>;
    setAttribute(name: string, value: string): void;
    attributes: Record<string, string>;
  };
  const createFrame = (): FakeFrame => ({
    src: '',
    title: '',
    style: {},
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  });

  const mounted = mountFixedAppFrame(
    host,
    createFrame,
    'http://127.0.0.1:5176/#p02/history',
    375,
    808,
    'index-tested.js',
  );
  expect(children).toHaveLength(1);
  expect(children[0].src).toBe('http://127.0.0.1:5176/?hn-frame=1&hn-build=index-tested.js#p02/history');
  expect(children[0].style.width).toBe('494px');
  expect(children[0].style.height).toBe('950px');
  expect(children[0].style.transform).toBe(`scale(${375 / 494})`);
  expect(host.style.width).toBe('375px');

  mounted.update(900, 760);
  expect(children).toHaveLength(1);
  expect(children[0].style.transform).toBe('scale(0.8)');
  expect(host.style.height).toBe('760px');
});
