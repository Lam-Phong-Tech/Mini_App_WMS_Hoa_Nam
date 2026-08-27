import type { ScanRequest, ScanResponse } from "@/types/scan.types";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function submitMockScan(
  request: ScanRequest,
): Promise<ScanResponse> {
  await delay(request.code === "TIMEOUT" ? 1600 : 550);

  switch (request.code) {
    case "NOT-FOUND":
      return {
        success: false,
        message: "Không tìm thấy mã trong dữ liệu mock.",
        error_code: "BARCODE_NOT_FOUND",
      };
    case "DUPLICATE":
      return {
        success: false,
        message: "Mã đã được quét trong chứng từ mock.",
        error_code: "ITEM_ALREADY_SCANNED",
      };
    case "WRONG-SKU":
      return {
        success: false,
        message: "SKU không nằm trong danh sách cần xử lý.",
        error_code: "SKU_NOT_REQUIRED",
      };
    case "LINE-FULL":
      return {
        success: false,
        message: "Dòng hàng đã đủ số lượng.",
        error_code: "LINE_ALREADY_FULL",
      };
    case "NETWORK-ERROR":
      throw new Error("NETWORK_ERROR");
    case "TIMEOUT":
      throw new Error("REQUEST_TIMEOUT");
    default:
      return {
        success: true,
        message: "Mock API đã ghi nhận mã quét thành công.",
        data: {
          product: {
            product_id: 101,
            sku_code: "SKU-BK-001",
            product_name: "Máy lọc nước demo",
            item_id: 9001,
            item_code: request.code,
            serial_no: `SN-${request.code}`,
            warehouse_name: "Kho trung tâm",
          },
          required_qty: 10,
          scanned_qty: Math.max(1, request.quantity),
          remaining_qty: Math.max(0, 10 - Math.max(1, request.quantity)),
          matched: true,
        },
      };
  }
}
