import React from 'react';
import Renderer from 'react-test-renderer';
import {
  AppState,
  Text as NativeText,
  type AppStateStatus,
} from 'react-native';
import { AppProviders } from '../src/app/App';
import {
  VietnamClock,
  formatShiftElapsed,
  vietnamTime,
} from '../src/features/home/VietnamClock';
import { recordServerTime, resetServerClock } from '../src/auth/serverClock';

describe('P02 running Vietnam clock', () => {
  let tree: Renderer.ReactTestRenderer | undefined;
  const originalState = Object.getOwnPropertyDescriptor(
    AppState,
    'currentState',
  )!;
  beforeEach(() => {
    jest.useFakeTimers({
      doNotFake: ['queueMicrotask', 'setImmediate', 'nextTick'],
    });
    Object.defineProperty(AppState, 'currentState', {
      value: 'active',
      writable: true,
      configurable: true,
    });
    jest.setSystemTime(new Date('2026-10-08T02:03:04.250Z'));
    resetServerClock();
    jest.clearAllMocks();
  });
  afterEach(async () => {
    if (tree) await Renderer.act(async () => tree!.unmount());
    tree = undefined;
    jest.restoreAllMocks();
    Object.defineProperty(AppState, 'currentState', originalState);
    jest.useRealTimers();
    resetServerClock();
  });
  const clock = () =>
    tree!.root
      .findAllByType(NativeText)
      .find(node => node.props.testID === 'hn-home-live-clock')!;
  const renderClock = async () => {
    await Renderer.act(async () => {
      tree = Renderer.create(
        <AppProviders>
          <VietnamClock confirmedStartedAt="2026-10-08T02:00:00Z" />
        </AppProviders>,
      );
    });
  };

  it('shows current Vietnam time without replacing the confirmed START receipt', async () => {
    await renderClock();
    expect(clock().props.children).toBe('09:03:04');
    expect(clock().props.accessibilityHint).toContain('09:00:00');
    expect(clock().props.accessibilityLabel).toContain(
      'Giờ Việt Nam hiện tại 09:03:04',
    );
    await Renderer.act(async () => jest.advanceTimersByTime(2750));
    expect(clock().props.children).toBe('09:03:07');
    expect(clock().props.accessibilityHint).toContain('09:00:00');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it('uses existing server time correction without polling the backend', async () => {
    recordServerTime('2026-10-08T05:10:11.250Z');
    await renderClock();
    expect(clock().props.children).toBe('12:10:11');
    await Renderer.act(async () => jest.advanceTimersByTime(1750));
    expect(clock().props.children).toBe('12:10:13');
  });
  it('stops in background, catches up immediately on resume, and cleans up on unmount', async () => {
    let change!: (state: AppStateStatus) => void;
    const remove = jest.fn();
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, listener) => {
        change = state => listener(state);
        return { remove };
      });
    await renderClock();
    await Renderer.act(async () => change('background'));
    expect(jest.getTimerCount()).toBe(0);
    jest.setSystemTime(new Date('2026-10-08T17:00:01Z'));
    await Renderer.act(async () => change('active'));
    expect(clock().props.children).toBe('00:00:01');
    expect(jest.getTimerCount()).toBe(1);
    await Renderer.act(async () => tree!.unmount());
    tree = undefined;
    expect(jest.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it('formats UTC+7, 24-hour time and midnight without depending on device timezone', () => {
    expect(vietnamTime(Date.parse('2026-10-08T16:59:59Z'))).toBe('23:59:59');
    expect(vietnamTime(Date.parse('2026-10-08T17:00:00Z'))).toBe('00:00:00');
  });
  it('does not fabricate a start and clamps negative clock skew to zero', () => {
    expect(formatShiftElapsed(Date.now())).toBe('—');
    expect(
      formatShiftElapsed(
        Date.parse('2026-10-08T01:59:59Z'),
        '2026-10-08T02:00:00Z',
      ),
    ).toBe('00:00:00');
    expect(
      formatShiftElapsed(
        Date.parse('2026-10-10T04:05:06Z'),
        '2026-10-08T02:00:00Z',
      ),
    ).toBe('50:05:06');
  });
});
