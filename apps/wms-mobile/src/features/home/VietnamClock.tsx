import React, { useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { serverNow } from '../../auth/serverClock';
import { Text } from '../../ui/Text';
import { formatVietnamClock } from '../../time/vietnamTime';

export const vietnamTime = (instant: number): string =>
  formatVietnamClock(instant, { seconds: true });

export function formatShiftElapsed(
  now: number,
  confirmedStartedAt?: string,
): string {
  const started = confirmedStartedAt
    ? Date.parse(confirmedStartedAt)
    : Number.NaN;
  if (!Number.isFinite(now) || !Number.isFinite(started)) return '—';
  const total = Math.max(0, Math.floor((now - started) / 1000)),
    hours = Math.floor(total / 3600),
    minutes = Math.floor((total % 3600) / 60),
    seconds = total % 60;
  return [hours, minutes, seconds]
    .map(value => String(value).padStart(2, '0'))
    .join(':');
}

/** Local display only: no polling, writes or changes to the confirmed shift. */
export function VietnamClock({
  style,
  confirmedStartedAt,
}: {
  style?: StyleProp<TextStyle>;
  confirmedStartedAt?: string;
}): React.ReactElement {
  const [instant, setInstant] = useState(serverNow);
  const [availableWidth,setAvailableWidth]=useState(0);
  const clock=vietnamTime(instant);
  const font=StyleSheet.flatten(style);
  const fittedSize=Platform.OS==='web'&&availableWidth>0
    ? Math.min(typeof font?.fontSize==='number'?font.fontSize:22,(availableWidth-1)/Math.max(1,clock.length*0.66))
    : undefined;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active =
      AppState.currentState == null || AppState.currentState === 'active';
    let disposed = false;
    const stop = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const tick = () => {
      stop();
      if (!active || disposed) return;
      const now = serverNow();
      setInstant(now);
      // Re-read wall time rather than adding seconds, including after sleep.
      timer = setTimeout(tick, 1000 - (now % 1000));
    };
    const subscription = AppState.addEventListener('change', state => {
      active = state === 'active';
      if (active) tick();
      else stop();
    });
    tick();
    return () => {
      disposed = true;
      stop();
      subscription?.remove();
    };
  }, []);
  return (
    <Text
      testID="hn-home-live-clock"
      numberOfLines={1}
      style={[style,Platform.OS==='web'&&{flex:1,minWidth:0,...(fittedSize?{fontSize:fittedSize}:{})}]}
      onLayout={Platform.OS==='web'?event=>{const width=event.nativeEvent.layout.width;if(width>0)setAvailableWidth(current=>Math.abs(current-width)>0.1?width:current);}:undefined}
      accessibilityLabel={
        'Giờ Việt Nam hiện tại ' + clock + ' UTC+7.'
      }
      accessibilityHint={
        confirmedStartedAt
          ? 'Ca đã được xác nhận lúc ' +
            vietnamTime(Date.parse(confirmedStartedAt)) +
            '. Thời điểm START đã xác nhận được giữ nguyên.'
          : undefined
      }
    >
      {clock}
    </Text>
  );
}
