import {HN_UI} from '../../theme/uiKitV3';
import {ScannerNativeText as Text} from '../../ui/ScannerNativeText';
import React, { useEffect, useState, type ReactNode } from 'react';
import { formatVietnamDateTime } from '../../time/vietnamTime';
import {ActivityIndicator, Image, Pressable, View, type ImageSourcePropType} from 'react-native';
import {
  p06ImageUri,
  p06ErrorState,
  type P06Card,
  type P06GalleryImage,
  type P06Stock,
  type P06Event,
} from '../../services/wms/p06Catalog';
import {
  p06StockChip,
  p06StockText,
  p06CardLabel,
  p06EventQuantity,
  type P06Load,
} from './p06LookupFlow';
import { P06Icon, P06SurfaceGradient, useP06Design } from './P06Design';
import { HN_OPERATIONS } from '../../ui/hnHomeTokens';

/** Optional visual-only source injected by the isolated review entry, never AppShell/API mode. */
export interface P06ReviewPresentation {
  readonly kind: 'LOCAL_LOCKED_VISUAL_ONLY';
  readonly cards: Record<
    string,
    {
      code: string;
      location?: string;
      group?: string;
      brand?: string;
      description?: string;
      photos?: readonly ImageSourcePropType[];
      locations?: readonly {
        id: string;
        total: number;
        available: number;
        held: number;
        unavailable: number;
      }[];
    }
  >;
  readonly events?: Record<
    string,
    { title: string; description: string; status: string }
  >;
  readonly dateRangeLabel?: string;
}
export const p06ReviewFields = (
  card: P06Card,
  source?: P06ReviewPresentation,
) =>
  source?.kind === 'LOCAL_LOCKED_VISUAL_ONLY'
    ? source.cards[card.sku_id]
    : undefined;

/** Production reads only its validated owner card; review data stays opt-in. */
export function p06MasterFields(card: P06Card, source?: P06ReviewPresentation) {
  const visual = p06ReviewFields(card, source);
  const value = (
    field: 'category_name' | 'brand_name' | 'description',
    preview: string | undefined,
  ) => {
    const status = card.metadata_status?.[field];
    if (
      status &&
      [
        'NOT_ASSIGNED',
        'REFERENCE_NOT_FOUND',
        'LABEL_UNAVAILABLE',
        'SOURCE_NOT_DEFINED',
        'PROFILE_NOT_FOUND',
        'PROFILE_AMBIGUOUS',
        'DESCRIPTION_UNAVAILABLE',
      ].includes(status)
    )
      return null;
    return Object.prototype.hasOwnProperty.call(card, field)
      ? typeof card[field] === 'string'
        ? card[field]
        : null
      : preview;
  };
  return {
    group: value('category_name', visual?.group),
    brand: value('brand_name', visual?.brand),
    description: value('description', visual?.description),
  };
}

