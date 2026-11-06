import {SCANNER_ARIAL_FAMILY} from '../../theme/scannerTypography';
import {HN_UI,UI_KIT_COLORS} from '../../theme/uiKitV3';
import React, { useEffect, useRef, useState } from 'react';
import {ScannerTextInput as TextInput} from '../../ui/ScannerTextInput';
import {AppState,Image,PixelRatio,Platform,Pressable,ScrollView,StyleSheet,View} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import {SvgXml} from 'react-native-svg';
import { AppIcon, type AppIconName } from '../../ui/AppIcon';
import { useHardwareBack } from '../../app/useHardwareBack';
import { HnHomeIcon } from '../../ui/HnHomeIcon';
import { P18ReadableText } from './P18ReadableText';
import {
  closeP18Preview,
  openP18Preview,
  renderP18Page,
  type P18Page,
  type P18Preview,
} from '../../native/p18Preview';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HN_UI.canvas },
  header: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
    backgroundColor: HN_UI.primary,
  },
  title: {
    color: HN_UI.onBrand,
    flex: 1,
    fontSize: 23,
    lineHeight: 30,
    fontWeight: '700',
  },
  tap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flexWrap: 'wrap',
    padding: 4,
    backgroundColor: HN_UI.canvas,
  },
  page: {
    minWidth: 44,
    width: 64,
    height: 44,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 4,
    color: HN_UI.textPrimary,
  },
  body: { flex: 1, minHeight: 0 },
  canvas: { alignItems: 'center', flexGrow: 1 },
  content: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 10,
  },
  metadata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: HN_UI.surface,
    borderWidth: 1,
    borderColor: HN_UI.border,
  },
  fileTile: {
    width: 44,
    height: 48,
    borderRadius: 10,
    backgroundColor: HN_UI.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileTitle: { fontSize: 18, lineHeight: 26, fontWeight: '700' },
  hint: { color: HN_UI.textMuted, fontSize: 14, lineHeight: 21 },
  viewport: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: HN_UI.surfaceSunken,
    borderRadius: 8,
  },
  message: {
    padding: 18,
    gap: 14,
    backgroundColor: HN_UI.surface,
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 12,
    margin: 1,
  },
  messageTitle: {
    color: HN_UI.textPrimary,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
  },
  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, gap: 10 },
  fit: {
    minHeight: 44,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 9,
    justifyContent: 'center',
    backgroundColor: HN_UI.surface,
  },
  fitSelected: { backgroundColor: HN_UI.canvas, borderColor: HN_UI.borderControl },
});
export function P18ViewerScreen({
  name,
  ownerKey,
  load,
  isCurrent,
  onBack,
  onDownload,
  fileSize,
}: {
  name: string;
  ownerKey: string;
  load(signal: AbortSignal): Promise<{ blob: Blob; mime: string }>;
  isCurrent(): boolean;
  onBack(): void;
  /** Optional owner action; the caller must revalidate exact parent/file/ACL. */
  onDownload?: () => void;
  fileSize?: number | null;
}) {
  const loader = useRef(load),
    guard = useRef(isCurrent),
    back = useRef(onBack);
  loader.current = load;
  guard.current = isCurrent;
  back.current = onBack;
  const [revision, setRevision] = useState(0),
    [preview, setPreview] = useState<P18Preview>(),
    [image, setImage] = useState<P18Page>(),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1),
    [pageText, setPageText] = useState('1'),
    [zoom, setZoom] = useState(1),
    [mode, setMode] = useState<'width' | 'page'>('width');
  const [viewport, setViewport] = useState({ width: 320, height: 400 });
  const [textState,setTextState]=useState<{owner:string;page:number;text:string}>(),
    [textReaderOpen,setTextReaderOpen]=useState(false),
    [infoReaderOpen,setInfoReaderOpen]=useState(false);
  const activePageText=textState?.owner===ownerKey&&textState.page===page?textState.text:'';
  const vertical = useRef<React.ComponentRef<typeof ScrollView>>(null),
    horizontal = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useHardwareBack(() => {
    if(infoReaderOpen){setInfoReaderOpen(false);return true;}
    if(textReaderOpen&&activePageText){setTextReaderOpen(false);return true;}
    onBack();
    return true;
  });
  useEffect(()=>{
    let active=true;setTextState(undefined);setTextReaderOpen(false);setInfoReaderOpen(false);
    if(Platform.OS==='web'&&preview?.getText)void preview.getText(page).then(text=>{
      if(active&&guard.current())setTextState({owner:ownerKey,page,text});
    }).catch(()=>{});
    return()=>{active=false;};
  },[preview,page,ownerKey]);
  useEffect(() => {
    const c = new AbortController();
    let active = true,
      opened: P18Preview | undefined;
    setLoading(true);
    setError('');
    setPreview(undefined);
    setImage(undefined);
    setPage(1);
    setPageText('1');
    const current = () => active && !c.signal.aborted && guard.current();
    (async () => {
      try {
        const source = await loader.current(c.signal);
        if (!current()) return;
        opened = await openP18Preview(source.blob, source.mime, c.signal);
        if (!current()) {
          closeP18Preview(opened.id);
          return;
        }
        setPreview(opened);
        if (opened.uri) {
          setImage({
            uri: opened.uri,
            width: opened.width,
            height: opened.height,
          });
          setLoading(false);
        }
      } catch (cause) {
        if (current()) {
          setError((cause as Error).message);
          setLoading(false);
        }
      }
    })();
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') back.current();
    });
    return () => {
      active = false;
      c.abort();
      if (opened) closeP18Preview(opened.id);
      subscription.remove();
    };
  }, [ownerKey, revision]);
  useEffect(() => {
    if (!preview || preview.mime !== 'application/pdf') return;
    let active = true;
    setLoading(true);
    setError('');
    setImage(undefined);
    renderP18Page(preview, page, viewport.width * PixelRatio.get() * zoom)
      .then(result => {
        if (active && guard.current()) {
          setImage(result);
          setLoading(false);
        }
      })
      .catch(cause => {
        if (active && guard.current()) {
          setError((cause as Error).message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [preview, page, viewport.width, zoom]);
  useEffect(() => {
    vertical.current?.scrollTo({ y: 0, animated: false });
    horizontal.current?.scrollTo({ x: 0, animated: false });
  }, [page, mode]);
  const changePage = (next: number) => {
    if (
      preview &&
      Number.isInteger(next) &&
      next >= 1 &&
      next <= preview.pages &&
      !loading
    ) {
      setPage(next);
      setPageText(String(next));
    } else setPageText(String(page));
  };
  const icon = (
    nameValue: AppIconName,
    label: string,
    action: () => void,
    disabled = false,
    light = false,
  ) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={[styles.tap,Platform.OS==='web'&&(nameValue==='zoom-in'||nameValue==='zoom-out')&&{borderWidth:1,borderColor:HN_UI.border,borderRadius:8,backgroundColor:HN_UI.surface},Platform.OS==='web'&&!light&&(nameValue==='chevron-left'||nameValue==='chevron-right')&&{borderWidth:1,borderColor:HN_UI.border,borderRadius:22,backgroundColor:HN_UI.surface},disabled&&!light&&{backgroundColor:HN_UI.disabled,borderColor:UI_KIT_COLORS['action.disabled.border']}]}
      onPress={() => {
        if (!disabled) action();
      }}
    >
      {Platform.OS==='web'&&(nameValue==='zoom-in'||nameValue==='zoom-out')?<SvgXml width={24} height={24} xml={'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="'+(disabled?HN_UI.disabledForeground:HN_UI.textLink)+'" stroke-width="2" stroke-linecap="round"><path d="M5 12h14'+(nameValue==='zoom-in'?'M12 5v14':'')+'"/></svg>'}/>:<AppIcon
        name={nameValue}
        color={disabled ? HN_UI.disabledForeground : light ? HN_UI.onBrand : HN_UI.textPrimary}
        size={22}
      />}
    </Pressable>
  );
  const ready = !!preview && !!image && !loading && !error;
  const bytes =
    preview?.bytes ??
    (Number.isSafeInteger(fileSize) && Number(fileSize) > 0 ? fileSize : null);
  const sizeText = bytes
    ? (bytes / 1024).toFixed(1) + ' KiB'
    : 'Chưa xác minh kích thước';
  const ratio = image ? image.height / image.width : 1;
  const fitted =
    mode === 'page'
      ? Math.min(viewport.width, viewport.height / ratio)
      : viewport.width;
  const width = Math.max(1, fitted * zoom),
    height = Math.max(1, width * ratio);
  const downloadAction=<Button label="Tải xuống" disabled={!ready||!onDownload} onPress={()=>{if(ready&&guard.current())onDownload?.();}} style={Platform.OS==='web'?{flex:1,minHeight:56,borderRadius:9,borderWidth:0,backgroundColor:HN_UI.primary}:undefined} labelStyle={Platform.OS==='web'?{fontSize:17,lineHeight:24,fontWeight:'700'}:undefined} leading={Platform.OS==='web'?<SvgXml width={24} height={24} xml={'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="'+(!ready||!onDownload?HN_UI.disabledForeground:HN_UI.onBrand)+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4"/></svg>'}/>:undefined}/>;
  return (
    <SafeAreaView
      style={[styles.root,Platform.OS==='web'&&{backgroundColor:HN_UI.canvas}]}
      testID="P18.S02"
      edges={['top', 'bottom']}
    >
      <View style={styles.header}>
        {icon('chevron-left', 'Về tài liệu', onBack, false, true)}
        <Text style={styles.title} accessibilityRole="header">
          Xem tài liệu
        </Text>
      </View>
      <View style={[styles.content,Platform.OS==='web'&&{paddingBottom:8}]}>
        <View style={[styles.metadata,Platform.OS==='web'&&{paddingVertical:12}]}>
          <View style={[styles.fileTile,Platform.OS==='web'&&{width:54,height:62}]}>
            <HnHomeIcon name="document" size={26} color={HN_UI.danger} />
          </View>
          <View key={ownerKey} style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <P18ReadableText
              label="Tên tài liệu"
              value={name}
              style={styles.fileTitle}
            />
            <Text style={styles.hint}>{sizeText}</Text>
          </View>
        </View>
        <View style={[styles.toolbar,Platform.OS==='web'&&{justifyContent:'flex-start',flexWrap:'nowrap',gap:6,padding:0}]}>
          {icon(
            'zoom-out',
            'Thu nhỏ',
            () => setZoom(value => Math.max(Platform.OS==='web'?0.5:0.25, value - 0.25)),
            !ready || zoom <= (Platform.OS==='web'?0.5:0.25),
          )}
          <Text style={Platform.OS==='web'?{minWidth:42,fontSize:14,textAlign:'center',color:HN_UI.textMuted}:undefined}>{Math.round(zoom * 100)}%</Text>
          {icon(
            'zoom-in',
            'Phóng to',
            () => setZoom(value => Math.min(Platform.OS==='web'?2.5:3, value + 0.25)),
            !ready || zoom >= (Platform.OS==='web'?2.5:3),
          )}
          {Platform.OS==='web'?<>
            <View style={{flex:1,minWidth:0}}><select aria-label="Chế độ hiển thị" disabled={!ready} value={zoom===1?mode:'custom'} onChange={event=>{if(!ready)return;const value=(event.currentTarget as unknown as {value:unknown}).value;if(value!=='page'&&value!=='width')return;setMode(value);setZoom(1);}} style={{width:'100%',height:44,fontFamily:SCANNER_ARIAL_FAMILY,fontSize:14,color:ready?HN_UI.textPrimary:HN_UI.disabledForeground,border:`1px solid ${ready?HN_UI.inputBorder:UI_KIT_COLORS['action.disabled.border']}`,borderRadius:8,background:ready?HN_UI.input:HN_UI.disabled,padding:'0 8px'}}><option value="width">Vừa chiều rộng</option><option value="page">Vừa trang</option><option value="custom" disabled>Thu/phóng tự chọn</option></select></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Đọc văn bản trang PDF" disabled={!ready||!activePageText.trim()} accessibilityState={{disabled:!ready||!activePageText.trim()}} onPress={()=>{if(ready&&guard.current()&&activePageText.trim()){setInfoReaderOpen(false);setTextReaderOpen(true);}}} style={{minWidth:68,height:44,borderWidth:1,borderColor:HN_UI.border,borderRadius:9,alignItems:'center',justifyContent:'center',paddingHorizontal:9,backgroundColor:ready&&activePageText.trim()?HN_UI.surface:HN_UI.disabled,opacity:1}}><Text style={{fontSize:14,color:ready&&activePageText.trim()?HN_UI.textLink:HN_UI.disabledForeground}}>Văn bản</Text></Pressable>
          </>:(['width', 'page'] as const).map(value => (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ checked: mode === value, disabled: !ready }}
              accessibilityLabel={
                value === 'width' ? 'Vừa chiều rộng' : 'Vừa trang'
              }
              style={[
                styles.fit,
                mode === value && styles.fitSelected,
                !ready && { opacity: 0.5 },
              ]}
              disabled={!ready}
              onPress={() => {
                if (!ready) return;
                setMode(value);
                setZoom(1);
              }}
            >
              <Text style={{ color: HN_UI.textLink, fontSize: 14 }}>
                {value === 'width' ? 'Vừa chiều rộng' : 'Vừa trang'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View
          style={styles.viewport}
          onLayout={event => {
            const { width: w, height: h } = event.nativeEvent.layout;
            if (w > 0 && h > 0) setViewport({ width: w, height: h });
          }}
        >
          {loading || error ? (
            <View style={styles.message}>
              {loading ? (
                <Text accessibilityLiveRegion="polite">Đang đọc tài liệu…</Text>
              ) : (
                <>
                  <Text style={styles.messageTitle}>
                    Không xem được tài liệu
                  </Text>
                  <Text
                    tone="danger"
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                  >
                    {error}
                  </Text>
                  <Text style={styles.hint}>
                    Về màn tài liệu để kiểm tra nguồn tệp và quyền xem.
                  </Text>
                  <Button
                    label="Đọc lại tài liệu"
                    onPress={() => setRevision(value => value + 1)}
                  />
                </>
              )}
            </View>
          ) : null}
          {image ? (
            <ScrollView
              ref={vertical}
              style={styles.body}
              contentContainerStyle={styles.canvas}
            >
              <ScrollView
                ref={horizontal}
                horizontal
                nestedScrollEnabled
                style={{
                  width: viewport.width,
                  height,
                  flexGrow: 0,
                  flexShrink: 0,
                }}
                contentContainerStyle={{
                  width: Math.max(viewport.width, width),
                  height,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Image
                  accessibilityLabel={'Trang ' + page + ' · ' + name}
                  source={{ uri: image.uri }}
                  style={{ width, height }}
                  resizeMode="contain"
                  resizeMethod="resize"
                  onError={() => {
                    setImage(undefined);
                    setError('Chưa hiển thị được trang tài liệu.');
                  }}
                />
              </ScrollView>
            </ScrollView>
          ) : null}
        </View>
      </View>
      <View style={[styles.footer,Platform.OS==='web'&&{paddingTop:14,paddingBottom:20,gap:12,backgroundColor:HN_UI.canvas}]}>
        <View style={[styles.toolbar,Platform.OS==='web'&&{padding:0,gap:10,minHeight:44}]}>
          {icon(
            'chevron-left',
            'Trang trước',
            () => changePage(page - 1),
            !ready || page <= 1,
          )}
          {Platform.OS==='web'?<Text accessibilityRole="status" accessibilityLiveRegion="polite" style={{minWidth:80,paddingVertical:7,paddingHorizontal:12,textAlign:'center',backgroundColor:HN_UI.selected,borderRadius:30,fontSize:16,lineHeight:24}}>{preview?page+' / '+preview.pages:'Đang tải'}</Text>:<><TextInput
            accessibilityLabel="Trang tài liệu"
            style={styles.page}
            value={preview ? pageText : ''}
            placeholder="—"
            keyboardType="number-pad"
            editable={ready}
            maxLength={5}
            onChangeText={setPageText}
            onSubmitEditing={() => changePage(Number(pageText))}
            onEndEditing={() => changePage(Number(pageText))}
          />
          <Text accessibilityLiveRegion="polite">
            / {preview?.pages ?? '—'}
          </Text>
          </>}
          {icon(
            'chevron-right',
            'Trang sau',
            () => changePage(page + 1),
            !ready || !preview || page >= preview.pages,
          )}
        </View>
        {Platform.OS==='web'?<View style={{flexDirection:'row',alignItems:'center',gap:12,minHeight:56}}>{downloadAction}<Pressable accessibilityRole="button" accessibilityLabel="Thông tin tài liệu" onPress={()=>{if(guard.current()){setTextReaderOpen(false);setInfoReaderOpen(true);}}} style={{width:44,height:44,alignItems:'center',justifyContent:'center',backgroundColor:HN_UI.surface,borderWidth:1,borderColor:HN_UI.border,borderRadius:9}}><SvgXml width={24} height={24} xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${HN_UI.primary}"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>`}/></Pressable></View>:downloadAction}
        {!onDownload ? (
          <Text style={styles.hint}>Bạn có thể tải tệp từ màn tài liệu.</Text>
        ) : null}
      </View>
      {Platform.OS==='web'?<Dialog visible={textReaderOpen&&!!activePageText&&guard.current()} title={'Văn bản · Trang '+page+' / '+(preview?.pages??'—')} message={activePageText} onDismiss={()=>setTextReaderOpen(false)}><Button label="Đóng" onPress={()=>setTextReaderOpen(false)}/></Dialog>:null}
      {Platform.OS==='web'?<Dialog visible={infoReaderOpen&&guard.current()} title="Thông tin tài liệu" message={'Tên tệp: '+name+'\nLoại tệp: '+(preview?.mime??'Chưa xác minh')+'\nKích thước: '+sizeText+'\nSố trang: '+(preview?.pages??'Chưa xác minh')} onDismiss={()=>setInfoReaderOpen(false)}><Button label="Đóng" onPress={()=>setInfoReaderOpen(false)}/></Dialog>:null}
    </SafeAreaView>
  );
}
