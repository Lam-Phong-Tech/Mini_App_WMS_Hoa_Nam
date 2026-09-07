export type FoundationRouteKey =
  | "launch"
  | "home"
  | "categories"
  | "products"
  | "search"
  | "filters"
  | "product-detail"
  | "gallery"
  | "quote-request"
  | "contact"
  | "system-states";

export interface FoundationRoute {
  key: FoundationRouteKey;
  path: string;
  title: string;
  eyebrow: string;
}

export const FOUNDATION_ROUTES: FoundationRoute[] = [
  { key: "launch", path: "/", title: "Hoa Nam", eyebrow: "KHỞI ĐỘNG" },
  { key: "home", path: "/home", title: "Hoa Nam", eyebrow: "CATALOGUE CÔNG KHAI" },
  { key: "categories", path: "/categories", title: "Danh mục sản phẩm", eyebrow: "TRA CỨU" },
  { key: "products", path: "/products", title: "Sản phẩm", eyebrow: "DANH SÁCH" },
  { key: "search", path: "/search", title: "Tìm kiếm", eyebrow: "TRA CỨU" },
  { key: "filters", path: "/filters", title: "Lọc & sắp xếp", eyebrow: "TRA CỨU" },
  { key: "product-detail", path: "/products/:slug", title: "Chi tiết sản phẩm", eyebrow: "SẢN PHẨM" },
  { key: "gallery", path: "/products/:slug/gallery", title: "Hình ảnh", eyebrow: "SẢN PHẨM" },
  { key: "quote-request", path: "/products/:slug/quote", title: "Yêu cầu tư vấn", eyebrow: "SẢN PHẨM" },
  { key: "contact", path: "/contact", title: "Liên hệ", eyebrow: "HỖ TRỢ" },
  { key: "system-states", path: "/system", title: "Trạng thái hệ thống", eyebrow: "HỖ TRỢ" },
];

export const BOTTOM_NAVIGATION = [
  { key: "home", label: "Trang chủ", path: "/home" },
  { key: "categories", label: "Danh mục", path: "/categories" },
  { key: "contact", label: "Liên hệ", path: "/contact" },
] as const;

export const getBottomNavigationKey = (pathname: string): string => {
  if (pathname === "/home" || pathname === "/") return "home";
  if (pathname.startsWith("/contact") || pathname.startsWith("/system")) return "contact";
  return "categories";
};

export const getFoundationRoute = (
  key: FoundationRouteKey,
): FoundationRoute => {
  const route = FOUNDATION_ROUTES.find((candidate) => candidate.key === key);
  if (!route) throw new Error(`Missing foundation route: ${key}`);
  return route;
};
