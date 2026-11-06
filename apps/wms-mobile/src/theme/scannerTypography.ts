import {Platform} from 'react-native';

/** UI Kit v3 p4: same Inter family for VI/EN on Web and Android.
 * Historical export name is retained for source compatibility. */
export const SCANNER_ARIAL_FAMILY: string | undefined =
  Platform.OS === 'android' || Platform.OS === 'web' ? 'Inter' : undefined;
