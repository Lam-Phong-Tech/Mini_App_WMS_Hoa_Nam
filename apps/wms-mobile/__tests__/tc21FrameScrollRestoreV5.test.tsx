import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { P13NotificationFrame } from '../src/features/notifications/P13NotificationFrame';
import { P13WebQueueScreen } from '../src/features/notifications/P13WebQueueScreen';
import { P13WebQueueRow } from '../src/features/notifications/P13WebQueuePresentation';
import { parseWebQueue, webQueueQuery } from '../src/services/wms/p13WebQueue';
import type { BeReleasedReads } from '../src/services/wms/beReleasedReads';
import { queueBody, scope, user, actor, session, warehouse } from './fixtures/beReleasedReads20261024';
import { clearSession, setSession } from '../src/auth/session';
import { createMemoryBackend, createStorage, setAppStorageForTesting } from '../src/storage/storage';

const mockScrollTo = jest.fn();
const mockDomPosition = { top: 0 };
jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  const R = jest.requireActual('react');
  const exported = Object.create(rn);
  Object.defineProperty(exported, 'ScrollView', { value: R.forwardRef((props: object, ref: unknown) => {
    R.useImperativeHandle(ref, () => ({ scrollTo: mockScrollTo, getScrollableNode: () => ({ scrollTop: mockDomPosition.top }) }));
    return R.createElement(rn.View, props);
  }) });
  return exported;
});
let tree: Renderer.ReactTestRenderer;
let frames: FrameRequestCallback[];
let raf: jest.SpyInstance;
beforeEach(() => {
  mockScrollTo.mockClear(); frames = [];
  mockDomPosition.top = 0;
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  setSession({accessToken:'offline',userId:actor,authSessionId:session,activeWarehouseId:warehouse});
  raf = jest.spyOn(global, 'requestAnimationFrame').mockImplementation(fn => { frames.push(fn); return frames.length; });
});
afterEach(async () => { if (tree) await act(() => tree.unmount()); raf.mockRestore(); clearSession(); });
const view = (key: string, y: number, onScroll: (y: number) => void) => <AppProviders><P13NotificationFrame detail={key==='detail'} restoreKey={key} initialScrollY={y} onScrollPositionChange={onScroll} onBack={() => {}} busy={false}><></></P13NotificationFrame></AppProviders>;

it('an old panel animation cannot reset the restored list, and layout zero is not saved as user scroll', async () => {
  const save = jest.fn();
  await act(() => { tree = Renderer.create(view('list',92,save)); });
  const oldListScroll = tree.root.findAllByProps({testID:'P13.scroll'}).find(n => typeof n.props.onScroll==='function')!.props.onScroll;
  await act(() => tree.update(view('detail',0,save)));
  await act(() => oldListScroll({nativeEvent:{contentOffset:{y:0}}}));
  expect(save).not.toHaveBeenCalled();
  await act(() => tree.update(view('list',92,save)));
  await act(() => oldListScroll({nativeEvent:{contentOffset:{y:0}}}));
  expect(save).not.toHaveBeenCalled();
  await act(() => { frames.splice(0).forEach(fn => fn(0)); });
  expect(mockScrollTo.mock.calls.map(call => call[0])).toEqual([{y:92,animated:false}]);
  const scroll = tree.root.findAllByProps({testID:'P13.scroll'}).find(n => typeof n.props.onScroll==='function')!;
  await act(() => scroll.props.onScroll({nativeEvent:{contentOffset:{y:0}}}));
  expect(save).not.toHaveBeenCalled();
  await act(() => scroll.props.onScroll({nativeEvent:{contentOffset:{y:92}}}));
  expect(save).toHaveBeenCalledWith(92);
});

it('ordinary scroll and rerender do not restart restoration', async () => {
  const save = jest.fn();
  await act(() => { tree = Renderer.create(view('list',0,save)); });
  await act(() => { frames.splice(0).forEach(fn => fn(0)); });
  const scroll = tree.root.findAllByProps({testID:'P13.scroll'}).find(n => typeof n.props.onScroll==='function')!;
  await act(() => scroll.props.onScroll({nativeEvent:{contentOffset:{y:120}}}));
  await act(() => tree.update(view('list',120,save)));
  expect(save).toHaveBeenCalledWith(120);
  expect(frames).toHaveLength(0);
});

it('queue snapshots the visible position before detail even if no scroll event has arrived', async () => {
  const page = parseWebQueue(queueBody(), scope(), webQueueQuery());
  const service = {scopeKey:()=> 'snapshot-owner',webQueue:jest.fn(async()=>page)} as unknown as BeReleasedReads;
  await act(async () => { tree = Renderer.create(<AppProviders><P13WebQueueScreen context={{user:user()}} service={service} onBack={()=>{}} onOpenDocument={()=>{}} /></AppProviders>); });
  mockDomPosition.top = 92; // The browser moved; its delayed onScroll has not run.
  await act(() => tree.root.findAllByType(P13WebQueueRow)[0].props.onPress());
  mockDomPosition.top = 0;
  await act(() => tree.root.findByType(P13NotificationFrame).props.onBack());
  expect(tree.root.findByType(P13NotificationFrame).props.initialScrollY).toBe(92);
});