export function P06Button({
  label,
  onPress,
  disabled = false,
  testID,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  icon?: string;
}) {
  const { s, px } = useP06Design();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[icon ? s.shortcut : s.button, disabled && s.disabled]}
      testID={testID}
    >
      {icon && <P06Icon name={icon} size={px(22)} color={disabled?HN_UI.disabledForeground:HN_UI.textLink}/>}
      <Text style={[icon?s.shortcutText:s.buttonText,disabled&&{color:HN_UI.disabledForeground}]}>{label}</Text>
      {icon && <P06Icon name="chevron" size={px(16)} color={disabled?HN_UI.disabledForeground:HN_UI.textLink}/>}
    </Pressable>
  );
}
export function P06Photo({
  image,
  source,
  width = 96,
  height = 96,
}: {
  image?: P06GalleryImage;
  source?: ImageSourcePropType;
  width?: number;
  height?: number;
}) {
  const { s, px } = useP06Design(),
    uri = image && p06ImageUri(image),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => setFailed(false), [uri, source]);
  return (
    <View style={[s.photo, { width: px(width), height: px(height) }]}>
      <P06SurfaceGradient
        width={px(width)}
        height={px(height)}
        angle={135}
        from={HN_UI.surface}
        to={HN_UI.canvas}
      />
      {(source || uri) && !failed ? (
        <Image
          key={retry}
          source={source ?? { uri: uri! }}
          accessibilityLabel={image?.alt_text || 'Ảnh sản phẩm'}
          onError={() => setFailed(true)}
          resizeMode="contain"
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <>
          <P06Icon name="box" color={HN_UI.textMuted} size={px(25)} />
          <Text style={s.photoText}>
            {failed ? 'Không tải được ảnh' : 'Chưa có ảnh'}
          </Text>
          {failed && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Thử tải ảnh lại"
              onPress={() => {
                setFailed(false);
                setRetry(n => n + 1);
              }}
            >
              <Text
                style={[
                  s.small,
                  {
                    color: HN_UI.textLink,
                    textDecorationLine: 'underline',
                    textAlign: 'center',
                  },
                ]}
              >
                Thử tải ảnh lại
              </Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}
/** Match the source CSS divider without wide CJK spaces changing web card density. */
export const P06_META_SEPARATOR = '  |  ';

export function P06StockChip({
  stock,
  compact = false,
}: {
  stock?: P06Stock | null;
  compact?: boolean;
}) {
  const { s } = useP06Design(),
    label = p06StockChip(stock),
    unknown = label === 'Chưa xác nhận',
    empty = label === 'Hết hàng';
  return (
    <View
      style={[
        s.chip,
        compact && s.cardChip,
        {
          backgroundColor: unknown ? HN_UI.selected : empty ? HN_UI.dangerSoft : HN_UI.successSoft,
        },
      ]}
    >
      <Text
        style={[
          s.chipText,
          compact && s.cardChipText,
          { color: unknown ? HN_UI.textMuted : empty ? HN_UI.danger : HN_UI.success },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}
export function P06Pair({
  label,
  value,
  locked = false,
  quantity = false,
  long = false,
  onRead,
}: {
  label: string;
  value?: string | null;
  locked?: boolean;
  quantity?: boolean;
  long?: boolean;
  onRead?: () => void;
}) {
  const { s, px } = useP06Design(),
    [truncated, setTruncated] = useState(false);
  useEffect(() => setTruncated(false), [value]);
  return (
    <View style={s.pair}>
      <Text style={s.pairLabel}>{label}</Text>
      <View style={s.fill}>
        <Text
          selectable
          style={quantity ? s.stockValue : s.pairValue}
          numberOfLines={long ? (label === 'Mô tả' ? 3 : 2) : undefined}
          onTextLayout={e => {
            if (
              long &&
              e.nativeEvent.lines.length > (label === 'Mô tả' ? 3 : 2)
            )
              setTruncated(true);
          }}
        >
          {value || '—'}
          {locked && (
            <Text>
              {' '}
              <P06Icon name="lock" size={px(16)} color={HN_UI.textSecondary} />
            </Text>
          )}
        </Text>
        {long &&
          (truncated ||
            (value?.length ?? 0) > (label === 'Mô tả' ? 140 : 60) ||
            (value?.split('\n').length ?? 0) > (label === 'Mô tả' ? 3 : 2)) &&
          onRead && <P06Button label="Xem đầy đủ" onPress={onRead} />}
      </View>
    </View>
  );
}
export function P06Hero({
  card,
  stock,
  image,
  review,
  panel,
  onRead,
}: {
  card: P06Card;
  stock?: P06Stock | null;
  image?: P06GalleryImage;
  review?: P06ReviewPresentation;
  panel: 2 | 3 | 4;
  onRead?: () => void;
}) {
  const { s, px, width } = useP06Design(),
    data = p06ReviewFields(card, review),
    [height, setHeight] = useState(px(panel === 2 ? 116 : 110));
  return (
    <View
      style={[s.hero, { overflow: 'hidden' }]}
      testID="p06-hero"
      onLayout={e => setHeight(e.nativeEvent.layout.height)}
    >
      <P06SurfaceGradient
        width={width - px(36)}
        height={height}
        angle={110}
        from={HN_UI.surface}
        to={HN_UI.selected}
      />
      <P06Photo
        image={image}
        source={data?.photos?.[0]}
        width={panel === 2 ? 140 : 116}
        height={panel === 2 ? 116 : 110}
      />
      <View style={s.fill}>
        {panel !== 3 && (
          <View
            style={
              panel === 4
                ? { alignSelf: 'flex-end', marginBottom: px(2) }
                : undefined
            }
          >
            <P06StockChip stock={stock} />
          </View>
        )}
        <Text selectable style={s.heroCode}>
          {data?.code || p06CardLabel(card)}
        </Text>
        <Text style={s.heroName} numberOfLines={2}>
          {card.sku_name}
        </Text>
        {card.sku_name.length > 60 && onRead && (
          <P06Button label="Xem đầy đủ" onPress={onRead} />
        )}
        <Text
          selectable
          style={[s.meta, { marginTop: px(5), lineHeight: px(21.6) }]}
        >
          SKU: {card.sku_code}
          {P06_META_SEPARATOR}SN: {card.serial_number ?? '—'}
        </Text>
      </View>
    </View>
  );
}
export function P06Section({
  title,
  children,
  onPress,
}: {
  title?: string;
  children: ReactNode;
  onPress?: () => void;
}) {
  const { s, px } = useP06Design();
  return (
    <View style={s.section}>
      {title &&
        (onPress ? (
          <Pressable accessibilityRole="button" onPress={onPress} style={s.row}>
            <Text style={[s.h2, s.fill]}>{title}</Text>
            <P06Icon name="chevron" size={px(18)} />
          </Pressable>
        ) : (
          <Text style={s.h2}>{title}</Text>
        ))}
      {children}
    </View>
  );
}
export function P06LoadState<T>({
  load,
  retry,
  owner,
}: {
  load: P06Load<T>;
  retry: () => void;
  owner?: () => void;
}) {
  const { s } = useP06Design();
  if (load.error) {
    const kind = p06ErrorState(load.error);
    const title = {
      pending: 'Tra cứu đang chờ kiểm thử và triển khai.',
      auth: 'Cần xác nhận lại phiên đăng nhập.',
      context: 'Kho làm việc chưa sẵn sàng. Xác nhận lại kho tại màn phiên.',
      forbidden: 'Bạn chưa có quyền xem phần dữ liệu này.',
      'not-found': 'Không tìm thấy đối tượng trong phạm vi được phép.',
      unavailable: 'Chưa đọc được dữ liệu. Kết quả chưa xác định.',
      input: 'Kiểm tra thông tin tra cứu.',
    }[kind];
    return (
      <View accessibilityLiveRegion="polite" style={s.state}>
        <Text style={s.h2}>{title}</Text>
        {load.error.message !== title && (
          <Text style={s.meta}>{load.error.message}</Text>
        )}
        {load.error.code && (
          <Text selectable style={s.small}>
            Mã: {load.error.code}
          </Text>
        )}
        {load.error.requestId && (
          <Text selectable style={s.small}>
            Request: {load.error.requestId}
          </Text>
        )}
        {kind === 'unavailable' &&
          load.error.status !== 422 &&
          load.error.status !== 503 && (
            <P06Button label="Thử đọc lại" onPress={retry} />
          )}
        {(kind === 'auth' || kind === 'context') && owner && (
          <P06Button label="Về xác nhận phiên" onPress={owner} />
        )}
      </View>
    );
  }
  return load.loading ? (
    <View accessibilityLiveRegion="polite" style={[s.row, s.note]}>
      <ActivityIndicator color={HN_UI.textLink} />
      <Text style={s.small}>Đang đọc dữ liệu…</Text>
    </View>
  ) : null;
}
export function P06StockWarning({ stock }: { stock?: P06Stock | null }) {
  const { s } = useP06Design();
  return stock?.status === 'INCOMPLETE' || stock?.status === 'MISMATCH' ? (
    <View style={[s.info, s.warning]}>
      <Text style={s.text}>
        Tồn chưa được xác nhận:{' '}
        {stock.status === 'MISMATCH'
          ? 'số liệu chưa khớp sổ kho'
          : 'nguồn dữ liệu chưa đầy đủ'}
        . Các số đang hiển thị là số liệu nguồn.
      </Text>
    </View>
  ) : null;
}
export const P06_STOCK_FIELDS = [
  ['Tổng tồn', 'total_qty'],
  ['Khả dụng', 'available_qty'],
  ['Đang giữ', 'reserved_qty'],
  ['Không khả dụng', 'unavailable_qty'],
] as const;
export function P06StockRows({
  stock,
  availability,
  onPress,
}: {
  stock?: P06Stock | null;
  availability?: string;
  onPress: () => void;
}) {
  const { s } = useP06Design();
  return (
    <P06Section title="Số lượng tồn kho" onPress={onPress}>
      <P06StockWarning stock={stock} />
      {!stock && (
        <Text style={s.small}>
          {availability === 'FORBIDDEN'
            ? 'Bạn chưa có quyền xem tồn.'
            : availability === 'USE_SKU_STOCK_ENDPOINT'
            ? 'Xem tồn SKU tại kho ở màn Tồn kho.'
            : 'Chưa có dữ liệu tồn được xác minh.'}
        </Text>
      )}
      {P06_STOCK_FIELDS.map(([label, field]) => (
        <P06Pair
          key={field}
          label={label}
          value={p06StockText(stock?.[field])}
          quantity
        />
      ))}
    </P06Section>
  );
}
export function p06Date(value: string | null): string {
  return formatVietnamDateTime(value);
}
export function P06EventRow({
  event,
  onPress,
  onRead,
  review,
}: {
  event: P06Event;
  onPress?: () => void;
  onRead?: (text:string) => void;
  review?: P06ReviewPresentation;
}) {
  const { s, px } = useP06Design(),
    metadata =
      review?.kind === 'LOCAL_LOCKED_VISUAL_ONLY'
        ? review.events?.[event.event_id]
        : undefined;
  const isWarranty = event.source === 'WARRANTY',
    qty = event.signed_quantity;
  const tone = isWarranty
    ? HN_OPERATIONS.warranty
    : qty != null && qty < 0
    ? HN_OPERATIONS.outbound
    : HN_OPERATIONS.inbound;
  const title =
    metadata?.title ||
    (
      {
        RECEIPT: 'Nhập kho',
        ISSUE: 'Xuất kho',
        OPENING: 'Đầu kỳ',
        ADJUSTMENT: 'Điều chỉnh',
        REVERSAL: 'Đảo bút toán',
      } as Record<string, string>
    )[event.event_type] ||
    (isWarranty ? 'Bảo hành' : event.event_type);
  const description=metadata?.description || event.document?.number || 'Chưa có chứng từ liên kết';
  const hasRecordedStockMovement=event.source==='LEDGER' &&
    (event.event_type==='RECEIPT'||event.event_type==='ISSUE') &&
    typeof qty==='number' && Number.isFinite(qty) && qty!==0;
  const resultLabel=metadata?.status ??
    (event.to_status==='COMPLETED'||hasRecordedStockMovement?'Thành công':'Đã ghi nhận');
  const fullInformation=[
    `Loại giao dịch: ${title}`,
    `Thời gian: ${p06Date(event.occurred_at)}`,
    `Chứng từ: ${event.document?.number ?? 'Chưa có chứng từ liên kết'}`,
    `Số lượng: ${p06EventQuantity(event)}`,
    ...(event.from_status||event.to_status?[`Mốc lịch sử: ${event.from_status??'—'} → ${event.to_status??'—'}`]:[]),
    ...(event.document?.current_status?[`Trạng thái hồ sơ hiện tại: ${event.document.current_status}`]:[]),
    `Ghi nhận: ${resultLabel}`,
  ].join('\n');
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress && !onRead}
      onPress={onPress}
      style={s.event}
      testID="p06-event"
    >
      <View style={[s.eventIcon, { backgroundColor: tone.soft }]}>
        <P06Icon
          name={
            isWarranty
              ? 'warranty'
              : qty == null || qty === 0
              ? 'document'
              : qty < 0
              ? 'up'
              : 'down'
          }
          size={px(30)}
          color={tone.ink}
        />
      </View>
      <View style={s.fill}>
        <View style={s.eventTop}>
          <Text style={s.eventName} numberOfLines={1}>{title}</Text>
          <Text style={s.eventTime} numberOfLines={1}>{p06Date(event.occurred_at)}</Text>
        </View>
        {onRead ? <Pressable testID="p06-event-read" accessibilityRole="button"
          accessibilityLabel={`Đọc đầy đủ sự kiện ${title}: ${description}`}
          onPress={e=>{e.stopPropagation();onRead(fullInformation);}}
          style={s.eventDescription}>
          <Text style={s.meta} numberOfLines={1}>{description}</Text>
        </Pressable> : <Text style={[s.meta,s.eventDescription]} numberOfLines={1} accessibilityLabel={fullInformation}>{description}</Text>}
      </View>
      <View style={s.eventResult}>
        <Text
          numberOfLines={1}
          style={[
            s.eventQty,
            isWarranty && { fontSize: px(14), lineHeight: px(19) },
            {
              color: isWarranty
                ? HN_UI.textSecondary
                : qty != null && qty < 0
                ? HN_UI.danger
                : HN_UI.success,
            },
          ]}
        >
          {p06EventQuantity(event)}
        </Text>
        <Text numberOfLines={1} style={[s.small, { color: HN_UI.success, textAlign: 'right' }]}>
          {resultLabel}
        </Text>
      </View>
      {onPress && <P06Icon name="chevron" size={px(15)} />}
    </Pressable>
  );
}
