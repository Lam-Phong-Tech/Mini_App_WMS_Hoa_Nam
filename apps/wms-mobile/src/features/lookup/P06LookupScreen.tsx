import {HN_UI} from '../../theme/uiKitV3';
import {ScannerNativeText as Text} from '../../ui/ScannerNativeText';
import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {ScannerTextInput as TextInput} from '../../ui/ScannerTextInput';
import {Keyboard,KeyboardAvoidingView,Platform,Pressable,ScrollView,View,useWindowDimensions} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSession, subscribeSession } from '../../auth/session';
import { useHardwareBack } from '../../app/useHardwareBack';
import { BottomNav } from '../../ui/BottomNav';
import { Sheet } from '../../ui/Sheet';
import { Dialog } from '../../ui/Dialog';
import {
  p06Catalog,
  p06Identity,
  p06IdentityKey,
  p06ImageUri,
  p06PrimaryImage,
  p06ScopeKey,
  type P06CatalogService,
  type P06GalleryImage,
  type P06Source,
} from '../../services/wms/p06Catalog';
import {
  P06LookupFlow,
  p06CardLabel,
  p06DocumentTarget,
  p06StockText,
  type P06Panel,
  type P06SearchMode,
  type P06ViewState,
} from './p06LookupFlow';
import {
  P06DesignProvider,
  P06HeaderGradient,
  P06Icon,
  P06SurfaceGradient,
  useP06Design,
} from './P06Design';
import {
  P06Button,
  P06EventRow,
  P06Hero,
  P06LoadState,
  P06Pair,
  P06Photo,
  P06Section,
  P06StockChip,
  P06StockRows,
  P06StockWarning,
  P06_STOCK_FIELDS,
  P06_META_SEPARATOR,
  p06ReviewFields,
  p06MasterFields,
  type P06ReviewPresentation,
} from './P06Presentation';
import { useP06CataloguePhotos } from './useP06CataloguePhotos';

