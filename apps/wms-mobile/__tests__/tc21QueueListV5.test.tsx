import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { P13WebQueueScreen } from '../src/features/notifications/P13WebQueueScreen';
import { P13NotificationFrame } from '../src/features/notifications/P13NotificationFrame';
import { P13QueueSourceTabs, P13WebQueueRow } from '../src/features/notifications/P13WebQueuePresentation';
import { parseWebQueue, webQueueQuery, type WebQueueQuery } from '../src/services/wms/p13WebQueue';
import type { BeReleasedReads } from '../src/services/wms/beReleasedReads';
import { Button } from '../src/ui/Button';
import { clearSession, setSession } from '../src/auth/session';
import { createMemoryBackend, createStorage, setAppStorageForTesting } from '../src/storage/storage';
import { queueBody, scope, user, actor, session, warehouse } from './fixtures/beReleasedReads20261024';

let tree: Renderer.ReactTestRenderer;
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  setSession({ accessToken: 'offline', userId: actor, authSessionId: session, activeWarehouseId: warehouse });
});
afterEach(async () => { if (tree) await act(() => tree.unmount()); clearSession(); });

it('removes extra header/reload UI, scrolls the source controls and retains scope/Back', async () => {
  const read = jest.fn(async (input: Partial<WebQueueQuery> = {}) => parseWebQueue(queueBody(input), scope(), webQueueQuery(input)));
  const service = { scopeKey: () => 'tc21-offline', webQueue: read } as unknown as BeReleasedReads;
  await act(async () => { tree = Renderer.create(<AppProviders><P13WebQueueScreen context={{user:user()}} service={service} onBack={jest.fn()} onOpenDocument={jest.fn()} /></AppProviders>); });
  expect(tree.root.findByType(P13NotificationFrame).props.headerAction).toBeUndefined();
  expect(tree.root.findByType(P13NotificationFrame).props.dock).toBeUndefined();
  expect(tree.root.findAllByType(Button).some(n => n.props.label === 'Tải lại')).toBe(false);
  await act(async () => { tree.root.findByType(P13QueueSourceTabs).props.onSelect('INBOUND'); });
  expect(read.mock.calls.at(-1)?.[0]).toMatchObject({source:'INBOUND',status:'ALL',cursor:'start',web_queue:'WAITING_WEB_POST'});
  await act(() => tree.root.findByType(P13NotificationFrame).props.onScrollPositionChange(180));
  await act(() => tree.root.findAllByType(P13WebQueueRow)[0].props.onPress());
  await act(() => tree.root.findByType(P13NotificationFrame).props.onBack());
  expect(tree.root.findByType(P13NotificationFrame).props.initialScrollY).toBe(180);
  expect(read).toHaveBeenCalledTimes(2);
});
