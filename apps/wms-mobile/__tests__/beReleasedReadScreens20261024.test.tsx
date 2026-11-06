import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { P13WebQueueScreen } from '../src/features/notifications/P13WebQueueScreen';
import { P13NotificationFrame } from '../src/features/notifications/P13NotificationFrame';
import { P13QueueSourceTabs, P13WebQueueDetail } from '../src/features/notifications/P13WebQueuePresentation';
import { P18BoxesScreen } from '../src/features/warehouse/P18BoxesScreen';
import { parseBoxes, boxQuery } from '../src/services/wms/p18Boxes';
import { parseWebQueue, webQueueQuery } from '../src/services/wms/p13WebQueue';
import { Button } from '../src/ui/Button';
import { Page } from '../src/ui/Page';
import { AppError } from '../src/errors/AppError';
import { setSession, clearSession } from '../src/auth/session';
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { resetHardwareBackForTest } from '../src/app/useHardwareBack';
import {
  boxBody,
  queueBody,
  queueRow,
  scope,
  user,
  id,
  actor,
  session,
  warehouse,
} from './fixtures/beReleasedReads20261024';
import type { BeReleasedReads } from '../src/services/wms/beReleasedReads';
import type { WebQueueQuery } from '../src/services/wms/p13WebQueue';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  setSession({
    accessToken: 'local-ui',
    userId: actor,
    authSessionId: session,
    activeWarehouseId: warehouse,
  });
  resetHardwareBackForTest();
});
const mounted: Renderer.ReactTestRenderer[] = [];
afterEach(async () => {
  await act(async () => {
    mounted.splice(0).forEach(t => t.unmount());
  });
  clearSession();
  resetHardwareBackForTest();
});
function service() {
  const box = parseBoxes(boxBody(), scope(), boxQuery()).items[0];
  return {
    scopeKey: () => 'local-scope',
    webQueue: jest.fn(async (input: Partial<WebQueueQuery> = {}) =>
      parseWebQueue(queueBody(input), scope(), webQueueQuery(input)),
    ),
    boxes: jest.fn(async () => parseBoxes(boxBody(), scope(), boxQuery())),
    box: jest.fn(async () => box),
  };
}
const context = { user: user() };
const button = (tree: Renderer.ReactTestRenderer, label: string) =>
  tree.root.findAllByType(Button).find(n => n.props.label === label)!;
const text = (tree: Renderer.ReactTestRenderer) =>
  JSON.stringify(tree.toJSON());
async function mount(node: React.ReactElement) {
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(<AppProviders>{node}</AppProviders>);
  });
  mounted.push(tree);
  await act(async () => {
    await flush();
  });
  return tree;
}
test('P13 opens only its validated canonical target; timeline preserves missing review and Back retains the list', async () => {
  const s = service(),
    open = jest.fn(),
    back = jest.fn();
  const tree = await mount(
    <P13WebQueueScreen
      context={context}
      service={s as BeReleasedReads}
      onBack={back}
      onOpenDocument={open}
    />,
  );
  expect(text(tree)).toContain('PN-MOCK-10');
  const row = tree.root
    .findAllByProps({ accessibilityLabel: 'Bàn giao PN-MOCK-10' })
    .find(n => typeof n.props.onPress === 'function')!;
  await act(async () => row.props.onPress());
  expect(text(tree)).toContain('Ghi chú');
  const handoff = tree.root.findByType(P13WebQueueDetail).props.row.handoff;
  expect(handoff.supplied).toBe(true);
  expect(handoff.value.reviewed.supplied).toBe(false);
  expect(handoff.value.reviewed.status).toBe('NOT_RECORDED');
  await act(async () => button(tree, 'Xem chứng từ').props.onPress());
  expect(open).toHaveBeenCalledWith({
    id: id(10),
    kind: 'inbound',
    warehouseId: warehouse,
  });
  await act(async () => tree.root.findByType(P13NotificationFrame).props.onBack());
  expect(text(tree)).toContain('PN-MOCK-10');
  expect(back).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});
