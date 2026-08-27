import { Category, SubCategory } from "@/types/category.types";

export const mockListOfCategory: Category[] = [
  {
    id: "hoa-tuoi",
    name: "Hoa tươi",
    subCategoryIds: ["bo-hoa", "gio-hoa", "hop-hoa", "ke-hoa"],
  },
  {
    id: "hoa-theo-dip",
    name: "Hoa theo dịp",
    subCategoryIds: [
      "sinh-nhat",
      "khai-truong",
      "hoa-cuoi",
      "chia-buon",
      "ky-niem",
      "tot-nghiep",
    ],
  },
  {
    id: "hoa-kho-hoa-sap",
    name: "Hoa khô & hoa sáp",
    subCategoryIds: ["hoa-kho", "hoa-sap"],
  },
  {
    id: "phu-kien",
    name: "Phụ kiện hoa",
    subCategoryIds: ["binh-hoa", "giay-goi-ruy-bang", "thiep", "dung-cu"],
  },
];

// Ảnh dưới đây đã được tải xuống và xem trực tiếp để xác nhận đúng nội dung
// trước khi dùng làm icon danh mục.
export const mockListOfSubCategory: SubCategory[] = [
  // Hoa tươi
  {
    id: "bo-hoa",
    name: "Bó hoa",
    image:
      "https://images.unsplash.com/photo-1591886960571-74d43a9d4166?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "gio-hoa",
    name: "Giỏ hoa",
    image:
      "https://images.unsplash.com/photo-1487070183336-b863922373d4?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "hop-hoa",
    name: "Hộp hoa",
    image:
      "https://images.unsplash.com/photo-1512909006721-3d6018887383?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "ke-hoa",
    name: "Kệ hoa",
    image:
      "https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=300&q=80&auto=format&fit=crop",
  },
  // Hoa theo dịp
  {
    id: "sinh-nhat",
    name: "Sinh nhật",
    image:
      "https://images.unsplash.com/photo-1520763185298-1b434c919102?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "khai-truong",
    name: "Khai trương",
    image:
      "https://images.unsplash.com/photo-1455659817273-f96807779a8a?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "hoa-cuoi",
    name: "Hoa cưới",
    image:
      "https://images.unsplash.com/photo-1519741497674-611481863552?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "chia-buon",
    name: "Chia buồn",
    image:
      "https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "ky-niem",
    name: "Kỷ niệm",
    image:
      "https://images.unsplash.com/photo-1526047932273-341f2a7631f9?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "tot-nghiep",
    name: "Tốt nghiệp",
    image:
      "https://images.unsplash.com/photo-1533616688419-b7a585564566?w=300&q=80&auto=format&fit=crop",
  },
  // Hoa khô & hoa sáp
  {
    id: "hoa-kho",
    name: "Hoa khô",
    image:
      "https://images.unsplash.com/photo-1584589167171-541ce45f1eea?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "hoa-sap",
    name: "Hoa sáp",
    image:
      "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=300&q=80&auto=format&fit=crop",
  },
  // Phụ kiện
  {
    id: "binh-hoa",
    name: "Bình hoa",
    image:
      "https://images.unsplash.com/photo-1584589167171-541ce45f1eea?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "giay-goi-ruy-bang",
    name: "Giấy gói & ruy băng",
    image:
      "https://images.unsplash.com/photo-1512909006721-3d6018887383?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "thiep",
    name: "Thiệp",
    image:
      "https://images.unsplash.com/photo-1520763185298-1b434c919102?w=300&q=80&auto=format&fit=crop",
  },
  {
    id: "dung-cu",
    name: "Dụng cụ cắm hoa",
    image:
      "https://images.unsplash.com/photo-1487070183336-b863922373d4?w=300&q=80&auto=format&fit=crop",
  },
];