export interface P06LookupScreenProps {
  initialCode?: string;
  initialViewState?: P06ViewState;
  onViewStateChange?: (view: P06ViewState) => void;
  onHome?: () => void;
  onExitLookup?: () => void;
  onScan?: () => void;
  onSelectTab?: (key: string) => void;
  onConfirmSession?: () => void;
  onOpenBoxes?: (skuCode: string) => void;
  onOpenComponentLocation?: (target: {kind:'ITEM';id:string}) => void;
  onOpenDocument?: (target: {
    owner: 'P12' | 'P09';
    id: string;
    type: string;
  }) => void;
  /** Local tests/isolated review only; AppShell uses the candidate-bound singleton. */
  service?: P06CatalogService;
  reviewPresentation?: P06ReviewPresentation;
}
export function P06LookupScreen(props: P06LookupScreenProps) {
  const { width } = useWindowDimensions(),
    [layoutWidth, setLayoutWidth] = useState(width);
  return (
    <View
      style={{ flex: 1, minHeight: 0, minWidth: 0 }}
      onLayout={e => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - layoutWidth) > 0.5) setLayoutWidth(w);
      }}
    >
      <P06DesignProvider width={layoutWidth}>
        <P06Content {...props} />
      </P06DesignProvider>
    </View>
  );
}
function P06Content({
  initialCode,
  initialViewState,
  onViewStateChange,
  onHome = () => {},
  onExitLookup,
  onScan,
  onSelectTab,
  onConfirmSession,
  onOpenDocument,
  onOpenBoxes,
  onOpenComponentLocation,
  service = p06Catalog,
  reviewPresentation,
}: P06LookupScreenProps) {
  const { s, px, width, color } = useP06Design();
  const session = useSyncExternalStore(subscribeSession, getSession),
    scopeKey = p06ScopeKey(session);
  const [flow] = useState(() => new P06LookupFlow(service)),
    state = useSyncExternalStore(flow.subscribe, flow.snapshot);
  // The real singleton never consumes review metadata, even if passed accidentally.
  const review =
    service !== p06Catalog &&
    reviewPresentation?.kind === 'LOCAL_LOCKED_VISUAL_ONLY'
      ? reviewPresentation
      : undefined;
  const view = state.view,
    panel = view.panel,
    validScope = view.scopeKey === scopeKey;
  const detail = validScope ? state.detail.data?.data : undefined,
    context = validScope ? state.context.data?.data : undefined;
  const initial = useRef(initialViewState),
    scroll = useRef<React.ComponentRef<typeof ScrollView>>(null),
    input = useRef<React.ComponentRef<typeof TextInput>>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const restore = useRef<{ panel: P06Panel; target: number } | undefined>(
    undefined,
  );
  const [filters, setFilters] = useState(false),
    [filterMode, setFilterMode] = useState<P06SearchMode>('keyword'),
    [filterStatus, setFilterStatus] =
      useState<P06ViewState['status']>('ACTIVE');
  const [image, setImage] = useState<P06GalleryImage | undefined>(),
    [readText, setReadText] = useState<
      { title: string; text: string } | undefined
    >();
  const [historyFilter, setHistoryFilter] = useState(false),
    [historySource, setHistorySource] = useState<P06Source>('ALL');
  const pending = !validScope || !context || Boolean(state.context.error),
    canScan =
      !pending &&
      Boolean(context?.permissions.skus && context.permissions.items && onScan);
  const warehouse =
    context?.available_warehouses.find(
      w => w.warehouse_id === context.active_warehouse_id,
    )?.name || 'Kho đã xác nhận';
  const gallery = state.gallery.error
    ? []
    : state.gallery.data?.data ?? detail?.gallery ?? [];
  const cataloguePhotos = useP06CataloguePhotos(
    service,
    context,
    scopeKey,
    state.list.data?.data,
    validScope && !pending && panel === 1 && !review && !state.list.loading,
  );
  useEffect(() => {
    clearTimeout(timer.current);
    setFilters(false);
    setHistoryFilter(false);
    setImage(undefined);
    setReadText(undefined);
    void flow.start(getSession(), initial.current, initialCode);
    return () => {
      clearTimeout(timer.current);
      flow.stop();
    };
  }, [flow, scopeKey, initialCode]);
  useEffect(() => {
    if (validScope) onViewStateChange?.(view);
  }, [view, validScope, onViewStateChange]);
  // Capture the target only when the panel/scope changes; scroll updates must not reset it.
  useEffect(() => {
    restore.current = { panel, target: view.scroll[panel] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, scopeKey]);
  const closeOverlay = () => {
    if (historyFilter) {
      setHistoryFilter(false);
      return true;
    }
    if (filters) {
      setFilters(false);
      return true;
    }
    if (image) {
      setImage(undefined);
      return true;
    }
    if (readText) {
      setReadText(undefined);
      return true;
    }
    return false;
  };
  const back = () => {
    clearTimeout(timer.current);
    Keyboard.dismiss();
    if (closeOverlay()) return;
    if (!flow.back()) (onExitLookup ?? onHome)();
  };
  useHardwareBack(() => {
    back();
    return true;
  });
  const scan = () => {
    clearTimeout(timer.current);
    Keyboard.dismiss();
    if (canScan) onScan?.();
  };
  const search = () => {
    clearTimeout(timer.current);
    Keyboard.dismiss();
    void flow.search(view.query.trim().length > 0);
  };
  const applyScroll = () => {
    const p = restore.current;
    if (!p || p.panel !== panel || (panel === 1 ? !state.list.data : !detail))
      return;
    scroll.current?.scrollTo({ y: p.target, animated: false });
  };
  const report = (title: string, text: string) => {
    setFilters(false);
    setImage(undefined);
    setReadText({ title, text });
  };
  const iconButton = (
    label: string,
    name: string,
    onPress: () => void,
    disabled = false,
    light = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.back, name === 'scan' && s.headerScan]}
    >
      <P06Icon name={name} size={px(28)} color={light ? HN_UI.onBrand : color.blue} />
    </Pressable>
  );
  const titles = [
    'Tra cứu sản phẩm',
    'Thông tin sản phẩm',
    'Tồn kho sản phẩm',
    'Lịch sử giao dịch',
  ];
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={s.screen}
      testID={`p06-s0${panel}`}
    >
      <View style={s.header} testID="p06-header">
        <P06HeaderGradient />
        {iconButton('Quay lại', 'back', back, false, true)}
        <View style={s.headerCopy}>
          <Text accessibilityRole="header" style={s.title}>
            {titles[panel - 1]}
          </Text>
          {panel !== 2 && (
            <Text style={s.subtitle} numberOfLines={1}>
              {panel === 1
                ? 'Tìm kiếm theo mã, tên, SKU, Serial...'
                : panel === 3
                ? (review ? 'Theo vị trí trong ' : 'Tồn tại ') + warehouse
                : 'Nhập, xuất, bảo hành, kiểm kê, điều chỉnh...'}
            </Text>
          )}
        </View>
        {panel === 1 &&
          iconButton('Quét mã tra cứu', 'scan', scan, !canScan, true)}
      </View>
      <KeyboardAvoidingView
        style={s.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          key={scopeKey + ':' + panel}
          ref={scroll}
          testID="p06-scroll"
          style={s.scroll}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          scrollEventThrottle={64}
          onContentSizeChange={applyScroll}
          onScroll={e => {
            const y = e.nativeEvent.contentOffset.y,
              p = restore.current;
            if (p) {
              if (panel === 1 ? !state.list.data : !detail) return;
              const max = Math.max(
                0,
                e.nativeEvent.contentSize.height -
                  e.nativeEvent.layoutMeasurement.height,
              );
              const target = Math.min(p.target, max);
              if (Math.abs(y - target) > 1) return;
              restore.current = undefined;
            }
            flow.setScroll(panel, y);
          }}
        >
          {!validScope ? (
            <Text style={s.meta}>Đang xác nhận phiên…</Text>
          ) : (
            <>
              <P06LoadState
                load={state.context}
                retry={() => void flow.refresh()}
                owner={onConfirmSession}
              />
              {!pending && panel === 1 && (
                <>
                  <View style={s.searchRow}>
                    <View style={s.search}>
                      <P06Icon name="search" size={px(22)} color={HN_UI.textLink} />
                      <TextInput
                        ref={input}
                        style={s.input}
                        accessibilityLabel="Tìm mã, tên SKU hoặc serial"
                        value={view.query}
                        placeholder={
                          view.mode === 'keyword'
                            ? 'Nhập mã, tên sản phẩm, SKU, Serial...'
                            : view.mode === 'serial'
                            ? 'Nhập serial chính xác...'
                            : 'Nhập mã hiện vật chính xác...'
                        }
                        placeholderTextColor={color.muted}
                        maxLength={view.mode === 'item_code' ? 512 : 200}
                        autoCorrect={false}
                        spellCheck={false}
                        autoCapitalize="none"
                        returnKeyType="search"
                        keyboardType={
                          view.mode === 'keyword'
                            ? 'default'
                            : Platform.OS === 'android'
                            ? 'visible-password'
                            : 'default'
                        }
                        onChangeText={query => {
                          clearTimeout(timer.current);
                          restore.current = undefined;
                          flow.setQuery(query);
                          scroll.current?.scrollTo({ y: 0, animated: false });
                          if (view.mode === 'keyword')
                            timer.current = setTimeout(
                              () => void flow.search(),
                              350,
                            );
                        }}
                        onSubmitEditing={search}
                      />
                      <Pressable
                        style={s.clear}
                        accessibilityRole="button"
                        accessibilityLabel="Xóa từ khóa"
                        onPress={() => {
                          clearTimeout(timer.current);
                          void flow.clear();
                          scroll.current?.scrollTo({ y: 0, animated: false });
                          input.current?.focus();
                        }}
                      >
                        <P06Icon name="close" color={HN_UI.textLink} size={px(22)} />
                      </Pressable>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Bộ lọc tra cứu"
                      onPress={() => {
                        clearTimeout(timer.current);
                        Keyboard.dismiss();
                        setImage(undefined);
                        setReadText(undefined);
                        setFilterMode(view.mode);
                        setFilterStatus(view.status);
                        setFilters(true);
                      }}
                      style={s.filter}
                    >
                      <P06SurfaceGradient
                        width={px(50)}
                        height={px(48)}
                        angle={180}
                        from={HN_UI.primary}
                        to={HN_UI.shell}
                      />
                      <P06Icon name="filter" size={px(26)} color={HN_UI.onBrand} />
                    </Pressable>
                  </View>
                  <View accessibilityRole="tablist" style={s.tabs}>
                    {(['PRODUCT', 'COMPONENT'] as const).map(category => (
                      <Pressable
                        key={category}
                        style={[
                          s.tab,
                          view.category === category && s.selected,
                        ]}
                        accessibilityRole="tab"
                        accessibilityState={{
                          selected: view.category === category,
                        }}
                        onPress={() => {
                          clearTimeout(timer.current);
                          restore.current = undefined;
                          scroll.current?.scrollTo({ y: 0, animated: false });
                          void flow.setCategory(category);
                        }}
                      >
                        <Text
                          style={[
                            s.tabText,
                            view.category === category && s.selectedText,
                          ]}
                        >
                          {category === 'PRODUCT' ? 'Sản phẩm' : 'Linh kiện'} (
                          {state.list.data?.meta.tab_totals[category] ?? '—'})
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {!view.query &&
                    state.recent.some(r => r.identity.type === 'SKU') && (
                      <View style={s.recents}>
                        <Text style={s.small}>Vừa xem</Text>
                        {state.recent
                          .filter(r => r.identity.type === 'SKU')
                          .map(r => (
                            <Pressable
                              key={p06IdentityKey(r.identity)}
                              accessibilityRole="button"
                              accessibilityLabel={`Xem lại ${r.code}`}
                              onPress={() => void flow.open(r.identity)}
                              style={s.recent}
                            >
                              <P06Icon name="history" size={px(22)} />
                              <View style={s.fill}>
                                <Text style={s.cardCode}>{r.code}</Text>
                                <Text style={s.cardMeta}>{r.name}</Text>
                              </View>
                              <P06Icon name="chevron" size={px(16)} />
                            </Pressable>
                          ))}
                      </View>
                    )}

                  <P06LoadState
                    load={state.list}
                    retry={() => void flow.refresh()}
                    owner={onConfirmSession}
                  />
                  {state.list.data?.data.map((card, index) => {
                    const metadata = p06ReviewFields(card, review);
                    return (
                      <Pressable
                        key={p06IdentityKey(p06Identity(card))}
                        accessibilityRole="button"
                        accessibilityLabel={`Xem ${p06CardLabel(card)}, ${
                          card.sku_name
                        }`}
                        onPress={() => {
                          clearTimeout(timer.current);
                          Keyboard.dismiss();
                          void flow.open(p06Identity(card));
                        }}
                        style={[s.card, index === 0 && s.firstCard]}
                        testID="p06-catalog-card"
                      >
                        <P06Photo
                          source={metadata?.photos?.[0]}
                          image={p06PrimaryImage(
                            cataloguePhotos[card.sku_id] || [],
                          )}
                        />
                        <View style={s.fill}>
                          <View style={s.cardTop}>
                            <Text style={s.cardCode}>
                              {metadata?.code || p06CardLabel(card)}
                            </Text>
                            <P06StockChip stock={card.stock} compact />
                          </View>
                          <Text style={s.cardName} numberOfLines={2}>
                            {card.sku_name}
                          </Text>
                          {card.sku_name.length > 60 && (
                            <P06Button
                              label="Xem đầy đủ"
                              onPress={() =>
                                report('Tên sản phẩm', card.sku_name)
                              }
                            />
                          )}
                          <Text style={s.cardMeta}>
                            SKU: {card.sku_code}
                            {P06_META_SEPARATOR}SN: {card.serial_number ?? '—'}
                          </Text>
                          <Text style={s.cardMeta}>
                            {warehouse}
                            {P06_META_SEPARATOR}Vị trí:{' '}
                            {metadata?.location || 'Chưa xác nhận'}
                          </Text>
                          <Text style={s.cardMeta}>
                            Tồn:{' '}
                            <Text
                              style={
                                card.stock?.total_qty === 0
                                  ? { color: HN_UI.danger }
                                  : undefined
                              }
                            >
                              {p06StockText(card.stock?.total_qty)}
                            </Text>
                            {P06_META_SEPARATOR}Khả dụng:{' '}
                            {p06StockText(card.stock?.available_qty)}
                          </Text>
                        </View>
                        <P06Icon name="chevron" size={px(15)} />
                      </Pressable>
                    );
                  })}
                  {state.list.data?.meta.total === 0 && (
                    <View style={s.state}>
                      <Text style={s.text}>
                        {view.query
                          ? 'Không có kết quả phù hợp. Kiểm tra từ khóa hoặc loại hàng.'
                          : 'Danh sách hiện chưa có dữ liệu trong bộ lọc này.'}
                      </Text>
                      <P06Button
                        label="Xóa từ khóa"
                        onPress={() => void flow.clear()}
                      />
                    </View>
                  )}
                  {!review &&
                    state.list.data &&
                    state.list.data.meta.page <
                      state.list.data.meta.last_page && (
                      <P06Button
                        label="Tải thêm kết quả"
                        disabled={state.list.loading}
                        onPress={() => {
                          // Append must retain the browser/native position. An
                          // unconsumed mount restore (commonly target 0) would
                          // otherwise run again on content-size change and
                          // jump the operator back to the list top.
                          restore.current = undefined;
                          void flow.moreList();
                        }}
                      />
                    )}
                </>
              )}
              {!pending && panel !== 1 && (
                <>
                  <P06LoadState
                    load={state.detail}
                    retry={() => void flow.refresh()}
                    owner={onConfirmSession}
                  />
                  {detail && (
                    <>
                      <P06Hero
                        onRead={() =>
                          report('Tên sản phẩm', detail.card.sku_name)
                        }
                        card={detail.card}
                        stock={
                          panel === 3 ? state.stock.data?.data : detail.stock
                        }
                        image={p06PrimaryImage(gallery)}
                        review={review}
                        panel={panel}
                      />
                      {panel === 2 && (
                        <>
                          <View style={s.actions}>
                            <View style={s.fill}>
                              <P06Button
                                label="Xem tồn kho"
                                icon="warehouse"
                                disabled={pending || context?.permissions.stock !== true}
                                onPress={() => {
                                  if (!pending && context?.permissions.stock === true && p06ScopeKey(getSession()) === view.scopeKey) void flow.toPanel(3);
                                }}
                              />
                            </View>
                            <View style={s.fill}>
                              <P06Button
                                label="Lịch sử giao dịch"
                                icon="history"
                                disabled={pending || !(context?.permissions.ledger === true || context?.permissions.warranty_view === true)}
                                onPress={() => {
                                  if (!pending && (context?.permissions.ledger === true || context?.permissions.warranty_view === true) && p06ScopeKey(getSession()) === view.scopeKey) void flow.toPanel(4);
                                }}
                              />
                            </View>
                          </View>
                          <View style={s.actions}>
                            {(
                              [
                                ['scan', 'Quét mã'],
                                ['printer', 'In tem'],
                                ['warranty', 'Bảo hành'],
                              ] as const
                            ).map(([name, label], index) => (
                              <Pressable
                                key={name}
                                style={[
                                  s.action,
                                  (index !== 0 || !canScan) && s.disabled,
                                ]}
                                accessibilityRole="button"
                                accessibilityState={{
                                  disabled: index !== 0 || !canScan,
                                }}
                                disabled={index !== 0 || !canScan}
                                onPress={() => {
                                  if (index === 0) scan();
                                }}
                              >
                                <P06Icon
                                  name={name}
                                  size={px(31)}
                                  color={index === 0 ? HN_UI.textSecondary : HN_UI.textSecondary}
                                />
                                <Text style={s.actionText}>{label}</Text>
                                {index !== 0 && (
                                  <Text
                                    style={[s.small, { textAlign: 'center' }]}
                                  >
                                    {index === 1 &&
                                    !context?.permissions.label_print_permission
                                      ? 'Không có quyền'
                                      : 'Chưa hỗ trợ'}
                                  </Text>
                                )}
                              </Pressable>
                            ))}
                          </View>
                          <P06Section title="Thông tin cơ bản">
                            <P06Pair label="SKU" value={detail.card.sku_code} />
                            <P06Pair
                              label="Tên sản phẩm"
                              value={detail.card.sku_name}
                              long
                              onRead={() =>
                                report('Tên sản phẩm', detail.card.sku_name)
                              }
                            />
                            {detail.card.card_type === 'ITEM' && (
                              <>
                                <P06Pair
                                  label="Mã hiện vật"
                                  value={detail.card.item_code}
                                />
                                <P06Pair
                                  label="Serial"
                                  value={detail.card.serial_number}
                                />
                              </>
                            )}
                            <P06Pair
                              label="Nhóm sản phẩm"
                              value={p06MasterFields(detail.card, review).group}
                              long
                              onRead={() =>
                                report(
                                  'Nhóm sản phẩm',
                                  p06MasterFields(detail.card, review).group ||
                                    'Chưa có dữ liệu nhóm sản phẩm.',
                                )
                              }
                            />
                            <P06Pair
                              label="Thương hiệu"
                              value={p06MasterFields(detail.card, review).brand}
                              long
                              onRead={() =>
                                report(
                                  'Thương hiệu',
                                  p06MasterFields(detail.card, review).brand ||
                                    'Chưa có dữ liệu thương hiệu.',
                                )
                              }
                            />
                            <P06Pair
                              label="Đơn vị tính"
                              value={detail.card.unit ? detail.card.unit.charAt(0).toUpperCase() + detail.card.unit.slice(1) : detail.card.unit}
                            />
                            <P06Pair
                              label="Kho lưu trữ"
                              value={warehouse}
                              locked
                            />
                            <P06Pair
                              label="Mô tả"
                              value={
                                p06MasterFields(detail.card, review).description
                              }
                              long
                              onRead={() =>
                                report(
                                  'Mô tả',
                                  p06MasterFields(detail.card, review)
                                    .description ||
                                    'Chưa có dữ liệu mô tả được cung cấp.',
                                )
                              }
                            />
                          </P06Section>
                          {detail.card.sku_type === 'COMPONENT' && !review ? <>
                            {detail.card.card_type === 'ITEM' && detail.card.item_id && onOpenComponentLocation ? <P06Button label="Xem vị trí linh kiện" onPress={()=>{
                              if(validScope && !pending && detail.card.item_id) onOpenComponentLocation({kind:'ITEM',id:detail.card.item_id});
                            }}/> : null}
                            {onOpenBoxes ? <P06Button label="Tra cứu BOX linh kiện" onPress={()=>{if(validScope && !pending)onOpenBoxes(detail.card.sku_code);}}/> : null}
                          </> : null}
                          <P06StockRows
                            stock={detail.stock}
                            availability={detail.stock_availability}
                            onPress={() => void flow.toPanel(3)}
                          />
                          <Text style={s.h2}>Hình ảnh sản phẩm</Text>
                          <P06LoadState
                            load={state.gallery}
                            retry={() => void flow.loadGallery()}
                          />
                          <View style={s.gallery}>
                            {review &&
                            p06ReviewFields(detail.card, review)?.photos
                              ?.length ? (
                              p06ReviewFields(detail.card, review)!.photos!.map(
                                (source, index) => (
                                  <View style={s.galleryButton} key={index}>
                                    <P06Photo
                                      source={source}
                                      width={96}
                                      height={72}
                                    />
                                  </View>
                                ),
                              )
                            ) : gallery.length ? (
                              gallery.map(img => (
                                <Pressable
                                  key={img.image_id}
                                  style={s.galleryButton}
                                  accessibilityRole="button"
                                  accessibilityLabel={
                                    img.alt_text || 'Xem ảnh sản phẩm'
                                  }
                                  accessibilityState={{
                                    disabled: !p06ImageUri(img),
                                  }}
                                  disabled={!p06ImageUri(img)}
                                  onPress={() => {
                                    setFilters(false);
                                    setReadText(undefined);
                                    setImage(img);
                                  }}
                                >
                                  <P06Photo
                                    image={img}
                                    width={96}
                                    height={72}
                                  />
                                </Pressable>
                              ))
                            ) : (
                              <Text style={s.meta}>
                                Chưa có ảnh sản phẩm được cung cấp.
                              </Text>
                            )}
                          </View>

                        </>
                      )}
                      {panel === 3 && (
                        <>
                          <P06LoadState
                            load={state.stock}
                            retry={() => void flow.refresh()}
                            owner={onConfirmSession}
                          />
                          <View style={s.warehouse}>
                            <View style={s.warehouseHeader}>
                              <P06Icon
                                name="house"
                                size={px(38)}
                                color={HN_UI.textLink}
                              />
                              <View style={s.fill}>
                                <Text style={s.warehouseName}>
                                  {warehouse}{' '}
                                  <P06Icon
                                    name="lock"
                                    size={px(17)}
                                    color={HN_UI.textSecondary}
                                  />
                                </Text>
                                <Text
                                  style={[
                                    s.meta,
                                    {
                                      fontSize: px(17),
                                      lineHeight: px(22.95),
                                      marginTop: px(4),
                                    },
                                  ]}
                                >
                                  (Kho tổng)
                                </Text>
                              </View>
                            </View>
                            <P06StockWarning stock={state.stock.data?.data} />
                            <View style={s.strip} testID="p06-stock-strip">
                              {P06_STOCK_FIELDS.map(([label, field], i) => (
                                <View
                                  key={field}
                                  style={[
                                    s.stockCell,
                                    i > 0 && {
                                      borderLeftWidth: 1,
                                      borderLeftColor: HN_UI.border,
                                    },
                                  ]}
                                >
                                  <View style={s.stockLabelSlot}>
                                    <Text style={s.stockLabel}>{label}</Text>
                                  </View>
                                  <Text
                                    selectable
                                    style={[
                                      s.quantity,
                                      field === 'unavailable_qty' && {
                                        color: HN_UI.danger,
                                      },
                                      String(
                                        state.stock.data?.data[field] ?? '',
                                      ).length > 4 && { fontSize: px(20) },
                                    ]}
                                  >
                                    {p06StockText(
                                      state.stock.data?.data[field],
                                    )}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          </View>
                          <Text style={s.h2}>
                            {review ? 'Tồn kho theo vị trí' : 'Phạm vi tồn kho'}
                          </Text>
                          {p06ReviewFields(detail.card, review)?.locations?.map(
                            location => (
                              <View
                                key={location.id}
                                style={[
                                  s.section,
                                  {
                                    paddingVertical: px(6),
                                    paddingHorizontal: px(12),
                                    marginBottom: px(8),
                                    borderColor: HN_UI.border,
                                    backgroundColor: HN_UI.surface,
                                  },
                                ]}
                              >
                                <View style={s.row}>
                                  <View
                                    style={{
                                      width: px(30),
                                      height: px(30),
                                      padding: px(3),
                                      borderRadius: px(8),
                                      backgroundColor: HN_UI.canvas,
                                    }}
                                  >
                                    <P06Icon
                                      name="pin"
                                      size={px(24)}
                                      color={HN_UI.textSecondary}
                                    />
                                  </View>
                                  <Text
                                    style={[
                                      s.heroName,
                                      s.fill,
                                      { fontSize: px(22), lineHeight: px(30) },
                                    ]}
                                  >
                                    {location.id}
                                  </Text>
                                  <Text style={[s.meta, { fontSize: px(17) }]}>
                                    <Text
                                      style={[
                                        s.heroCode,
                                        { lineHeight: px(30) },
                                      ]}
                                    >
                                      {location.total}
                                    </Text>{' '}
                                    {detail.card.unit}
                                  </Text>
                                </View>
                                <View
                                  style={[
                                    s.row,
                                    {
                                      flexWrap: 'wrap',
                                      justifyContent: 'space-between',
                                      gap: px(5),
                                      marginTop: px(4),
                                    },
                                  ]}
                                >
                                  {(
                                    [
                                      [
                                        'Khả dụng',
                                        location.available,
                                        HN_UI.success,
                                      ],
                                      ['Đang giữ', location.held, HN_UI.warning],
                                      [
                                        'Không khả dụng',
                                        location.unavailable,
                                        HN_UI.danger,
                                      ],
                                    ] as const
                                  ).map(([label, value, tone]) => (
                                    <View
                                      key={label}
                                      style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: px(5),
                                      }}
                                    >
                                      <View
                                        style={{
                                          width: px(11),
                                          height: px(11),
                                          borderRadius: px(6),
                                          backgroundColor: tone,
                                        }}
                                      />
                                      <Text style={s.small}>
                                        {label} {value}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                              </View>
                            ),
                          )}
                          {!review && (
                            <View style={[s.info, s.row]}>
                              <Text style={s.small}>
                                Chưa có dữ liệu tồn theo ô/kệ/khay.
                              </Text>
                            </View>
                          )}



                        </>
                      )}
                      {panel === 4 && (
                        <>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Bộ lọc lịch sử"
                            style={[
                              s.shortcut,
                              {
                                flex: undefined,
                                width: '100%',
                                marginBottom: px(10),
                              },
                            ]}
                            onPress={() => {
                              setFilters(false);
                              setImage(undefined);
                              setReadText(undefined);
                              setHistorySource(view.source);
                              setHistoryFilter(true);
                            }}
                          >
                            <P06Icon name="filter" size={px(26)} />
                            <Text
                              style={[s.shortcutText, { fontSize: px(18) }]}
                            >
                              Bộ lọc lịch sử
                            </Text>
                            <P06Icon name="calendar" size={px(24)} />
                          </Pressable>
                          <View
                            style={[
                              s.row,
                              {
                                flexWrap: 'wrap',
                                gap: px(8),
                                marginBottom: px(12),
                              },
                            ]}
                          >
                            {[
                              review
                                ? 'Tất cả loại giao dịch'
                                : view.source === 'ALL'
                                ? 'Tất cả nguồn'
                                : view.source === 'LEDGER'
                                ? 'Sổ kho'
                                : 'Bảo hành',
                            ].map(label => (
                              <View
                                key={label}
                                style={{
                                  paddingVertical: px(7),
                                  paddingHorizontal: px(10),
                                  backgroundColor: HN_UI.canvas,
                                  borderColor: HN_UI.border,
                                  borderWidth: 1,
                                  borderRadius: px(9),
                                }}
                              >
                                <Text style={[s.small, { color: color.ink }]}>
                                  {label}
                                </Text>
                              </View>
                            ))}
                          </View>
                          <P06LoadState
                            load={state.timeline}
                            retry={() => void flow.refresh()}
                            owner={onConfirmSession}
                          />

                          {state.timeline.data?.meta.total === 0 && (
                            <Text style={s.meta}>
                              Chưa có giao dịch trong nguồn được phép và đang
                              chọn.
                            </Text>
                          )}
                          {state.timeline.data?.data.map(event => {
                            const target = p06DocumentTarget(event);
                            return (
                              <P06EventRow
                                key={event.event_id}
                                event={event}
                                review={review}
                                onRead={text=>{
                                  if(p06ScopeKey(getSession())===view.scopeKey)report('Thông tin sự kiện',text);
                                }}
                                onPress={
                                  target && onOpenDocument
                                    ? () => onOpenDocument(target)
                                    : undefined
                                }
                              />
                            );
                          })}
                          {state.timeline.data &&
                            state.timeline.data.meta.page <
                              state.timeline.data.meta.last_page && (
                              <P06Button
                                label="Tải thêm giao dịch"
                                disabled={state.timeline.loading}
                                onPress={() => void flow.loadTimeline(true)}
                              />
                            )}

                        </>
                      )}
                    </>
                  )}
                </>
              )}

            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <BottomNav
        highlightScan
        activeKey="scan"
        layoutWidth={width}
        onSelect={key => {
          clearTimeout(timer.current);
          Keyboard.dismiss();
          if (key === 'home') onHome();
          else onSelectTab?.(key);
        }}
      />
      <Sheet
        visible={historyFilter && validScope}
        onDismiss={() => setHistoryFilter(false)}
        title="Bộ lọc lịch sử"
        keyboardLayout="viewport"
      >

        {(['ALL', 'LEDGER', 'WARRANTY'] as const).map(source => (
          <P06Button
            key={source}
            label={
              (source === historySource ? '✓ ' : '') +
              (source === 'ALL'
                ? 'Tất cả nguồn'
                : source === 'LEDGER'
                ? 'Sổ kho'
                : 'Bảo hành')
            }
            disabled={
              source === 'LEDGER'
                ? !context?.permissions.ledger
                : source === 'WARRANTY'
                ? !context?.permissions.warranty_view
                : !context?.permissions.ledger &&
                  !context?.permissions.warranty_view
            }
            onPress={() => setHistorySource(source)}
          />
        ))}
        <P06Button
          label="Áp dụng nguồn lịch sử"
          onPress={() => {
            setHistoryFilter(false);
            restore.current = undefined;
            scroll.current?.scrollTo({ y: 0, animated: false });
            void flow.setSource(historySource);
          }}
        />
        <P06Button label="Đóng" onPress={() => setHistoryFilter(false)} />
      </Sheet>
      <Sheet
        visible={filters && validScope}
        onDismiss={() => setFilters(false)}
        title="Bộ lọc tra cứu"
        keyboardLayout="viewport"
      >
        <Text style={s.text}>Tìm theo</Text>
        {(['keyword', 'item_code', 'serial'] as const).map(mode => (
          <P06Button
            key={mode}
            label={`${filterMode === mode ? '✓ ' : ''}${
              mode === 'keyword'
                ? 'Mã / tên SKU'
                : mode === 'item_code'
                ? 'Mã hiện vật chính xác'
                : 'Serial chính xác'
            }`}
            onPress={() => setFilterMode(mode)}
            disabled={mode !== 'keyword' && !context?.permissions.items}
          />
        ))}
        <Text style={s.text}>Trạng thái SKU</Text>
        {(['ACTIVE', 'INACTIVE', 'ALL'] as const).map(status => (
          <P06Button
            key={status}
            label={`${filterStatus === status ? '✓ ' : ''}${
              status === 'ACTIVE'
                ? 'Hoạt động'
                : status === 'INACTIVE'
                ? 'Ngừng hoạt động'
                : 'Tất cả'
            }`}
            onPress={() => setFilterStatus(status)}
          />
        ))}
        <P06Button
          label="Áp dụng bộ lọc"
          onPress={() => {
            clearTimeout(timer.current);
            setFilters(false);
            restore.current = undefined;
            scroll.current?.scrollTo({ y: 0, animated: false });
            void flow.setFilters(filterMode, filterStatus);
          }}
        />
        <P06Button label="Đóng" onPress={() => setFilters(false)} />
      </Sheet>
      <Sheet
        visible={Boolean(image) && validScope}
        onDismiss={() => setImage(undefined)}
        title="Ảnh sản phẩm"
      >
        <P06Photo
          image={image}
          width={Math.min(width - px(64), 400) / Math.min(1, width / 494)}
          height={320}
        />
        <P06Button label="Đóng ảnh" onPress={() => setImage(undefined)} />
      </Sheet>
      <Dialog
        visible={Boolean(readText) && validScope}
        title={readText?.title || ''}
        onDismiss={() => setReadText(undefined)}
        footer={
          <P06Button label="Đóng" onPress={() => setReadText(undefined)} />
        }
      >
        <Text selectable style={s.meta}>
          {readText?.text}
        </Text>
      </Dialog>
    </SafeAreaView>
  );
}
