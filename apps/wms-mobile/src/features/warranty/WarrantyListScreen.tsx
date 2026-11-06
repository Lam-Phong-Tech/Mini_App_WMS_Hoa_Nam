import {HN_UI} from '../../theme/uiKitV3';
import { ScannerNativeText as Text } from '../../ui/ScannerNativeText';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View, type ImageSourcePropType } from 'react-native';
import { Input } from '../../ui/Input';
import { P09Dialog as Dialog } from './P09Presentation';
import { p09CommandOwner, createP09Pager } from './p09Controller';
import { useP09Pager, P09PageFooter, P09Error } from './P09Support';
import {
  lockedP09Service,
  type P09Service,
  type P09Case,
  type P09Filters,
} from '../../services/wms/p09Warranty';
import type { WarrantyCase } from '../../services/wms/types';
import {
  MESSAGE_ANONYMIZED,
  displayPii,
  isCaseAnonymized,
} from './warrantyPolicy';
import {
  P09Frame,
  P09Photo,
  P09Status,
  P09Action,
  P09Tile,
  p09,
  p09Date,
  p09Status,
} from './P09Presentation';
import { useHardwareBack } from '../../app/useHardwareBack';
import { P04Icon } from '../inbound/P04Icon';

const allStatuses = [
  'ALL',
  'RECEIVED',
  'CHECKING',
  'REPAIRING',
  'COMPLETED',
  'RETURNED',
  'CANCELLED',
] as const;
const quickStatuses = ['RECEIVED', 'CHECKING', 'COMPLETED', 'RETURNED'] as const;
export interface WarrantyListScreenProps {
  onBack?: () => void;
  onScan?: () => void;
  onManualEntry?: () => void;
  onCreateWithoutCode?: () => void;
  onOpenCase?: (warrantyCase: WarrantyCase) => void;
  service?: P09Service;
  /** Optional verified image provider; offline reference pictures stay outside the runtime adapter. */
  productImage?: (item: P09Case) => ImageSourcePropType | undefined;
  footer?: React.ReactNode;
}
export function WarrantyListScreen({
  onBack,
  onScan,
  onManualEntry,
  onOpenCase,
  service = lockedP09Service,
  productImage,
  footer,
}: WarrantyListScreenProps) {
  const retained = useMemo(() => listState(service), [service]);
  const [tab, setTab] = useState<string>(retained.filters.status ?? 'ALL');
  const [search, setSearch] = useState(retained.filters.search ?? '');
  const [sort, setSort] = useState(retained.filters.sort ?? 'created_at_desc');
  const [picker, setPicker] = useState<'filter' | 'sort'>(),
    [draft, setDraft] = useState('');
  const state = useP09Pager(retained.pager);
  useEffect(() => {
    const command = p09CommandOwner(service).snapshot();
    const stamp =
      command.phase === 'succeeded' ? command.command?.requestId : undefined;
    if (stamp && stamp !== retained.confirmedRequest) {
      retained.confirmedRequest = stamp;
      retained.filters.per_page = Math.min(
        100,
        Math.max(25, retained.pager.snapshot().items.length),
      );
      retained.pager.load().catch(() => undefined);
    }
  }, [retained, service]);
  function load(status: string, query = search, order = sort) {
    retained.filters = {
      status: status as P09Filters['status'],
      search: query,
      sort: order,
    };
    retained.pager.reset();
    return retained.pager.load();
  }
  useEffect(() => {
    if (search === (retained.filters.search ?? '')) return;
    const timer = setTimeout(() => {
      if (search === (retained.filters.search ?? '')) return;
      retained.filters = { status: tab as P09Filters['status'], search, sort };
      retained.pager.reset();
      retained.pager.load().catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, sort, tab, retained]);
  function closePicker() {
    setPicker(undefined);
  }
  useHardwareBack(() => {
    if (picker) {
      closePicker();
      return true;
    }
    return false;
  });
  const canIntake = service.scope().permissions.includes('warranty.manage');
  return (
    <P09Frame
      panel={1}
      scrollKey={JSON.stringify(retained.filters)}
      onBack={onBack}
      initialScrollY={state.scroll}
      onScrollPositionChange={retained.pager.scroll}
      onEndReached={() => {
        if (state.meta?.hasMore && !state.loading)
          retained.pager.load(true).catch(() => undefined);
      }}
      headerRight={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tiếp nhận bảo hành"
          accessibilityState={{ disabled: !canIntake || !onManualEntry }}
          disabled={!canIntake || !onManualEntry}
          onPress={onManualEntry ?? (() => {})}
          style={{
            backgroundColor: 'transparent',
            width: 48,
            height: 48,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <P04Icon name="plus" size={24} color={canIntake && onManualEntry ? HN_UI.onBrand : HN_UI.disabledForeground} />
        </Pressable>
      }
      footer={footer}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tiếp nhận và sửa chữa bảo hành"
        disabled={!canIntake || !(onScan || onManualEntry)}
        onPress={onScan ?? onManualEntry}
        style={[
          p09.card,
          p09.row,
          { padding: 10, gap: 10, backgroundColor: HN_UI.canvas },
        ]}
      >
        <P09Tile name="tool" warranty />
        <View style={p09.fill}>
          <Text style={[p09.heading, { fontSize: 16, lineHeight: 22 }]}>
            Tiếp nhận và sửa chữa bảo hành
          </Text>
          <Text style={p09.small}>Quét mã hoặc nhập thông tin sản phẩm</Text>
        </View>
        <P04Icon name="chevron-right" size={20} color={HN_UI.textLink} />
      </Pressable>
      <View style={[p09.row, { alignItems: 'flex-end', gap: 10 }]}>
        <View style={p09.fill}>
          <Input
            accessibilityLabel="Tìm hồ sơ"
            placeholder="Nhập mã hồ sơ, serial, tên sản phẩm…"
            fieldHeight={48}
            leftAdornment={<P04Icon name="search" size={22} color={HN_UI.textLink} />}
            inputStyle={{ fontSize: 14 }}
            value={search}
            maxLength={200}
            onChangeText={setSearch}
            onSubmitEditing={() => load(tab).catch(() => undefined)}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Lọc hồ sơ bảo hành"
          onPress={() => {
            setDraft(tab);
            setPicker('filter');
          }}
          style={{
            height: 48,
            width: 52,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: HN_UI.primary,
            borderRadius: 8,
          }}
        >
          <P04Icon name="funnel" size={24} color={HN_UI.onBrand} />
        </Pressable>
      </View>
      <View style={p09.row}>
        <P09Action
          label={`${p09Status(tab)} (${state.meta?.total ?? '—'})`}
          accessibilityLabel={`${p09Status(tab)} (${state.meta?.total ?? '—'})`}
          variant="secondary"
          trailing={<P04Icon name="chevron-down" size={20} color={HN_UI.textLink} />}
          onPress={() => {
            setDraft(tab);
            setPicker('filter');
          }}
          style={[p09.fill, { minHeight: 44, paddingHorizontal: 8 }]}
          labelStyle={{ fontSize: 14, lineHeight: 21, fontWeight: '400' }}
        />
        <P09Action
          label={
            sort === 'created_at_desc'
              ? 'Ngày tạo mới nhất'
              : 'Ngày tạo cũ nhất'
          }
          trailing={<P04Icon name="chevron-down" size={20} color={HN_UI.textLink} />}
          variant="secondary"
          onPress={() => {
            setDraft(sort);
            setPicker('sort');
          }}
          style={[
            p09.fill,
            { minHeight: 44, borderColor: HN_UI.border, paddingHorizontal: 8 },
          ]}
          labelStyle={{ fontSize: 14, lineHeight: 21, fontWeight: '400' }}
        />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {quickStatuses.map(status => (
          <Pressable
            key={status}
            accessibilityRole="button"
            accessibilityLabel={`Lọc ${p09Status(status)} (—)`}
            accessibilityHint="Chưa có tổng theo trạng thái từ máy chủ"
            accessibilityState={{ selected: tab === status }}
            onPress={() => {
              setTab(status);
              load(status).catch(() => undefined);
            }}
            style={{
              flexBasis: '48%',
              flexGrow: 1,
              minHeight: 44,
              paddingHorizontal: 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6,
              borderWidth: 1,
              borderColor: tab === status ? HN_UI.borderSelected : HN_UI.border,
              borderRadius: 8,
              backgroundColor: tab === status ? HN_UI.selected : HN_UI.surface,
            }}
          >
            <Text numberOfLines={1} style={[p09.small, { color: HN_UI.textLink, flexShrink: 1 }]}>{p09Status(status)}</Text>
            {/* P09 list has no server status facets. A page is not a count. */}
            <Text style={p09.small}>—</Text>
          </Pressable>
        ))}
      </View>
      {state.error && (
        <>
          <P09Error
            title="Không tải được danh sách bảo hành"
            error={state.error}
            onBack={onBack ?? (() => {})}
          />
          <P09Action
            label="Thử lại"
            variant="secondary"
            onPress={() =>
              retained.pager.load(!!state.meta).catch(() => undefined)
            }
          />
        </>
      )}
      {state.loading && !state.meta && (
        <Text style={p09.small}>Đang tải hồ sơ…</Text>
      )}
      {state.meta && state.items.length === 0 && (
        <View style={p09.card}>
          <Text style={p09.heading}>Không có hồ sơ phù hợp.</Text>
          <P09Action
            label="Xóa bộ lọc"
            variant="secondary"
            onPress={() => {
              setSearch('');
              setTab('ALL');
              load('ALL', '').catch(() => undefined);
            }}
          />
        </View>
      )}
      {state.items.map(item => (
        <Pressable
          key={item.warranty_case_id}
          accessibilityRole="button"
          accessibilityLabel={
            'Xem chi tiết hồ sơ ' +
            (item.warranty_case_code ?? item.warranty_case_id)
          }
          disabled={!onOpenCase}
          onPress={() => onOpenCase?.(item)}
          style={[
            p09.card,
            p09.row,
            {
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 10,
              paddingVertical: 10,
            },
          ]}
        >
          <P09Photo compact source={productImage?.(item)} />
          <View style={[p09.fill, { gap: 3 }]}>
            <View style={p09.between}>
              <Text
                style={[
                  p09.heading,
                  p09.fill,
                  { fontSize: 16, lineHeight: 22 },
                ]}
              >
                {item.warranty_case_code ?? item.warranty_case_id}
              </Text>
              <P09Status status={item.status} />
            </View>
            <Text
              style={[
                p09.text,
                { fontWeight: '600', fontSize: 14, lineHeight: 20 },
              ]}
            >
              {item.sku_name ??
                displayPii(item.manual_product_description) ??
                'Sản phẩm chưa xác định'}
            </Text>
            <Text style={[p09.small, { fontSize: 12, lineHeight: 18 }]}>
              SN: {item.serial_number ?? 'Chưa có dữ liệu'}
              {'  |  '}
              {isCaseAnonymized(item)
                ? MESSAGE_ANONYMIZED
                : 'KH: ' +
                  (displayPii(item.customer_name) ?? 'Chưa có dữ liệu')}
            </Text>
            <Text style={[p09.small, { fontSize: 12 }]}>
              {p09Date(item.received_at ?? item.created_at)}
            </Text>
          </View>
          <Text style={p09.text}>›</Text>
        </Pressable>
      ))}
      <P09PageFooter
        showError={false}
        pager={retained.pager}
        onBack={onBack ?? (() => {})}
      />
      {picker && (
        <Dialog
          visible
          title={picker === 'filter' ? 'Lọc hồ sơ bảo hành' : 'Sắp xếp hồ sơ'}
          onDismiss={closePicker}
          dismissOnBackdrop={false}
          footer={
            <View style={p09.row}>
              <P09Action
                label="Hủy"
                variant="secondary"
                onPress={closePicker}
                style={p09.fill}
              />
              <P09Action
                label="Áp dụng"
                onPress={() => {
                  if (picker === 'filter') {
                    setTab(draft);
                    load(draft).catch(() => undefined);
                  } else {
                    setSort(draft as typeof sort);
                    load(tab, search, draft as typeof sort).catch(
                      () => undefined,
                    );
                  }
                  closePicker();
                }}
                style={p09.fill}
              />
            </View>
          }
        >
          <View style={{ gap: 8 }}>
            {(picker === 'filter'
              ? allStatuses
              : ['created_at_desc', 'created_at_asc']
            ).map(value => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked: draft === value }}
                accessibilityLabel={
                  picker === 'filter'
                    ? p09Status(value)
                    : value === 'created_at_desc'
                    ? 'Ngày tạo mới nhất'
                    : 'Ngày tạo cũ nhất'
                }
                onPress={() => setDraft(value)}
                style={[
                  p09.card,
                  p09.row,
                  { padding: 12 },
                  draft === value && { backgroundColor: HN_UI.canvas },
                ]}
              >
                <Text style={p09.text}>
                  {draft === value ? '◉' : '○'}{' '}
                  {picker === 'filter'
                    ? p09Status(value)
                    : value === 'created_at_desc'
                    ? 'Ngày tạo mới nhất'
                    : 'Ngày tạo cũ nhất'}
                </Text>
              </Pressable>
            ))}
          </View>
        </Dialog>
      )}
    </P09Frame>
  );
}
const lists = new WeakMap<
  P09Service,
  {
    filters: P09Filters;
    pager: ReturnType<typeof createP09Pager<P09Case>>;
    scope: string;
    confirmedRequest?: string;
  }
>();
function listState(service: P09Service) {
  let entry = lists.get(service);
  if (!entry || entry.scope !== service.contextKey()) {
    const state = {
      filters: { status: 'ALL' } as P09Filters,
      scope: service.contextKey(),
      pager: undefined as unknown as ReturnType<typeof createP09Pager<P09Case>>,
    };
    state.pager = createP09Pager(
      page => service.list({ ...state.filters, ...page }),
      row => row.warranty_case_id,
      () => service.contextKey() + JSON.stringify(state.filters),
    );
    lists.set(service, state);
    entry = state;
  }
  return entry;
}
