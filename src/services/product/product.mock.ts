import { Product, ProductFeature, VariantGroup } from "@/types/product.types";

export const mockProductFeature: ProductFeature[] = [
  { id: "giao-trong-ngay", name: "Giao trong ngày" },
  { id: "ban-chay", name: "Bán chạy" },
  { id: "cao-cap", name: "Cao cấp" },
  { id: "gia-tot", name: "Giá tốt" },
];

// Mỗi URL dưới đây đã được tải xuống và xem trực tiếp để xác nhận đúng nội dung
// (hoa hồng, bó hoa, hộp quà...) trước khi đưa vào mock — tránh lặp lại lỗi
// đoán ID ảnh Unsplash không khớp mô tả sản phẩm.
const IMG = {
  roseHeart:
    "https://images.unsplash.com/photo-1526047932273-341f2a7631f9?w=800&q=80&auto=format&fit=crop",
  creamRoseVase:
    "https://images.unsplash.com/photo-1591886960571-74d43a9d4166?w=800&q=80&auto=format&fit=crop",
  autumnJar:
    "https://images.unsplash.com/photo-1533616688419-b7a585564566?w=800&q=80&auto=format&fit=crop",
  tulipVase:
    "https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=800&q=80&auto=format&fit=crop",
  premiumBouquet:
    "https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=800&q=80&auto=format&fit=crop",
  sunflowers:
    "https://images.unsplash.com/photo-1455659817273-f96807779a8a?w=800&q=80&auto=format&fit=crop",
  rainbowRoses:
    "https://images.unsplash.com/photo-1508610048659-a06b669e3321?w=800&q=80&auto=format&fit=crop",
  weddingCouple:
    "https://images.unsplash.com/photo-1519741497674-611481863552?w=800&q=80&auto=format&fit=crop",
  giftBox:
    "https://images.unsplash.com/photo-1512909006721-3d6018887383?w=800&q=80&auto=format&fit=crop",
  floristShop:
    "https://images.unsplash.com/photo-1487070183336-b863922373d4?w=800&q=80&auto=format&fit=crop",
  singleRoseVase:
    "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=800&q=80&auto=format&fit=crop",
  singleTulip:
    "https://images.unsplash.com/photo-1520763185298-1b434c919102?w=800&q=80&auto=format&fit=crop",
  woodVases:
    "https://images.unsplash.com/photo-1584589167171-541ce45f1eea?w=800&q=80&auto=format&fit=crop",
};

const sizeGroup: VariantGroup = {
  id: "size",
  title: "Kích thước",
  description: "Chọn kích thước bó/giỏ hoa",
  type: "SINGLE",
  isRequired: true,
  options: [
    { id: "size-small", name: "Nhỏ", extraPrice: 0 },
    { id: "size-medium", name: "Vừa", extraPrice: 80000 },
    { id: "size-large", name: "Lớn", extraPrice: 180000 },
  ],
};

const colorGroup: VariantGroup = {
  id: "color",
  title: "Màu sắc chủ đạo",
  description: "Chọn tông màu hoa",
  type: "SINGLE",
  isRequired: true,
  options: [
    { id: "color-red", name: "Đỏ", extraPrice: 0 },
    { id: "color-pink", name: "Hồng phấn", extraPrice: 0 },
    { id: "color-white", name: "Trắng", extraPrice: 0 },
    { id: "color-pastel", name: "Pastel hỗn hợp", extraPrice: 15000 },
  ],
};

const wrapGroup: VariantGroup = {
  id: "wrap",
  title: "Giấy gói",
  description: "Chọn loại giấy gói hoa",
  type: "SINGLE",
  isRequired: true,
  options: [
    { id: "wrap-korea", name: "Giấy Hàn Quốc", extraPrice: 0 },
    { id: "wrap-kraft", name: "Giấy Kraft", extraPrice: 0 },
    { id: "wrap-mesh", name: "Giấy lưới Hàn", extraPrice: 20000 },
  ],
};

