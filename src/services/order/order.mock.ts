import { Order } from "../../types/order.types";

export const mockOrders: Order[] = [
  {
    id: "order-001",
    orderCode: "ORD-20260106-001",
    deliveryType: "delivery",
    deliveryTypeLabel: "Giao hàng",
    state: "delivering",
    stateLabel: "Đang giao hàng",
    items: [
      {
        id: "item-001",
        name: "Bó Hồng Đỏ Đam Mê",
        quantity: 1,
        price: 450000,
        image:
          "https://images.unsplash.com/photo-1526047932273-341f2a7631f9?w=400&q=80&auto=format&fit=crop",
        note: "Yêu em nhiều!",
        options: [
          { name: "Kích thước", value: "Vừa", price: 80000 },
          { name: "Giấy gói", value: "Giấy Hàn Quốc", price: 0 },
        ],
      },
      {
        id: "item-002",
        name: "Thiệp Chúc Mừng Viết Tay",
        quantity: 1,
        price: 20000,
        image:
          "https://images.unsplash.com/photo-1520763185298-1b434c919102?w=400&q=80&auto=format&fit=crop",
      },
    ],
    createdAt: new Date("2026-01-06T08:30:00"),
    updatedAt: new Date("2026-01-06T08:35:00"),
    estimatedTime: new Date("2026-01-06T09:15:00"),
    totalAmount: 545000,
    payment: {
      method: "cash",
      subtotal: 550000,
      shippingFee: 25000,
      discount: 30000,
      total: 545000,
      status: "pending",
    },
    deliveryAddress: {
      recipientName: "Nguyễn Thị B",
      phoneNumber: "0901234567",
      address: "123 Đường Lê Lợi",
      ward: "Phường Bến Nghé",
      district: "Quận 1",
      city: "TP. Hồ Chí Minh",
      note: "Gọi điện trước khi giao",
    },
    canReorder: true,
    canPickup: false,
    canCancel: false,
  },
  {
    id: "order-002",
    orderCode: "ORD-20260105-042",
    deliveryType: "pickup",
    deliveryTypeLabel: "Tự đến lấy",
    state: "ready",
    stateLabel: "Sẵn sàng lấy hàng",
    items: [
      {
        id: "item-003",
        name: "Hộp Hoa Hồng Đỏ Vĩnh Cửu Mini",
        quantity: 1,
        price: 550000,
        image:
          "https://images.unsplash.com/photo-1591886960571-74d43a9d4166?w=400&q=80&auto=format&fit=crop",
        options: [
          { name: "Kích thước", value: "Nhỏ", price: 0 },
          { name: "Màu sắc", value: "Đỏ", price: 0 },
        ],
      },
      {
        id: "item-004",
        name: "Cuộn Ruy Băng Lụa Cao Cấp",
        quantity: 1,
        price: 35000,
        image:
          "https://images.unsplash.com/photo-1512909006721-3d6018887383?w=400&q=80&auto=format&fit=crop",
      },
    ],
    createdAt: new Date("2026-01-05T14:20:00"),
    updatedAt: new Date("2026-01-05T14:35:00"),
    estimatedTime: new Date("2026-01-05T15:00:00"),
    totalAmount: 580000,
    payment: {
      method: "zalopay",
      subtotal: 585000,
      shippingFee: 0,
      discount: 5000,
      total: 580000,
      status: "paid",
    },
    pickupStore: {
      id: "store-001",
      name: "Bách Hoa - Chi nhánh Quận 1",
      address: "456 Đường Nguyễn Huệ, Quận 1, TP.HCM",
    },
    pickupCode: "PK-8572",
    canReorder: true,
    canPickup: true,
    canCancel: false,
    note: "Lấy sau 15h",
  },
];

// Helper để tạo order mới từ cart
export function createMockOrder(
  items: Order["items"],
  deliveryType: Order["deliveryType"],
  deliveryAddress?: Order["deliveryAddress"],
  pickupStoreId?: string,
  paymentMethod: NonNullable<Order["payment"]>["method"] = "cash",
  note?: string
): Order {
  const subtotal = items.reduce((sum, item) => {
    const itemTotal = item.price * item.quantity;
    const optionsTotal =
      item.options?.reduce((optSum, opt) => optSum + (opt.price || 0), 0) || 0;
    return sum + itemTotal + optionsTotal * item.quantity;
  }, 0);

  const shippingFee = deliveryType === "delivery" ? 25000 : 0;
  const discount = 5000; // Mock discount
  const total = subtotal + shippingFee - discount;

  const orderId = `order-${Date.now()}`;
  const orderCode = `ORD-${new Date().toISOString().split("T")[0].replace(/-/g, "")}-${Math.floor(Math.random() * 900) + 100}`;

  return {
    id: orderId,
    orderCode,
    deliveryType,
    deliveryTypeLabel: deliveryType === "delivery" ? "Giao hàng" : "Tự đến lấy",
    state: "pending",
    stateLabel: "Chờ xác nhận",
    items: items.map((item, idx) => ({
      ...item,
      id: `${orderId}-item-${idx}`,
    })),
    createdAt: new Date(),
    updatedAt: new Date(),
    estimatedTime: new Date(Date.now() + 45 * 60 * 1000), // +45 phút
    totalAmount: total,
    payment: {
      method: paymentMethod,
      subtotal,
      shippingFee,
      discount,
      total,
      status: paymentMethod === "cash" ? "pending" : "paid",
    },
    deliveryAddress:
      deliveryType === "delivery" ? deliveryAddress : undefined,
    pickupStore:
      deliveryType === "pickup"
        ? {
          id: pickupStoreId || "store-001",
          name: "Bách Hoa - Chi nhánh Quận 1",
          address: "456 Đường Nguyễn Huệ, Quận 1, TP.HCM",
        }
        : undefined,
    pickupCode:
      deliveryType === "pickup"
        ? `PK-${Math.floor(Math.random() * 9000) + 1000}`
        : undefined,
    canReorder: false,
    canPickup: false,
    canCancel: true,
    note,
  };
}
