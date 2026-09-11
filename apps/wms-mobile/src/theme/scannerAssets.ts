/**
 * Tài nguyên giao diện được người dùng cho phép lấy từ ScannerHNApp@90b0032.
 *
 * File ảnh và font được copy giữ nguyên byte vào `assets/`; manifest cạnh đó
 * là bằng chứng provenance/SHA-256. Chỉ các màn cần ảnh mới require chúng để
 * không ép toàn bộ bundle native tải ảnh nền ngay khi khởi động.
 */

import warehouseDark from '../../assets/scanner-approved/01_backgrounds/bg_warehouse_dark_v2_4k_enhanced.jpg';
import warehouseMain from '../../assets/scanner-approved/01_backgrounds/bg_warehouse_main_4k_enhanced.jpg';
import staffWarehouse from '../../assets/scanner-approved/02_people_staff/staff_warehouse_4k_enhanced.jpg';
import type { ImageSourcePropType } from 'react-native';

export const scannerAssets: {
  readonly warehouseDark: ImageSourcePropType;
  readonly warehouseMain: ImageSourcePropType;
  readonly staffWarehouse: ImageSourcePropType;
} = {
  warehouseDark,
  warehouseMain,
  staffWarehouse,
};
