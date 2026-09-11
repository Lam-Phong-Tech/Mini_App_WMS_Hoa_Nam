import {
  KeyboardEvent,
  ReactNode,
  TouchEventHandler,
  useEffect,
  useRef,
  useState,
} from "react";
import { Page, useLocation, useNavigate } from "zmp-ui";

import { BOTTOM_NAVIGATION, FoundationRoute, getBottomNavigationKey } from "@/routes";
import { UiIcon, UiIconName } from "@/components/ui-icon";

type BottomNavigationKey = (typeof BOTTOM_NAVIGATION)[number]["key"];

const MENU_DESTINATIONS = [
  { label: "Trang chủ", path: "/home", icon: "home" },
  { label: "Danh mục", path: "/categories", icon: "grid" },
  { label: "Tìm kiếm", path: "/search", icon: "search" },
  { label: "Đã xem", path: "/recent", icon: "clock" },
  { label: "Đã lưu", path: "/saved", icon: "bookmark" },
  { label: "Yêu cầu nhiều sản phẩm", path: "/selection", icon: "send" },
  { label: "So sánh", path: "/compare", icon: "layers" },
  { label: "Hướng dẫn", path: "/help", icon: "fileText" },
  { label: "Liên hệ", path: "/contact", icon: "phone" },
] as const satisfies ReadonlyArray<{ label: string; path: string; icon: UiIconName }>;

const BottomNavigationIcon = ({ itemKey }: { itemKey: BottomNavigationKey }) => {
  const iconByItemKey: Record<BottomNavigationKey, UiIconName> = {
    home: "home",
    categories: "grid",
    contact: "phone",
  };
  return <UiIcon name={iconByItemKey[itemKey]} size={22} strokeWidth={1.8} />;
};

interface AppShellProps {
  route: FoundationRoute;
  children: ReactNode;
  showNavigation?: boolean;
  scrollKey?: string;
  onContentTouchStart?: TouchEventHandler<HTMLElement>;
  onContentTouchEnd?: TouchEventHandler<HTMLElement>;
}

/**
 * Shared G2 shell. ZaUI Page remains the only scroll owner until D06's
 * compatibility evidence approves a different controller.
 */
export const AppShell = ({
  route,
  children,
  showNavigation = true,
  scrollKey,
  onContentTouchStart,
  onContentTouchEnd,
}: AppShellProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const activeKey = getBottomNavigationKey(location.pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuDialogRef = useRef<HTMLDivElement | null>(null);
  const shouldRestoreMenuFocus = useRef(false);
  // The locked Preview keeps its discovery affordance available from Home,
  // product groups and catalogue.  Search itself owns a real input below the
  // header, so it deliberately does not receive a duplicate button here.
  const showTopbarSearch = route.key === "home" || route.key === "categories" || route.key === "products";

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (!menuOpen) {
      if (shouldRestoreMenuFocus.current) {
        menuButtonRef.current?.focus();
        shouldRestoreMenuFocus.current = false;
      }
      return undefined;
    }

    shouldRestoreMenuFocus.current = true;
    const scrollRoot = document.querySelector<HTMLElement>(".hn-page");
    const restoreScrollTop = scrollRoot?.scrollTop;
    scrollRoot?.classList.add("hn-page--menu-open");
    const focusTimer = window.setTimeout(() => {
      menuDialogRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    }, 0);
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    const originalHistoryBack = window.history.back;
    // ZaUI's runtime owns the native-back message listener. During this modal
    // state, consume its history.back call and restore the exact handler after
    // the menu closes so normal route back behaviour is unchanged.
    window.history.back = () => closeMenu();
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      window.history.back = originalHistoryBack;
      scrollRoot?.classList.remove("hn-page--menu-open");
      if (scrollRoot && typeof restoreScrollTop === "number") scrollRoot.scrollTop = restoreScrollTop;
    };
  }, [menuOpen]);

  const trapMenuFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      menuDialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]") ?? [],
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const navigateFromMenu = (path: string) => {
    closeMenu();
    if (path !== location.pathname) navigate(path, { animate: false });
  };

  return (
    <Page
      name={scrollKey ?? route.key}
      className={`hn-page hn-page--${route.key}${menuOpen ? " hn-page--menu-open" : ""}`}
      resetScroll
      restoreScrollOnBack
      hideScrollbar
    >
      <div className="hn-shell hn-theme">
        <div className="hn-topbar">
          <header className="hn-header hn-header--safe-area-top hn-header--zalo-capsule-safe" aria-label="Điều hướng Hoa Nam Tools">
            <button
              ref={menuButtonRef}
              className="hn-header-action"
              type="button"
              aria-label="Mở menu"
              aria-expanded={menuOpen}
              aria-controls="hn-navigation-menu"
              onClick={() => setMenuOpen(true)}
            >
              <UiIcon name="menu" size={22} />
            </button>
            <button className="hn-wordmark" type="button" onClick={() => navigate("/home", { animate: false })} aria-label="Hoa Nam Tools, về Trang chủ">
              <span className="hn-wordmark__brand" aria-hidden="true"><span>HOA<br />NAM</span></span>
              <span className="hn-wordmark__copy">
                <span className="hn-wordmark__name">HOA NAM</span>
                <span className="hn-wordmark__caption">TOOLS</span>
              </span>
            </button>
            <button
              className="hn-header-action hn-header-action--quote"
              type="button"
              aria-label="Chọn sản phẩm để gửi yêu cầu tư vấn"
              onClick={() => navigate("/selection", { animate: false })}
            >
              <UiIcon name="send" size={21} />
            </button>
          </header>
          {showTopbarSearch ? (
            <button className="hn-topbar-search" type="button" onClick={() => navigate("/search", { animate: false })}>
              <UiIcon name="search" size={20} />
              <span>Tìm theo tên, model hoặc công dụng</span>
              <UiIcon name="arrowRight" size={20} className="hn-topbar-search__arrow" />
            </button>
          ) : null}
        </div>
        <main className="hn-content" onTouchStart={onContentTouchStart} onTouchEnd={onContentTouchEnd}>{children}</main>
      </div>

      {menuOpen ? (
        <div className="hn-menu-layer" role="presentation">
          <button className="hn-menu-backdrop" type="button" aria-label="Đóng menu" onClick={closeMenu} />
          <div
            id="hn-navigation-menu"
            ref={menuDialogRef}
            className="hn-menu-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Menu điều hướng"
            onKeyDown={trapMenuFocus}
          >
            <div className="hn-menu-dialog__heading">
              <span>HOA NAM TOOLS</span>
              <button type="button" aria-label="Đóng menu" onClick={closeMenu}><UiIcon name="chevronLeft" size={22} /></button>
            </div>
            <div className="hn-menu-dialog__items">
              {MENU_DESTINATIONS.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  aria-current={location.pathname === item.path ? "page" : undefined}
                  onClick={() => navigateFromMenu(item.path)}
                >
                  <UiIcon name={item.icon} size={21} />
                  <span>{item.label}</span>
                  <UiIcon name="chevronRight" size={19} />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {showNavigation ? (
        <nav className="hn-bottom-navigation" aria-label="Điều hướng chính">
          {BOTTOM_NAVIGATION.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`hn-bottom-navigation__item${activeKey === item.key ? " is-active" : ""}`}
              aria-current={activeKey === item.key ? "page" : undefined}
              onClick={() => {
                if (activeKey !== item.key) navigate(item.path, { animate: false });
              }}
            >
              <BottomNavigationIcon itemKey={item.key} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      ) : null}
    </Page>
  );
};
