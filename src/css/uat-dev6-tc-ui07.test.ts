import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../pages/product-library.tsx", import.meta.url), "utf8");
const style = readFileSync(new URL("./uat-dev6-tc-ui07.scss", import.meta.url), "utf8");

describe("UAT_Dev_v6 TC_UI_07 recent products library", () => {
  it("shows the approved browser-library notice, exact progress format, and empty CTA", () => {
    expect(page).toContain("Danh sách được lưu trong trình duyệt trên thiết bị này");
    expect(page).toContain("Đã hiển thị {library.products.length} / {library.products.length} sản phẩm");
    expect(page).toContain("Bạn chưa xem sản phẩm nào");
    expect(page).toContain("Khám phá sản phẩm");
  });

  it("uses the in-app confirmation sheet instead of a browser confirmation dialog", () => {
    expect(page).toContain("Xóa lịch sử xem?");
    expect(page).toContain("Danh sách đã lưu vẫn được giữ nguyên.");
    expect(page).not.toContain("window.confirm");
    expect(style).toMatch(/\.library-clear-dialog\s*\{[^}]*position: fixed;[^}]*z-index: 100;/);
  });

  it("keeps saved products actionable from the approved library screen", () => {
    expect(page).toContain("Gửi yêu cầu cho danh sách");
    expect(page).toContain("requestSavedProducts");
    expect(page).toContain("library-storage-note--${kind}");
    expect(page).toContain("Đã hiển thị {library.products.length} / {library.products.length} sản phẩm");
    expect(style).toMatch(/\.library-request\s*\{[^}]*background: var\(--hn-gradient-primary\);/);
  });
});
