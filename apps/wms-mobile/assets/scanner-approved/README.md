# Hoa Nam Scanner — bộ ảnh thay thế do người dùng cung cấp

## Bản hiện hành

Bộ ảnh này thay thế bộ extract/upscale cũ. Nguồn là thư mục `scanner-background-pack-v2-4k` người dùng gửi; giữ nguyên tên file, định dạng và từng byte ảnh. Không chỉnh sửa, resize hoặc nén lại trong bước publish.

- `01_backgrounds/`: 5 ảnh nền kho, JPG 3840×2160.
- `02_people_staff/`: 3 ảnh nhân sự, JPG 3840×2160.
- `03_overlays_gradients/`: 6 PNG có alpha. Hero/light: 3840×2160; top/bottom: 3744×3840; full: 1774×3840; right: 1820×3840.
- `ASSET_MANIFEST.json`: tên file, kích thước đo thực tế, dung lượng, alpha và SHA-256.
- `SOURCE_APPROVED_ASSET_SHEET.png`: contact sheet để đối chiếu, không dùng làm ảnh nền trong app.

Tên `4K` mô tả kích thước file. Bộ bàn giao không xác nhận ảnh được chụp hoặc tạo ở độ phân giải native 4K. Kỹ thuật enhance của file người dùng cung cấp không được xác minh ở bước publish.

## Dùng file mới

Ví dụ khi file CSS ở cùng cấp các thư mục ảnh:

```css
.screen-hero {
  background-image:
    url('./03_overlays_gradients/overlay_hero_4k.png'),
    url('./01_backgrounds/bg_warehouse_main_4k_enhanced.jpg');
  background-position: center;
  background-size: cover;
}

.shift-hero {
  background-image:
    url('./03_overlays_gradients/overlay_right_4k.png'),
    url('./02_people_staff/staff_warehouse_4k_enhanced.jpg');
  background-position: center;
  background-size: cover;
}
```

Dùng `bg_warehouse_dark_v2_4k_enhanced.jpg` cho nền tối và `bg_warehouse_light_v2_4k_enhanced.jpg` cho nền sáng. `bg_warehouse_blur_4k_enhanced.jpg` là biến thể nền mờ; không dùng để thay backdrop modal theo thời gian thực.

Ảnh và ZIP cũ đã được thay khỏi bộ hiện hành; có thể truy xuất lại qua lịch sử Git trước commit thay thế. Các board thiết kế và baseline App không được sửa trong lần bàn giao asset này.