test('P13 cursor context error exposes a start-cursor retry and keeps applied filters', async () => {
  const s = service(),
    open = jest.fn();
  const complete = parseWebQueue(
    queueBody({}, [queueRow('INBOUND', 11), queueRow('INBOUND', 10)]),
    scope(), webQueueQuery(),
  );
  s.webQueue.mockResolvedValue({ ...complete, items: complete.items.slice(0, 1), nextCursor: 'opaque' });
  const tree = await mount(
    <P13WebQueueScreen
      context={context}
      service={s as BeReleasedReads}
      onBack={() => {}}
      onOpenDocument={open}
    />,
  );
  await act(async () => {
    tree.root.findByType(P13QueueSourceTabs).props.onSelect('INBOUND');
    await flush();
  });
  s.webQueue.mockRejectedValueOnce(
    new AppError({
      kind: 'http',
      status: 409,
      code: 'DOCUMENTS_CURSOR_CONTEXT_CHANGED',
      message: 'Cursor đổi phạm vi',
    }),
  );
  await act(async () => {
    button(tree, 'Tải thêm chứng từ').props.onPress();
    await flush();
  });
  expect(text(tree)).toContain('Đọc lại từ đầu, giữ bộ lọc');
  expect(s.webQueue.mock.calls.at(-1)?.[0]).toMatchObject({ cursor: 'opaque', source: 'INBOUND' });
  await act(async () => {
    button(tree, 'Đọc lại từ đầu, giữ bộ lọc').props.onPress();
    await flush();
  });
  expect(s.webQueue.mock.calls.at(-1)?.[0]).toMatchObject({
    cursor: 'start',
    source: 'INBOUND',
    web_queue: 'WAITING_WEB_POST',
  });
  await act(async () => tree.unmount());
});
test('P18 list/detail never offers stock mutation; Back during GET does not publish a late detail', async () => {
  const s = service();
  let resolve!: (value: unknown) => void;
  s.box.mockImplementationOnce(
    () =>
      new Promise(r => {
        resolve = r;
      }) as never,
  );
  const tree = await mount(
    <P18BoxesScreen
      context={context}
      service={s as BeReleasedReads}
      onBack={() => {}}
    />,
  );
  expect(text(tree)).toContain('BOX-TEST-70');
  const row = tree.root
    .findAllByProps({ accessibilityLabel: 'Chi tiết BOX BOX-TEST-70' })
    .find(n => typeof n.props.onPress === 'function')!;
  await act(async () => row.props.onPress());
  expect(s.box).toHaveBeenCalledTimes(1);
  await act(async () => tree.root.findByType(Page).props.onBack());
  await act(async () => {
    resolve(parseBoxes(boxBody(), scope(), boxQuery()).items[0]);
    await flush();
  });
  expect(tree.root.findByType(Page).props.title).toBe('BOX trong kho');
  expect(
    tree.root
      .findAllByType(Button)
      .some(n => /Xuất|Ghi|Chuyển kho/.test(n.props.label)),
  ).toBe(false);
  await act(async () => tree.unmount());
});
test('P18 detail shows real contents and unavailable availability separately', async () => {
  const s = service(),
    tree = await mount(
      <P18BoxesScreen
        context={context}
        service={s as BeReleasedReads}
        onBack={() => {}}
      />,
    );
  const row = tree.root
    .findAllByProps({ accessibilityLabel: 'Chi tiết BOX BOX-TEST-70' })
    .find(n => typeof n.props.onPress === 'function')!;
  await act(async () => {
    row.props.onPress();
    await flush();
  });
  expect(text(tree)).toContain('Số lượng trong BOX');
  expect(text(tree)).toContain('Chưa có nguồn số lượng có thể xuất');
  expect(text(tree)).not.toContain('available_qty');
  await act(async () => tree.unmount());
});
