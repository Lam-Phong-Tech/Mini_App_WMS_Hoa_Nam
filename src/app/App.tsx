import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Icon, type IconName } from "@/components/ui/Icon";
import {
  getStoredWarehouseStaff,
  WAREHOUSE_STAFF_STORAGE_EVENT,
} from "@/services/zalo-auth.service";

const navItems = [
  { to: "/", label: "Trang chủ", icon: "home" },
  { to: "/scanner/INVENTORY_LOOKUP", label: "Quét mã", icon: "scan" },
  { to: "/approvals", label: "Duyệt phiếu", icon: "list-check" },
  { to: "/history", label: "Lịch sử", icon: "history" },
  { to: "/profile", label: "Cá nhân", icon: "user" },
] satisfies Array<{
  to: string;
  label: string;
  icon: IconName;
}>;

export default function WarehouseApp() {
  const location = useLocation();
  const [hasStoredStaff, setHasStoredStaff] = useState(() =>
    Boolean(getStoredWarehouseStaff()),
  );

  useEffect(() => {
    const syncStoredStaff = () => {
      setHasStoredStaff(Boolean(getStoredWarehouseStaff()));
    };

    syncStoredStaff();
    window.addEventListener("storage", syncStoredStaff);
    window.addEventListener(WAREHOUSE_STAFF_STORAGE_EVENT, syncStoredStaff);

    return () => {
      window.removeEventListener("storage", syncStoredStaff);
      window.removeEventListener(
        WAREHOUSE_STAFF_STORAGE_EVENT,
        syncStoredStaff,
      );
    };
  }, [location.pathname]);

  const hideNav =
    !hasStoredStaff ||
    location.pathname.startsWith("/auth") ||
    location.pathname.startsWith("/documents") ||
    location.pathname.startsWith("/scanner") ||
    location.pathname.startsWith("/manual") ||
    location.pathname.startsWith("/result") ||
    location.pathname.startsWith("/receipt-review") ||
    location.pathname.startsWith("/receipt-success") ||
    location.pathname.startsWith("/outbound-review") ||
    location.pathname.startsWith("/outbound-success");

  return (
    <div className="wms-app-scroll bg-[var(--wms-surface-canvas)] text-[var(--wms-text)]">
      <div
        className={`mx-auto min-h-screen max-w-md ${hideNav ? "" : "pb-24"}`}
      >
        <Outlet />
      </div>
      {!hideNav && (
        <nav className="wms-bottom-nav fixed inset-x-0 bottom-0 z-20 px-3 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2">
          <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `wms-bottom-nav__item flex flex-col items-center justify-center px-1 text-center text-[12px] font-medium ${
                    isActive ? "wms-bottom-nav__item--active" : ""
                  }`
                }
              >
                <Icon name={item.icon} size={24} strokeWidth={2.15} />
                <div className="mt-1">{item.label}</div>
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
