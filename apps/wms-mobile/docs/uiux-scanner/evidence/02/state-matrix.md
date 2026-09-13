# State matrix — Prompt 02 Home

| State | Entry / data | Visible result | Verified exit |
| --- | --- | --- | --- |
| Loading | Session valid, Home reads summary | KPI is unavailable while loading; list says `Đang tải chứng từ…` | Request resolves to ready/error |
| Ready | WMS inbound/outbound/warranty reads succeed | Real KPI and recent documents; no fabricated `0` | CTA navigation below |
| Empty | WMS returns no recent documents | `Chưa có chứng từ nào` and explanatory hint | `Xem tất cả` still opens documents |
| Error | Home read fails | Error banner + `Thử lại`; prior successful snapshot remains | Retry reloads the same data source |
| Inbound CTA | `Nhập kho` | `InboundFlow`, first screen `Tạo phiếu nhập` | Back returns Home without write |
| Outbound CTA | `Xuất kho` | `OutboundFlow`, first screen `Thông tin xuất kho` | Back returns Home without write |
| Warranty CTA | `Bảo hành` | Warranty list / intake entry | Back returns Home without write |
| NFC CTA | `Thẻ NFC` | NFC assignment entry | Back returns Home without write |
| Scan CTA | `Quét hoặc nhập mã sản phẩm` | Read-only lookup scanner | Back returns Home without write |
| Documents CTA | `Xem tất cả` or Chứng từ tab | HistoryScreen with `Theo chứng từ` | Opens document detail by kind/id |
| Avatar | Header avatar | Existing Cá nhân screen | Existing back/tab route |

## Home icon mapping

| Business entry | Icon | Color treatment |
| --- | --- | --- |
| Nhập kho | `inbound` — carton/box | Amber on selected teal tile |
| Xuất kho | `outbound` — upward arrow | Blue on pale tile |
| Bảo hành | `warranty` — wrench | Blue on pale tile |
| Thẻ NFC | `nfc` — radio/NFC waves | Blue on pale tile |
| Scan | `scan` — scan corners | White on teal CTA/dock |
| Chứng từ | `document` — clipboard document | Nav color |
| Cá nhân | `user` — person | Nav color |

The notification bell has no unread counter: notifications have no confirmed
Home source, so a fixed red `3` would be fabricated data.
