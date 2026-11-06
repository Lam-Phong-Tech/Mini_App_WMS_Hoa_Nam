import {HN_UI} from '../../theme/uiKitV3';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Page } from '../../ui/Page';
import { Text } from '../../ui/Text';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { Button } from '../../ui/Button';
import { HnHomeIcon } from '../../ui/HnHomeIcon';
import { HN_OPERATIONS } from '../../ui/hnHomeTokens';
import { useHardwareBack } from '../../app/useHardwareBack';
import type { Context } from '../documents/p12/service';
import {
  createBeReleasedReads,
  type BeReleasedReads,
} from '../../services/wms/beReleasedReads';
import {
  boxQuery,
  type BoxPage,
  type BoxQuery,
  type WarehouseBox,
} from '../../services/wms/p18Boxes';
import { useBeRead } from '../releasedReads/useBeRead';
import { ReadValue } from '../releasedReads/ReadValue';
import { captureSessionScope, isSessionScopeCurrent } from '../../auth/session';
import { P18ReadableText, P18Value } from '../warranty/P18ReadableText';
import { P18LocationScreen } from './P18LocationScreen';
import type { P18LocationService } from '../../services/wms/p18ComponentLocation';

const styles = StyleSheet.create({
  form: { gap: 14, minWidth: 0 },
  card: {
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 12,
    backgroundColor: HN_UI.surface,
    padding: 16,
    gap: 12,
    minWidth: 0,
  },
  row: {
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 12,
    backgroundColor: HN_UI.surface,
    padding: 16,
    marginTop: 12,
    gap: 10,
  },
  title: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  tile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: HN_OPERATIONS.lookup.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    color: HN_UI.textPrimary,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
  },
  hint: { color: HN_UI.textMuted, fontSize: 14, lineHeight: 21 },
  category: {
    color: HN_UI.textLink,
    fontSize: 14,
    lineHeight: 21,
    backgroundColor: HN_UI.canvas,
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  paging: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    marginVertical: 12,
  },
});
const classification: Record<string, string> = {
  UNASSIGNED: 'Chưa gán SKU',
  PRODUCT: 'Sản phẩm',
  COMPONENT_QUANTITY: 'Linh kiện theo số lượng',
  COMPONENT_SERIAL: 'Linh kiện có serial',
};
export function P18BoxesScreen({
  context,
  initialKeyword = '',
  onBack,
  service: injected,
  locationService,
}: {
  context: Context;
  initialKeyword?: string;
  onBack(): void;
  service?: BeReleasedReads;
  locationService?: P18LocationService;
}) {
  const current = useRef(context);
  current.current = context;
  const service = useMemo(
    () => injected ?? createBeReleasedReads(() => current.current),
    [injected],
  );
  const [query, setQuery] = useState<BoxQuery>(() =>
      boxQuery({ keyword: initialKeyword }),
    ),
    [keyword, setKeyword] = useState(initialKeyword),
    [skuType, setSkuType] = useState<BoxQuery['skuType']>('ALL'),
    [selection, setSelection] = useState<{ scope: string; id: string }>(),
    [locationTarget, setLocationTarget] = useState<{scope:string;id:string}>();
  const filterScope = useRef(captureSessionScope());
  const read = useBeRead<BoxPage>(service, signal =>
    service.boxes(
      isSessionScopeCurrent(filterScope.current) ? query : boxQuery(),
      signal,
    ),
  );
  useEffect(() => {
    if (isSessionScopeCurrent(filterScope.current)) return;
    filterScope.current = captureSessionScope();
    setQuery(boxQuery());
    setKeyword('');
    setSkuType('ALL');
    setSelection(undefined);
    setLocationTarget(undefined);
  }, [read.scope]);
  const detail = useBeRead<WarehouseBox | undefined>(
    service,
    async () => undefined,
  );
  const selected =
      selection?.scope === read.scope
        ? read.data?.items.find(item => item.id === selection.id)
        : undefined,
    box = selected && detail.data?.id === selected.id ? detail.data : undefined;
  const listScroll = useRef(0);
  const back = () => {
    if (selection) {
      detail.cancel();
      setSelection(undefined);
    } else {
      read.cancel();
      onBack();
    }
  };
  useHardwareBack(() => {
    back();
    return true;
  });
  function load(input: BoxQuery) {
    if (read.busy) return;
    void read.run(async signal => {
      const q = boxQuery(input),
        page = await service.boxes(q, signal);
      setQuery(q);
      listScroll.current = 0;
      return page;
    });
  }
  if(locationTarget?.scope === read.scope && box?.id === locationTarget.id)
    return <P18LocationScreen context={context} target={{kind:'BOX',id:box.id}} service={locationService} onBack={()=>setLocationTarget(undefined)}/>;
  return (
    <View testID="P18.S04" style={{ flex: 1, minHeight: 0 }}>
      <Page
        key={selected ? 'detail' : 'list'}
        title={selected ? 'Chi tiết BOX' : 'BOX trong kho'}
        headerVariant="brand"
        onBack={back}
        initialScrollY={selected ? 0 : listScroll.current}
        onScrollPositionChange={y => {
          if (!selected) listScroll.current = y;
        }}
      >
        {selected ? (
          <View style={styles.form}>
            <View style={styles.card}>
              <View style={styles.title}>
                <View style={styles.tile}>
                  <HnHomeIcon name="box" size={26} />
                </View>
                <View style={styles.grow}>
                  <P18ReadableText
                    label="Mã BOX"
                    value={box?.code ?? selected.code}
                    style={styles.heading}
                  />
                </View>
              </View>
              <Text style={styles.hint}>
                Thông tin theo BOX trong kho đã xác nhận.
              </Text>
            </View>
            {box ? (
              <>
                <View style={styles.card}>
                  <Text style={styles.heading}>Thông tin BOX</Text>
                  <Text style={styles.category}>
                    {classification[box.classification] ??
                      'Chưa xác minh phân loại'}
                  </Text>
                  <P18Value label="Trạng thái BOX" value={box.status} />
                  <P18Value label="Phiên bản" value={String(box.version)} />
                  {box.sku ? (
                    <>
                      <P18Value label="SKU" value={box.sku.code} />
                      <P18Value label="Tên SKU" value={box.sku.name} />
                      <P18Value label="Trạng thái SKU" value={box.sku.status} />
                      <ReadValue label="Đơn vị" field={box.sku.unit} />
                    </>
                  ) : (
                    <Text>Chưa gán SKU</Text>
                  )}
                  <ReadValue
                    label="Số lượng trong BOX"
                    field={box.containedQty}
                  />
                  {box.sku?.type === 'COMPONENT' ? <Button label="Xem vị trí linh kiện" onPress={()=>setLocationTarget({scope:read.scope,id:box.id})}/> : null}
                </View>
                <View style={styles.card}>
                  <Text style={styles.heading}>Thông tin lưu trữ</Text>
                  {box.location.supplied ? (
                    <P18Value
                      label="Ghi chú vị trí"
                      value={box.location.value}
                      lines={2}
                    />
                  ) : (
                    <ReadValue label="Ghi chú vị trí" field={box.location} />
                  )}
                  <ReadValue label="BOX cha" field={box.parentId} />
                  <ReadValue label="Sức chứa" field={box.capacity} />
                  <ReadValue
                    label="Số lượng có thể xuất"
                    field={box.available}
                  />
                  <Text style={styles.hint}>
                    Số lượng trong BOX không xác nhận điều kiện xuất linh kiện.
                    P19 phải đối chiếu lại BOX và hồ sơ bảo hành.
                  </Text>
                </View>
              </>
            ) : null}
            <Button
              label="Tải lại BOX"
              variant="secondary"
              disabled={detail.busy}
              onPress={() =>
                void detail.run(signal => service.box(selected.id, signal))
              }
            />
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.heading}>Tra cứu BOX</Text>
              <Input
                label="Mã BOX / SKU / tên"
                maxLength={100}
                value={keyword}
                onChangeText={setKeyword}
                editable={!read.busy}
                fieldHeight={48}
                labelStyle={{ color: HN_UI.textPrimary, fontSize: 16, lineHeight: 24 }}
                onSubmitEditing={() =>
                  load({ ...query, keyword, skuType, page: 1 })
                }
              />
              <Select
                label="Loại SKU"
                value={skuType}
                disabled={read.busy}
                options={[
                  { value: 'ALL', label: 'Tất cả' },
                  { value: 'COMPONENT', label: 'Linh kiện' },
                  { value: 'PRODUCT', label: 'Sản phẩm' },
                ]}
                onChange={v => setSkuType(v as BoxQuery['skuType'])}
              />
              <Button
                label="Lọc BOX"
                disabled={read.busy}
                onPress={() => load({ ...query, keyword, skuType, page: 1 })}
              />
            </View>
            {read.data ? (
              <View style={{ gap: 6, marginTop: 14 }}>
                <Text
                  style={{ color: HN_UI.textPrimary, fontSize: 16, lineHeight: 24 }}
                >{`Tổng ${read.data.total} BOX · Trang ${read.data.page}/${read.data.lastPage}`}</Text>
                <P18ReadableText
                  label="Bộ lọc BOX đang áp dụng"
                  value={
                    query.keyword
                      ? 'Từ khóa: ' + query.keyword
                      : 'Tất cả từ khóa'
                  }
                  style={styles.hint}
                />
              </View>
            ) : null}
            {read.data?.items.map(item => (
              <View key={item.id} style={styles.row}>
                <View style={styles.title}>
                  <View style={styles.tile}>
                    <HnHomeIcon name="box" size={26} />
                  </View>
                  <View style={styles.grow}>
                    <P18ReadableText
                      label="Mã BOX"
                      value={item.code}
                      style={styles.heading}
                    />
                  </View>
                  <Pressable
                    style={styles.action}
                    accessibilityRole="button"
                    accessibilityLabel={'Chi tiết BOX ' + item.code}
                    disabled={read.busy}
                    onPress={() => {
                      if (read.busy) return;
                      setSelection({ scope: read.scope, id: item.id });
                      void detail.run(signal => service.box(item.id, signal));
                    }}
                  >
                    <HnHomeIcon name="chevron" size={20} />
                  </Pressable>
                </View>
                <P18ReadableText
                  label="SKU trong BOX"
                  value={
                    item.sku
                      ? item.sku.code + ' · ' + item.sku.name
                      : classification.UNASSIGNED
                  }
                />
                <Text style={styles.category}>
                  {classification[item.classification] ??
                    'Chưa xác minh phân loại'}
                </Text>
                <ReadValue
                  label="Số lượng trong BOX"
                  field={item.containedQty}
                />
              </View>
            ))}
            {read.data?.total === 0 && !read.busy ? (
              <View
                style={[styles.card, { marginTop: 12 }]}
                accessibilityLiveRegion="polite"
              >
                <Text style={styles.heading}>
                  Không có BOX trong bộ lọc này.
                </Text>
                <Text style={styles.hint}>
                  Điều chỉnh từ khóa hoặc loại SKU để tìm BOX khác.
                </Text>
              </View>
            ) : null}
            {(query.keyword || query.skuType !== 'ALL') && !read.busy ? (
              <Button
                label="Xóa bộ lọc"
                variant="secondary"
                onPress={() => {
                  setKeyword('');
                  setSkuType('ALL');
                  load(boxQuery());
                }}
              />
            ) : null}
            {read.data && read.data.page > 1 ? (
              <Button
                label="Trang trước"
                variant="secondary"
                disabled={read.busy}
                onPress={() => load({ ...query, page: query.page - 1 })}
              />
            ) : null}
            {read.data && read.data.page < read.data.lastPage ? (
              <Button
                label="Trang tiếp"
                disabled={read.busy}
                onPress={() => load({ ...query, page: query.page + 1 })}
              />
            ) : null}
            <Button
              label="Tải lại BOX"
              variant="secondary"
              disabled={read.busy}
              onPress={() => load(query)}
            />
          </>
        )}
        {(selected ? detail.busy : read.busy) ? (
          <Text accessibilityLiveRegion="polite">Đang đọc dữ liệu…</Text>
        ) : null}
        {(selected ? detail.error : read.error) ? (
          <Text tone="danger" accessibilityLiveRegion="polite">
            {(selected ? detail.error : read.error)?.message}
          </Text>
        ) : null}
      </Page>
    </View>
  );
}
