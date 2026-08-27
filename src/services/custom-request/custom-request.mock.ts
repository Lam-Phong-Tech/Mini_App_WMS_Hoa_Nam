import { CustomFlowerRequest } from "@/types/custom-request.types";

export const mockCustomFlowerRequests: CustomFlowerRequest[] = [
  {
    id: "req-001",
    requestCode: "YCTK-20260728-001",
    status: "WAITING_CUSTOMER_CONFIRMATION",
    occasion: "Kỷ niệm ngày cưới",
    recipient: "Vợ",
    budget: "800.000 - 1.000.000đ",
    flowerType: "Hồng đỏ, lá bạc",
    colorPreference: "Đỏ - trắng",
    stylePreference: "Sang trọng, cổ điển",
    size: "Vừa",
    referenceImages: [
      "https://images.unsplash.com/photo-1526047932273-341f2a7631f9?w=400&q=80&auto=format&fit=crop",
    ],
    cardMessage: "Cảm ơn em vì 5 năm bên anh. Yêu em!",
    deliveryDate: "2026-08-10",
    deliveryTimeSlot: "14:00 - 16:00",
    deliveryAddress: "12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh",
    specialRequest: "Không dùng hoa cẩm chướng",
    quotes: [
      {
        id: "quote-001",
        createdAt: "2026-07-29T09:15:00",
        price: 950000,
        etaLabel: "Hoàn thành trong 4 giờ",
        note: "Phối hồng đỏ Ecuador cùng lá bạc, gói giấy nhung đỏ đô.",
        sampleImage:
          "https://images.unsplash.com/photo-1591886960571-74d43a9d4166?w=600&q=80&auto=format&fit=crop",
      },
    ],
    createdAt: "2026-07-28T10:00:00",
    updatedAt: "2026-07-29T09:15:00",
  },
  {
    id: "req-002",
    requestCode: "YCTK-20260715-004",
    status: "CONVERTED_TO_ORDER",
    occasion: "Khai trương",
    recipient: "Đối tác",
    budget: "1.500.000 - 2.000.000đ",
    flowerType: "Hướng dương, lan hồ điệp",
    colorPreference: "Vàng - trắng",
    stylePreference: "Nổi bật, trang trọng",
    size: "Lớn",
    referenceImages: [],
    deliveryDate: "2026-07-20",
    deliveryTimeSlot: "08:00 - 10:00",
    deliveryAddress: "45 Lê Lợi, Quận 1, TP. Hồ Chí Minh",
    quotes: [
      {
        id: "quote-002",
        createdAt: "2026-07-16T11:00:00",
        price: 1850000,
        etaLabel: "Hoàn thành trong 1 ngày",
        note: "Kệ hoa 2 tầng, dải băng in chữ theo yêu cầu.",
      },
    ],
    convertedOrderId: "order-001",
    createdAt: "2026-07-15T08:30:00",
    updatedAt: "2026-07-17T09:00:00",
  },
];

export function generateRequestCode(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const seq = String(Math.floor(Math.random() * 900) + 100);
  return `YCTK-${date}-${seq}`;
}