const ribbonGroup: VariantGroup = {
  id: "ribbon",
  title: "Ruy băng",
  description: "Chọn màu ruy băng",
  type: "SINGLE",
  isRequired: false,
  options: [
    { id: "ribbon-red", name: "Ruy băng lụa đỏ", extraPrice: 0 },
    { id: "ribbon-white", name: "Ruy băng lụa trắng", extraPrice: 0 },
    { id: "ribbon-beige", name: "Ruy băng nhung be", extraPrice: 10000 },
  ],
};

const accessoryGroup: VariantGroup = {
  id: "accessories",
  title: "Phụ kiện đi kèm",
  description: "Chọn thêm phụ kiện tặng kèm (có thể chọn nhiều)",
  type: "MULTIPLE",
  isRequired: false,
  options: [
    { id: "acc-card", name: "Thiệp chúc mừng", extraPrice: 15000 },
    { id: "acc-teddy", name: "Gấu bông mini", extraPrice: 90000 },
    { id: "acc-chocolate", name: "Socola hộp nhỏ", extraPrice: 65000 },
    { id: "acc-candle", name: "Nến thơm mini", extraPrice: 45000 },
  ],
};

const stemCountGroup: VariantGroup = {
  id: "stem-count",
  title: "Số lượng hoa chính",
  description: "Thêm bớt số cành hoa chính trong bó",
  type: "QUANTITY",
  isRequired: false,
  options: [
    {
      id: "stem-rose",
      name: "Thêm hoa hồng",
      extraPrice: 25000,
      image: IMG.roseHeart,
      value: 0,
    },
    {
      id: "stem-lily",
      name: "Thêm hoa ly",
      extraPrice: 35000,
      image: IMG.premiumBouquet,
      value: 0,
    },
  ],
};

