import {HN_UI} from '../../theme/uiKitV3';
import {createContext,useContext} from 'react';
import {StyleSheet} from 'react-native';
import {SCANNER_COLORS} from '../../ui/ScannerPalette';

/** Scoped to the three P04 panels selected by the user on03/11/2026. */
export const P04AssetContext=createContext(false);
export const useP04AssetTheme=()=>useContext(P04AssetContext);
export const P04_ASSET={
  metadataInk:SCANNER_COLORS.metadata,metadataSoft:SCANNER_COLORS.metadataSoft,scanInk:SCANNER_COLORS.onBrand,
  primary:SCANNER_COLORS.primary,secondary:SCANNER_COLORS.secondary,secondaryBorder:SCANNER_COLORS.secondaryBorder,
  productInk:HN_UI.textMuted,productSoft:SCANNER_COLORS.productPlaceholder,
  metadataIcon:20,sectionIcon:26,productIcon:24,
} as const;
export const p04Asset=StyleSheet.create({
  primary:{minHeight:52,borderRadius:10,backgroundColor:P04_ASSET.primary,backgroundImage:'none',paddingVertical:10},
  secondary:{minHeight:52,borderRadius:10,backgroundColor:P04_ASSET.secondary,borderColor:P04_ASSET.secondaryBorder,backgroundImage:'none',paddingVertical:10},
  tool:{minHeight:46,borderRadius:8,backgroundColor:P04_ASSET.metadataSoft,borderColor:HN_UI.border},
  toolLabel:{color:P04_ASSET.primary,fontSize:14,lineHeight:20},
  metadataTile:{width:32,height:32,borderRadius:8,backgroundColor:P04_ASSET.metadataSoft},
  metadataRow:{minHeight:52,gap:10},
  sectionTile:{width:44,height:44,borderRadius:10,backgroundColor:SCANNER_COLORS.scan,backgroundImage:'none'},
  productTile:{width:40,height:40,borderRadius:8,backgroundColor:P04_ASSET.productSoft},
});
