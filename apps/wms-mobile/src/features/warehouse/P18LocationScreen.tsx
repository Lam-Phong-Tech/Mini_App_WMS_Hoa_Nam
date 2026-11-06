import {HN_UI} from '../../theme/uiKitV3';
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHardwareBack } from '../../app/useHardwareBack';
import type { Context } from '../documents/p12/service';
import {
  createP18LocationService,
  type ComponentLocationTarget,
  type P18LocationService,
} from '../../services/wms/p18ComponentLocation';
import { useBeRead } from '../releasedReads/useBeRead';
import { fieldText } from '../releasedReads/ReadValue';
import { P18ReadableText, P18Value } from '../warranty/P18ReadableText';
import { P04Icon } from '../inbound/P04Icon';
import { Text } from '../../ui/Text';
import {SCANNER_COLORS} from '../../ui/ScannerPalette';
import {
  formatDocumentTimestamp,
  parseDocumentTimestamp,
} from '../../services/wms/documentTimestamps';

const s = StyleSheet.create({
  root: { flex: 1, minHeight: 0, minWidth: 0, backgroundColor: HN_UI.canvas },
  header: {
    minHeight: 76,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: HN_UI.shell,
  },
  back: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: HN_UI.onBrand,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
    flex: 1,
  },
  body: { padding: 20, gap: 14, flexGrow: 1 },
  card: {
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 14,
    padding: 16,
    gap: 8,
    backgroundColor: HN_UI.surface,
    minWidth: 0,
  },
  heading: {
    color: HN_UI.textPrimary,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '700',
  },
  hint: { color: HN_UI.textSecondary, fontSize: 14, lineHeight: 21 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minWidth: 0 },
  tile: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: HN_UI.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  location: {
    fontSize: 22,
    lineHeight: 29,
    color: HN_UI.textPrimary,
    fontWeight: '700',
  },
  disclosure: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footer: { paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
  primary: {
    minHeight: 56,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCANNER_COLORS.primary,
    paddingHorizontal: 16,
  },
  primaryText: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
    color: HN_UI.onBrand,
  },
  retry: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
export function P18LocationScreen(props: {
  context: Context;
  target: ComponentLocationTarget;
  onBack(): void;
  service?: P18LocationService;
}) {
  return <LocationRead key={JSON.stringify(props.target)} {...props} />;
}
function LocationRead({
  context,
  target,
  onBack,
  service: injected,
}: {
  context: Context;
  target: ComponentLocationTarget;
  onBack(): void;
  service?: P18LocationService;
}) {
  const current = useRef(context);
  current.current = context;
  const service = useMemo(
    () => injected ?? createP18LocationService(() => current.current),
    [injected],
  );
  const read = useBeRead(service, signal => service.read(target, signal));
  const [expanded, setExpanded] = useState(false),
    [closed, setClosed] = useState(false);
  const back = () => {
    read.cancel();
    setClosed(true);
    onBack();
  };
  useHardwareBack(() => {
    back();
    return true;
  });
  const data = closed || read.busy ? undefined : read.data,
    loc = data?.location;
  return (
    <SafeAreaView
      testID="P18.S04"
      style={s.root}
      edges={['top', 'left', 'right']}
    >
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại tra cứu"
          onPress={back}
          style={s.back}
        >
          <P04Icon name="arrow-left" color={HN_UI.onBrand} size={24} />
        </Pressable>
        <Text style={s.title}>Vị trí linh kiện kho</Text>
      </View>
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={s.body}
      >
        {data ? (
          <>
            <View style={s.card}>
              <Text style={s.heading}>Thông tin linh kiện</Text>
              <P18Value
                inline
                label={
                  target.kind === 'BOX' ? 'Mã BOX linh kiện' : 'Mã linh kiện'
                }
                value={fieldText(data.physicalCode)}
              />
              <P18Value inline label="SKU" value={fieldText(data.skuCode)} />
              <P18Value
                inline
                label="Tên linh kiện"
                value={fieldText(data.name)}
              />
              <P18Value
                inline
                label="Đơn vị tính"
                value={fieldText(data.unit)}
              />
                {data.skuStatus&&<><P18Value inline label="Trạng thái SKU" value={data.skuStatus.supplied?(({ACTIVE:'Đang hoạt động',INACTIVE:'Ngừng hoạt động'} as Record<string,string>)[data.skuStatus.value]??'Chưa có nhãn trạng thái từ nguồn'):fieldText(data.skuStatus)}/><Text style={s.hint}>Thông tin linh kiện không xác nhận điều kiện xuất.</Text></>}
            </View>
            <View style={s.card}>
              <Text style={s.heading}>Vị trí hiện tại</Text>
              <View style={s.row}>
                <View style={s.tile}>
                  <P04Icon name="pin" color={HN_UI.textSecondary} size={26} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.hint}>
                    {loc?.supplied
                      ? 'Khay đã xác nhận từ phiếu xếp khay'
                      : 'Trạng thái nguồn vị trí'}
                  </Text>
                  <P18ReadableText
                    label="Vị trí hiện tại"
                    value={
                      loc?.supplied
                        ? loc.value.label
                        : loc
                        ? fieldText(loc)
                        : 'Đang đọc vị trí…'
                    }
                    style={s.location}
                  />
                </View>
              </View>
              <Text style={s.hint}>Chưa có sơ đồ và sức chứa đã xác minh.</Text>
            </View>
            <View style={s.card}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Thông tin lưu trữ"
                accessibilityState={{ expanded }}
                style={s.disclosure}
                onPress={() => setExpanded(v => !v)}
              >
                <P04Icon
                  name={expanded ? 'chevron-down' : 'chevron-right'}
                  color={HN_UI.textPrimary}
                  size={18}
                />
                <Text style={s.heading}>Thông tin lưu trữ</Text>
              </Pressable>
              {expanded ? (
                <>
                  <P18Value label="Định danh hiện vật" value={data.target.id} />
                  <Text style={s.hint}>
                    Master linh kiện theo danh mục hiện tại. Đăng ký kho không
                    thay thế bằng chứng vị trí vật lý.
                  </Text>
                  {loc?.supplied ? (
                    <>
                      <P18Value
                        label="Thời điểm xếp khay được xác nhận (+07:00)"
                        value={formatDocumentTimestamp(
                          parseDocumentTimestamp(loc.value.effectiveAt),
                          { seconds: true },
                        )}
                      />
                      <P18Value
                        label="Thời điểm quan sát nguồn (+07:00)"
                        value={formatDocumentTimestamp(
                          parseDocumentTimestamp(loc.value.observedAt),
                          { seconds: true },
                        )}
                      />
                      <P18Value
                        label="Phiên bản placement / BOX / TRAY"
                        value={`${loc.value.placementVersion} / ${loc.value.boxVersion} / ${loc.value.locationVersion}`}
                      />
                      <P18Value
                        label="Mã sự kiện nguồn"
                        value={loc.value.eventId}
                      />
                      {loc.value.parentBoxId ? (
                        <P18Value
                          label="BOX chứa ITEM đã xác nhận"
                          value={loc.value.parentBoxId}
                        />
                      ) : null}
                    </>
                  ) : null}
                  <P18Value
                    label="Mã đối chiếu yêu cầu"
                    value={data.requestId}
                  />
                </>
              ) : null}
            </View>
          </>
        ) : read.busy ? (
          <Text accessibilityLiveRegion="polite" style={s.hint}>
            Đang đọc vị trí linh kiện…
          </Text>
        ) : read.error ? (
          <View style={s.card}>
            <Text tone="danger" accessibilityLiveRegion="polite">
              {read.error.message}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đọc lại vị trí"
              style={s.retry}
              onPress={() =>
                void read.run(signal => service.read(target, signal))
              }
            >
              <Text style={s.heading}>Đọc lại vị trí</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      <View style={s.footer}>
        <Text style={s.hint}>
          Chỉ xem thông tin. Chức năng thay đổi vị trí chưa khả dụng.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Về tra cứu"
          onPress={back}
          style={s.primary}
        >
          <Text style={s.primaryText}>Về tra cứu</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