export const mockListOfProduct: Product[] = [
  // ========== HOA TƯƠI — BÓ HOA ==========
  {
    id: 1,
    categoryId: "hoa-tuoi",
    subCategoryId: "bo-hoa",
    name: "Bó Hồng Đỏ Đam Mê",
    description:
      "Bó hoa hồng đỏ Ecuador cao cấp, tượng trưng cho tình yêu nồng nàn, gói giấy Hàn Quốc sang trọng.",
    image: IMG.roseHeart,
    price: 450000,
    variantGroups: [sizeGroup, wrapGroup, ribbonGroup, accessoryGroup],
    features: ["ban-chay", "cao-cap"],
    sales: { freeShipping: true },
  },
  {
    id: 2,
    categoryId: "hoa-tuoi",
    subCategoryId: "bo-hoa",
    name: "Bó Hoa Hồng Phấn Ngọt Ngào",
    description:
      "Hoa hồng phấn phối cùng baby trắng, phù hợp tặng người yêu hoặc bạn thân.",
    image: IMG.creamRoseVase,
    price: 380000,
    variantGroups: [sizeGroup, wrapGroup, ribbonGroup, accessoryGroup],
    features: ["ban-chay"],
    newMarked: true,
  },
  {
    id: 3,
    categoryId: "hoa-tuoi",
    subCategoryId: "bo-hoa",
    name: "Bó Hoa Đồng Nội Nhiều Màu",
    description:
      "Phối nhiều loại hoa theo mùa: hướng dương, cúc, đồng tiền — tươi tắn và giá tốt.",
    image: IMG.autumnJar,
    price: 250000,
    variantGroups: [sizeGroup, wrapGroup, accessoryGroup],
    features: ["gia-tot", "giao-trong-ngay"],
    sales: { discount: 10 },
  },
  {
    id: 4,
    categoryId: "hoa-tuoi",
    subCategoryId: "bo-hoa",
    name: "Bó Tulip Hà Lan",
    description: "Tulip nhập khẩu Hà Lan, cánh mềm, màu sắc tươi sáng.",
    image: IMG.tulipVase,
    price: 420000,
    variantGroups: [sizeGroup, colorGroup, wrapGroup, ribbonGroup],
    features: ["cao-cap"],
  },
  {
    id: 5,
    categoryId: "hoa-tuoi",
    subCategoryId: "bo-hoa",
    name: "Bó Baby Trắng Thanh Khiết",
    description: "Bó hoa baby trắng nguyên bản, nhẹ nhàng và tinh tế.",
    image: IMG.premiumBouquet,
    price: 220000,
    variantGroups: [sizeGroup, wrapGroup, ribbonGroup],
    features: ["gia-tot"],
  },

  // ========== HOA TƯƠI — GIỎ HOA ==========
  {
    id: 6,
    categoryId: "hoa-tuoi",
    subCategoryId: "gio-hoa",
    name: "Giỏ Hoa Hồng Kem Sang Trọng",
    description:
      "Giỏ hoa hồng kem phối baby, cắm sẵn trong giỏ mây, tiện đặt bàn làm việc hoặc bàn tiếp khách.",
    image: IMG.floristShop,
    price: 620000,
    variantGroups: [sizeGroup, colorGroup, accessoryGroup],
    features: ["ban-chay", "cao-cap"],
  },
  {
    id: 7,
    categoryId: "hoa-tuoi",
    subCategoryId: "gio-hoa",
    name: "Giỏ Hoa Hướng Dương Rực Rỡ",
    description: "Giỏ hướng dương tươi sáng, thích hợp chúc mừng khai trương hoặc thăng chức.",
    image: IMG.sunflowers,
    price: 480000,
    variantGroups: [sizeGroup, accessoryGroup],
    features: ["giao-trong-ngay"],
  },
  {
    id: 8,
    categoryId: "hoa-tuoi",
    subCategoryId: "gio-hoa",
    name: "Giỏ Hoa Đồng Tiền Nhiều Màu",
    description: "Hoa đồng tiền rực rỡ, mang ý nghĩa may mắn, thích hợp mừng tân gia.",
    image: IMG.floristShop,
    price: 350000,
    variantGroups: [sizeGroup, accessoryGroup],
    features: ["gia-tot"],
  },

  // ========== HOA TƯƠI — HỘP HOA ==========
  {
    id: 9,
    categoryId: "hoa-tuoi",
    subCategoryId: "hop-hoa",
    name: "Hộp Hoa Hồng Đỏ Vĩnh Cửu Mini",
    description: "Hộp tròn phối hoa hồng tươi, có thể giữ dáng đẹp 2-3 ngày, sang trọng làm quà tặng.",
    image: IMG.giftBox,
    price: 550000,
    variantGroups: [sizeGroup, colorGroup, accessoryGroup],
    features: ["cao-cap", "ban-chay"],
    newMarked: true,
  },
  {
    id: 10,
    categoryId: "hoa-tuoi",
    subCategoryId: "hop-hoa",
    name: "Hộp Hoa Pastel Phối Hộp Quà",
    description: "Hộp hoa tông pastel kèm ngăn đựng quà nhỏ, phù hợp sinh nhật.",
    image: IMG.giftBox,
    price: 480000,
    variantGroups: [sizeGroup, colorGroup, accessoryGroup],
    features: ["ban-chay"],
  },

  // ========== HOA TƯƠI — KỆ HOA ==========
  {
    id: 11,
    categoryId: "hoa-tuoi",
    subCategoryId: "ke-hoa",
    name: "Kệ Hoa Khai Trương 2 Tầng",
    description: "Kệ hoa tươi 2 tầng, dải băng in chữ chúc mừng theo yêu cầu, phù hợp khai trương/chúc mừng.",
    image: IMG.premiumBouquet,
    price: 1450000,
    variantGroups: [
      {
        id: "tier",
        title: "Số tầng",
        description: "Chọn số tầng kệ hoa",
        type: "SINGLE",
        isRequired: true,
        options: [
          { id: "tier-1", name: "1 tầng", extraPrice: 0 },
          { id: "tier-2", name: "2 tầng", extraPrice: 450000 },
          { id: "tier-3", name: "3 tầng", extraPrice: 950000 },
        ],
      },
      ribbonGroup,
    ],
    features: ["cao-cap"],
  },
  {
    id: 12,
    categoryId: "hoa-tuoi",
    subCategoryId: "ke-hoa",
    name: "Kệ Hoa Chúc Mừng Khai Trương",
    description: "Kệ hoa phối hướng dương và lan hồ điệp, nổi bật và trang trọng.",
    image: IMG.premiumBouquet,
    price: 1650000,
    variantGroups: [ribbonGroup],
    features: ["cao-cap", "ban-chay"],
  },

  // ========== HOA THEO DỊP — SINH NHẬT ==========
  {
    id: 13,
    categoryId: "hoa-theo-dip",
    subCategoryId: "sinh-nhat",
    name: "Bó Hoa Sinh Nhật Rực Rỡ",
    description: "Phối hoa nhiều màu tươi vui, kèm thiệp chúc mừng sinh nhật miễn phí.",
    image: IMG.autumnJar,
    price: 320000,
    variantGroups: [sizeGroup, colorGroup, wrapGroup, accessoryGroup],
    features: ["ban-chay", "giao-trong-ngay"],
  },
  {
    id: 14,
    categoryId: "hoa-theo-dip",
    subCategoryId: "sinh-nhat",
    name: "Giỏ Hoa Sinh Nhật Kèm Bóng Bay",
    description: "Giỏ hoa tươi kèm bóng bay số tuổi, tạo bất ngờ đặc biệt.",
    image: IMG.floristShop,
    price: 490000,
    variantGroups: [sizeGroup, colorGroup, accessoryGroup],
    features: ["ban-chay"],
    newMarked: true,
  },

  // ========== HOA THEO DỊP — KHAI TRƯƠNG ==========
  {
    id: 15,
    categoryId: "hoa-theo-dip",
    subCategoryId: "khai-truong",
    name: "Kệ Hoa Khai Trương Phát Tài",
    description: "Phối lan hồ điệp và hướng dương, dải băng chúc \"Khai trương phát tài\".",
    image: IMG.premiumBouquet,
    price: 1350000,
    variantGroups: [
      {
        id: "tier",
        title: "Số tầng",
        description: "Chọn số tầng kệ hoa",
        type: "SINGLE",
        isRequired: true,
        options: [
          { id: "tier-1", name: "1 tầng", extraPrice: 0 },
          { id: "tier-2", name: "2 tầng", extraPrice: 400000 },
        ],
      },
      ribbonGroup,
    ],
    features: ["cao-cap"],
  },

  // ========== HOA THEO DỊP — HOA CƯỚI ==========
  {
    id: 16,
    categoryId: "hoa-theo-dip",
    subCategoryId: "hoa-cuoi",
    name: "Bó Hoa Cưới Cầm Tay Trắng Tinh Khôi",
    description: "Bó hoa cưới phối hồng trắng và baby, thiết kế tối giản, sang trọng.",
    image: IMG.weddingCouple,
    price: 850000,
    variantGroups: [
      {
        id: "wedding-type",
        title: "Loại hoa cưới",
        description: "Chọn loại hoa cần dùng trong lễ cưới",
        type: "SINGLE",
        isRequired: true,
        options: [
          { id: "wedding-handheld", name: "Bó cầm tay cô dâu", extraPrice: 0 },
          { id: "wedding-boutonniere", name: "Hoa cài áo chú rể", extraPrice: -650000 },
          { id: "wedding-car", name: "Hoa trang trí xe cưới", extraPrice: 350000 },
        ],
      },
      colorGroup,
    ],
    features: ["cao-cap", "ban-chay"],
  },
  {
    id: 17,
    categoryId: "hoa-theo-dip",
    subCategoryId: "hoa-cuoi",
    name: "Cổng Hoa Cưới Chủ Đề Pastel",
    description: "Trang trí cổng hoa cưới tông pastel, thiết kế theo yêu cầu riêng của cô dâu chú rể.",
    image: IMG.premiumBouquet,
    price: 3200000,
    variantGroups: [colorGroup],
    features: ["cao-cap"],
  },

  // ========== HOA THEO DỊP — CHIA BUỒN ==========
  {
    id: 18,
    categoryId: "hoa-theo-dip",
    subCategoryId: "chia-buon",
    name: "Kệ Hoa Chia Buồn Trắng Tinh",
    description: "Kệ hoa tang lễ tông trắng - vàng nhạt, trang nghiêm, dải băng viếng theo yêu cầu.",
    image: IMG.premiumBouquet,
    price: 980000,
    variantGroups: [
      {
        id: "tier",
        title: "Số tầng",
        description: "Chọn số tầng kệ hoa",
        type: "SINGLE",
        isRequired: true,
        options: [
          { id: "tier-1", name: "1 tầng", extraPrice: 0 },
          { id: "tier-2", name: "2 tầng", extraPrice: 350000 },
        ],
      },
    ],
    features: ["giao-trong-ngay"],
  },
  {
    id: 19,
    categoryId: "hoa-theo-dip",
    subCategoryId: "chia-buon",
    name: "Vòng Hoa Viếng Truyền Thống",
    description: "Vòng hoa tang lễ hình tròn truyền thống, phối cúc và lay ơn trắng.",
    image: IMG.floristShop,
    price: 750000,
    variantGroups: [],
    features: ["giao-trong-ngay"],
  },

  // ========== HOA THEO DỊP — KỶ NIỆM ==========
  {
    id: 20,
    categoryId: "hoa-theo-dip",
    subCategoryId: "ky-niem",
    name: "Bó Hoa Kỷ Niệm Ngày Cưới",
    description: "Hoa hồng đỏ phối lá bạc, kèm thiệp ghi lời yêu thương kỷ niệm ngày cưới.",
    image: IMG.roseHeart,
    price: 480000,
    variantGroups: [sizeGroup, ribbonGroup, accessoryGroup, stemCountGroup],
    features: ["ban-chay"],
  },

  // ========== HOA THEO DỊP — TỐT NGHIỆP ==========
  {
    id: 21,
    categoryId: "hoa-theo-dip",
    subCategoryId: "tot-nghiep",
    name: "Bó Hoa Tốt Nghiệp Rạng Rỡ",
    description: "Phối hoa tươi sáng cùng dải băng \"Chúc mừng tốt nghiệp\", có thể in tên trường.",
    image: IMG.premiumBouquet,
    price: 300000,
    variantGroups: [sizeGroup, colorGroup, accessoryGroup],
    features: ["giao-trong-ngay", "gia-tot"],
  },

  // ========== HOA KHÔ ==========
  {
    id: 22,
    categoryId: "hoa-kho-hoa-sap",
    subCategoryId: "hoa-kho",
    name: "Bó Hoa Khô Pampas Boho",
    description: "Cỏ pampas và hoa khô phối theo phong cách boho, chơi được lâu dài không cần chăm sóc.",
    image: IMG.woodVases,
    price: 280000,
    variantGroups: [sizeGroup],
    features: ["cao-cap"],
  },
  {
    id: 23,
    categoryId: "hoa-kho-hoa-sap",
    subCategoryId: "hoa-kho",
    name: "Lọ Hoa Khô Lavender Mini",
    description: "Hoa oải hương khô thơm nhẹ, để bàn làm việc hoặc phòng ngủ.",
    image: IMG.woodVases,
    price: 150000,
    variantGroups: [],
    features: ["gia-tot"],
  },

  // ========== HOA SÁP ==========
  {
    id: 24,
    categoryId: "hoa-kho-hoa-sap",
    subCategoryId: "hoa-sap",
    name: "Hộp Hoa Sáp Hồng Vĩnh Cửu",
    description: "Hoa hồng sáp giữ dáng vĩnh viễn, đặt trong hộp mica sang trọng.",
    image: IMG.singleRoseVase,
    price: 390000,
    variantGroups: [sizeGroup, colorGroup],
    features: ["cao-cap", "ban-chay"],
  },
  {
    id: 25,
    categoryId: "hoa-kho-hoa-sap",
    subCategoryId: "hoa-sap",
    name: "Bó Hoa Sáp Mini Cầm Tay",
    description: "Bó hoa sáp nhỏ gọn, món quà lưu giữ lâu dài đầy ý nghĩa.",
    image: IMG.singleRoseVase,
    price: 220000,
    variantGroups: [colorGroup],
    features: ["gia-tot"],
  },

  // ========== PHỤ KIỆN — BÌNH HOA ==========
  {
    id: 26,
    categoryId: "phu-kien",
    subCategoryId: "binh-hoa",
    name: "Bình Gốm Trắng Tối Giản",
    description: "Bình hoa gốm trắng phong cách tối giản, phù hợp mọi loại hoa cắm.",
    image: IMG.woodVases,
    price: 180000,
    variantGroups: [],
    features: ["gia-tot"],
  },
  {
    id: 27,
    categoryId: "phu-kien",
    subCategoryId: "binh-hoa",
    name: "Bình Thủy Tinh Trong Cao Cấp",
    description: "Bình thủy tinh trong suốt, tôn dáng bó hoa, dễ vệ sinh.",
    image: IMG.woodVases,
    price: 260000,
    variantGroups: [],
    features: [],
  },

  // ========== PHỤ KIỆN — GIẤY GÓI & RUY BĂNG ==========
  {
    id: 28,
    categoryId: "phu-kien",
    subCategoryId: "giay-goi-ruy-bang",
    name: "Set Giấy Gói Hoa Hàn Quốc",
    description: "Set 10 tờ giấy gói hoa nhập khẩu Hàn Quốc nhiều màu.",
    image: IMG.giftBox,
    price: 85000,
    variantGroups: [],
    features: ["gia-tot"],
  },
  {
    id: 29,
    categoryId: "phu-kien",
    subCategoryId: "giay-goi-ruy-bang",
    name: "Cuộn Ruy Băng Lụa Cao Cấp",
    description: "Ruy băng lụa bản 3cm, nhiều màu, dùng trang trí bó/giỏ hoa.",
    image: IMG.giftBox,
    price: 35000,
    variantGroups: [],
    features: [],
  },

  // ========== PHỤ KIỆN — THIỆP ==========
  {
    id: 30,
    categoryId: "phu-kien",
    subCategoryId: "thiep",
    name: "Thiệp Chúc Mừng Viết Tay",
    description: "Thiệp giấy mỹ thuật, florist viết tay lời chúc theo yêu cầu của bạn.",
    image: IMG.singleTulip,
    price: 20000,
    variantGroups: [],
    features: ["gia-tot"],
  },

  // ========== PHỤ KIỆN — DỤNG CỤ ==========
  {
    id: 31,
    categoryId: "phu-kien",
    subCategoryId: "dung-cu",
    name: "Kéo Cắt Cành Chuyên Dụng",
    description: "Kéo cắt cành thép không gỉ, lưỡi sắc, cắt hoa không dập cành.",
    image: IMG.floristShop,
    price: 120000,
    variantGroups: [],
    features: [],
  },
  {
    id: 32,
    categoryId: "phu-kien",
    subCategoryId: "dung-cu",
    name: "Xốp Cắm Hoa Tươi (Bộ 5 viên)",
    description: "Xốp cắm hoa giữ ẩm tốt, dùng cho giỏ hoa và kệ hoa.",
    image: IMG.floristShop,
    price: 45000,
    variantGroups: [],
    features: ["gia-tot"],
  },
];
