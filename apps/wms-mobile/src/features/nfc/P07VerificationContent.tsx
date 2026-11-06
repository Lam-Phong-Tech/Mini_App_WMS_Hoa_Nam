import React from 'react';
import {ActivityIndicator,StyleSheet,View} from 'react-native';
import {ScannerNativeText as Text} from '../../ui/ScannerNativeText';
import {ScannerIcon} from '../../ui/ScannerIcon';
import {HN_UI} from '../../theme/uiKitV3';
import {HN_OPERATIONS} from '../../ui/hnHomeTokens';
import {p07} from './P07Frame';

const styles=StyleSheet.create({
  section:{gap:0},
  tagTile:{width:56,height:56,borderRadius:12,backgroundColor:HN_OPERATIONS.nfc.soft,alignItems:'center',justifyContent:'center'},
  status:{padding:12,gap:8},
  statusRow:{flexDirection:'row',alignItems:'center',gap:12},
  dot:{width:12,height:12,borderRadius:6,backgroundColor:HN_UI.warning},
});
/** Shared actual S03 presenter. Eligibility, journal/UNKNOWN and commands remain
 * in P07NativeFlow; the capture renderer consumes this same presentation. */
export function P07VerificationContent({uid,verified,tagDetails,product,warehouse,statusLabel,message,busy=false,tone='warning'}:{
  uid:string;verified:boolean;tagDetails:React.ReactNode;product:React.ReactNode;warehouse:React.ReactNode;
  statusLabel:string;message:string;busy?:boolean;tone?:'warning'|'danger'|'info';
}):React.ReactElement{const ink=HN_UI[tone],soft=HN_UI[tone==='danger'?'dangerSoft':tone==='info'?'infoSoft':'warningSoft'];return <>
  <View style={[p07.card,styles.section]} testID="P07.verify.tag">
    <Text style={p07.heading}>Thông tin thẻ NFC</Text>
    <View style={[p07.inset,p07.row]}>
      <View style={styles.tagTile}><ScannerIcon name="nfc" size={24} color={HN_OPERATIONS.nfc.ink}/></View>
      <View style={p07.rowBody}><Text style={p07.strong}>{uid}</Text><Text style={p07.hint}>Đã đọc từ thẻ NFC</Text></View>
      <Text style={[p07.badge,verified?p07.successBadge:p07.warningBadge]}>{verified?'Hợp lệ':'Cần đối chiếu'}</Text>
    </View>
    {tagDetails}
  </View>
  <View style={p07.card} testID="P07.verify.product"><Text style={p07.heading}>Thông tin sản phẩm</Text>{product}</View>
  {warehouse}
  <View style={p07.card} testID="P07.verify.status"><Text style={p07.heading}>Trạng thái liên kết</Text>
    <View style={styles.status}><View style={styles.statusRow}><View style={[styles.dot,{backgroundColor:ink}]}/><Text style={[p07.badge,{color:ink,backgroundColor:soft,alignSelf:'flex-start',flexShrink:1}]}>{statusLabel}</Text></View>
      <Text style={p07.hint}>{message}</Text>{busy?<ActivityIndicator color={HN_UI.primary}/>:null}
    </View>
  </View>
</>;}
