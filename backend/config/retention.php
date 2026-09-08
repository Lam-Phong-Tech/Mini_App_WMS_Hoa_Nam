<?php

/*
|--------------------------------------------------------------------------
| Data retention (BACKEND_RETENTION_HOTFIX)
|--------------------------------------------------------------------------
|
| Khắc phục nguy cơ tăng dữ liệu không giới hạn của `zalo_webhook_events`
| và `warehouse_scans`.
|
| ⚠️ MẶC ĐỊNH TẮT HOÀN TOÀN. Không có thời hạn retention nào được đặt sẵn.
| Chủ sở hữu dữ liệu phải phê duyệt chính sách trước khi bật.
|
| Mọi giá trị `*_retention_days` mặc định là NULL = tác vụ đó bị vô hiệu hoá.
|
*/

return [

    /*
    | Công tắc tổng. Phải bật tường minh mới chạy được scheduler.
    | Command vẫn chạy được ở chế độ dry-run khi tắt, để kiểm tra chính sách.
    */
    'enabled' => env('RETENTION_ENABLED', false),

    /*
    | Timezone dùng để canh giờ chạy scheduler (ngoài giờ cao điểm kho).
    | config('app.timezone') đang là UTC nên cần timezone riêng cho vận hành VN.
    */
    'timezone' => env('RETENTION_TIMEZONE', 'Asia/Ho_Chi_Minh'),

    /*
    | Giờ chạy hằng ngày theo `timezone` ở trên, định dạng HH:MM.
    */
    'schedule_at' => env('RETENTION_SCHEDULE_AT', '02:30'),

    /*
    | Số bản ghi mỗi lô. Xử lý theo chunk dựa trên khoá chính để tránh
    | khoá bảng lâu và tránh nạp toàn bảng vào bộ nhớ.
    */
    'chunk_size' => (int) env('RETENTION_CHUNK_SIZE', 500),

    /*
    | Trần tuyệt đối số bản ghi được xử lý trong MỘT lượt chạy, tính chung
    | cho mọi tác vụ. Giữ cho mỗi lượt chạy có thời lượng dự đoán được.
    */
    'max_rows_per_run' => (int) env('RETENTION_MAX_ROWS_PER_RUN', 10000),

    'zalo_webhook_events' => [

        /*
        | Tầng 1 — DỌN PAYLOAD (giữ nguyên dòng, chỉ xoá 2 blob JSON).
        |
        | Bằng chứng an toàn: `raw_payload` và `normalized_payload` được GHI tại
        | ZaloWebhookController.php:68-69 và KHÔNG được đọc ở bất kỳ đâu trong
        | backend/ (đã grep app/, routes/, tests/). Xoá chúng không đổi hành vi
        | ứng dụng, trong khi thu hồi phần lớn dung lượng.
        |
        | Toàn bộ metadata/audit (event_key, status, msg_id, tracking_id,
        | user_id, thời gian…) được GIỮ VĨNH VIỄN.
        */
        'payload_retention_days' => env('ZALO_WEBHOOK_PAYLOAD_RETENTION_DAYS'),

        /*
        | Tầng 2 — XOÁ DÒNG. Chỉ dùng khi chủ sở hữu dữ liệu chấp nhận mất
        | hoàn toàn bản ghi sự kiện. Phải LỚN HƠN payload_retention_days.
        */
        'row_retention_days' => env('ZALO_WEBHOOK_RETENTION_DAYS'),

        /*
        | Chỉ những status ĐÃ ĐƯỢC SOURCE CHỨNG MINH là trạng thái kết thúc.
        | Nguồn: ZaloWebhookController::getEventSemantics() — 6 giá trị có thể có.
        |
        | CỐ Ý LOẠI TRỪ:
        |   - 'other_event' : sự kiện không nhận diện được => "chưa xác định
        |                     trạng thái", không đủ căn cứ để xử lý.
        |   - NULL          : không xác định.
        |
        | Bảng này KHÔNG có cột trạng thái xử lý nội bộ: mọi dòng tồn tại đều là
        | dòng đã ghi thành công (lỗi ghi trả 500 và KHÔNG tạo dòng nào).
        | Do đó không tồn tại dòng pending/failed/retrying trong bảng này.
        */
        'terminal_statuses' => [
            'delivered',           // ZNS đã tới thiết bị
            'received',            // user nhận tin OA
            'seen',                // user đã xem tin OA
            'oa_sent',             // OA đã gửi tin
            'inbound_user_event',  // user tương tác với OA
        ],
    ],

    'warehouse_scans' => [

        /*
        | CHỈ dọn payload. KHÔNG BAO GIỜ xoá dòng.
        |
        | Bằng chứng: `warehouse_scans` là audit trail nghiệp vụ kho. Endpoint
        | xoá lịch sử đã bị khoá vĩnh viễn bằng HTTP 403
        | `AUDIT_DELETE_REVIEW_REQUIRED` (WarehouseScanController.php:158-165)
        | => chủ hệ thống đã tường minh coi bảng này là bất biến.
        |
        | Bằng chứng an toàn cho việc dọn `response_payload`:
        |   1. Chỉ được GHI (WarehouseScanController.php:93), KHÔNG được đọc ở đâu.
        |   2. Tái tạo được 100% từ các cột đã có: historyPayload() (:267-307)
        |      dựng lại đúng cấu trúc đó từ cột, không hề đọc response_payload.
        | => Dọn là mất mát BẰNG KHÔNG về mặt hành vi ứng dụng.
        */
        'payload_retention_days' => env('WAREHOUSE_SCAN_PAYLOAD_RETENTION_DAYS'),

        /*
        | Chỉ dọn payload của dòng đã ở trạng thái kết thúc.
        | PENDING_APPROVAL bị loại trừ tuyệt đối — đó là việc chưa xử lý xong.
        | Nguồn: WarehouseScan::STATUS_APPROVED / STATUS_PENDING_APPROVAL.
        */
        'compactable_statuses' => ['APPROVED'],

        /*
        | KHOÁ CỨNG. Không đọc từ env. Việc xoá dòng khỏi audit trail nghiệp vụ
        | chưa được chứng minh là an toàn, nên không được phép bằng cấu hình.
        | Muốn đổi phải sửa code và qua một cổng phê duyệt riêng.
        */
        'allow_row_deletion' => false,
    ],
];
