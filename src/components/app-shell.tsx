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
import { useCompare } from "@/state/compare-context";
import { useProductLibrary } from "@/state/product-library-context";
import { useAppContext } from "@/state/app-context";
import { SystemStatePanel } from "@/components/system-state-panel";
import { useNativeKeyboard } from "@/hooks/use-native-keyboard";

type BottomNavigationKey = (typeof BOTTOM_NAVIGATION)[number]["key"];

const MENU_DESTINATIONS = [
  { label: "Trang chủ", path: "/home", icon: "home" },
  { label: "Danh mục", path: "/categories", icon: "grid" },
  { label: "Tìm kiếm", path: "/search", icon: "search" },
  { label: "Đã xem", path: "/recent", icon: "clock" },
  { label: "Đã lưu", path: "/saved", icon: "heart" },
  { label: "So sánh", path: "/compare", icon: "gitCompare" },
  { label: "Yêu cầu nhiều sản phẩm", path: "/selection", icon: "listPlus" },
  { label: "Yêu cầu đã gửi", path: "/requests", icon: "send" },
  { label: "Hướng dẫn", path: "/help", icon: "bookOpen" },
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
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onSearchKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSearchCompositionStart?: () => void;
  onSearchCompositionEnd?: () => void;
  onSearchSubmit?: () => void;
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
  searchValue = "",
  onSearchChange,
  onSearchKeyDown,
  onSearchCompositionStart,
  onSearchCompositionEnd,
  onSearchSubmit,
}: AppShellProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { recentIds, savedIds } = useProductLibrary();
  const { notice: compareNotice, dismissNotice, items: comparisonItems } = useCompare();
  const { systemState, refresh } = useAppContext();
  const offlineState = systemState?.kind === "no-network" ? systemState : null;
  const activeKey = getBottomNavigationKey(location.pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const keyboardOpen = useNativeKeyboard(shellRef);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuDialogRef = useRef<HTMLDivElement | null>(null);
  const shouldRestoreMenuFocus = useRef(false);
  // The locked Preview keeps its discovery affordance in the topbar. Search
  // reuses that same surface and places its Back control inside the field.
  const showTopbarSearch = route.key === "home" || route.key === "categories" || route.key === "products" || route.key === "search";

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
  const showCompareNotice = !offlineState && Boolean(compareNotice) && ["home", "categories", "products", "search", "product-detail"].includes(route.key);

  return (
    <Page
      name={scrollKey ?? route.key}
      className={`hn-page hn-page--${route.key}${menuOpen ? " hn-page--menu-open" : ""}${keyboardOpen ? " hn-page--keyboard-open" : ""}`}
      resetScroll
      restoreScrollOnBack
      hideScrollbar
    >
      <div className="hn-shell hn-theme" ref={shellRef}>
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
              <span className="hn-wordmark__logo" aria-hidden="true">
                <img src="/hoa-nam-logo.png" alt="" />
              </span>
              <span className="hn-wordmark__copy" aria-hidden="true">
                <span className="hn-wordmark__name">HOA NAM</span>
                <span className="hn-wordmark__caption">TOOLS</span>
              </span>
            </button>
            <button
              className="hn-header-action hn-header-action--quote"
              type="button"
              aria-label="Chọn sản phẩm để gửi yêu cầu tư vấn"
              onClick={() => navigate("/quote", { animate: false })}
            >
              <UiIcon name="send" size={21} />
            </button>
            <nav className="hn-desktop-navigation" aria-label="Điều hướng trên máy tính">
              {BOTTOM_NAVIGATION.map((item) => (
                <button key={item.key} type="button" aria-current={activeKey === item.key ? "page" : undefined}
                  onClick={() => navigate(item.path, { animate: false })}>
                  <BottomNavigationIcon itemKey={item.key} /><span>{item.label}</span>
                </button>
              ))}
            </nav>
          </header>
          {showTopbarSearch && route.key === "search" ? (
            <div className="hn-topbar-search hn-topbar-search--input" aria-label="Tìm kiếm sản phẩm">
              <button className="hn-topbar-search__back" type="button" aria-label="Quay lại" onClick={() => navigate("/home", { animate: false })}>
                <UiIcon name="arrowLeft" size={20} />
              </button>
              <input
                type="search"
                aria-label="Tìm sản phẩm"
                value={searchValue}
                onChange={(event) => onSearchChange?.(event.target.value)}
                onCompositionStart={onSearchCompositionStart}
                onCompositionEnd={onSearchCompositionEnd}
                onKeyDown={onSearchKeyDown}
                placeholder="Tìm sản phẩm"
                autoComplete="off"
                maxLength={160}
              />
              {searchValue ? <button className="hn-topbar-search__clear" type="button" aria-label="Xóa tìm kiếm" onClick={() => onSearchChange?.("")}><UiIcon name="x" size={16} /></button> : null}
              <button className="hn-topbar-search__submit" type="button" aria-label="Thực hiện tìm kiếm" onClick={onSearchSubmit}>
                <UiIcon name="arrowRight" size={20} />
              </button>
            </div>
          ) : showTopbarSearch ? (
            <button className="hn-topbar-search" type="button" onClick={() => navigate("/search", { animate: false })}>
              <UiIcon name="search" size={20} />
              <span>Tìm sản phẩm</span>
              <UiIcon name="arrowRight" size={20} className="hn-topbar-search__arrow" />
            </button>
          ) : null}
        </div>
        {showCompareNotice && compareNotice ? (
          <aside className="compare-notice" aria-live="polite">
            <p>{compareNotice.message}</p>
            {compareNotice.canOpenComparison ? (
              <button type="button" onClick={() => navigate("/compare", { animate: false })}>Mở so sánh</button>
            ) : null}
            <button type="button" aria-label="Đóng thông báo so sánh" onClick={dismissNotice}>
              <UiIcon name="x" size={20} />
            </button>
          </aside>
        ) : null}
        <main className="hn-content" onTouchStart={onContentTouchStart} onTouchEnd={onContentTouchEnd}>
          {offlineState ? <SystemStatePanel state={offlineState} onRetry={() => void refresh()} /> : children}
        </main>
      </div>

      {menuOpen ? (
        <div className="hn-menu-layer hn-theme" role="presentation">
          <button className="hn-menu-backdrop" type="button" aria-label="Đóng menu" onClick={closeMenu} />
          <div
            id="hn-navigation-menu"
            ref={menuDialogRef}
            className="hn-menu-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Tiện ích sản phẩm"
            onKeyDown={trapMenuFocus}
          >
            <div className="hn-menu-dialog__heading">
              <div>
                <h2>Tiện ích sản phẩm</h2>
                <p>Tìm lại sản phẩm và chọn cách nhận tư vấn.</p>
              </div>
              <button type="button" aria-label="Đóng menu" onClick={closeMenu}><UiIcon name="x" size={22} /></button>
            </div>
            <div className="hn-menu-dialog__items">
              <section aria-labelledby="hn-menu-review-title">
                <h3 id="hn-menu-review-title">Xem lại</h3>
                <div className="hn-menu-dialog__group-grid">
                  {MENU_DESTINATIONS.filter((item) => item.path === "/recent" || item.path === "/saved").map((item) => (
                    <button
                      key={item.path}
                      type="button"
                      aria-label={item.path === "/recent" ? "Sản phẩm đã xem" : "Sản phẩm đã lưu"}
                      aria-current={location.pathname === item.path ? "page" : undefined}
                      onClick={() => navigateFromMenu(item.path)}
                    >
                      <span className="hn-menu-icon"><UiIcon name={item.icon} size={24} /></span>
                      <span>{item.path === "/recent" ? "Đã xem" : "Đã lưu"}</span>
                      <output>{item.path === "/recent" ? recentIds.length : savedIds.length}</output>
                    </button>
                  ))}
                </div>
              </section>
              <section aria-labelledby="hn-menu-choice-title">
                <h3 id="hn-menu-choice-title">Lựa chọn &amp; tư vấn</h3>
                <div className="hn-menu-dialog__group-grid">
                  {MENU_DESTINATIONS.filter((item) => item.path === "/compare" || item.path === "/selection").map((item) => (
                    <button
                      key={item.path}
                      type="button"
                      aria-label={item.path === "/compare" ? "So sánh sản phẩm" : item.label}
                      aria-current={location.pathname === item.path ? "page" : undefined}
                      onClick={() => navigateFromMenu(item.path)}
                    >
                      <span className="hn-menu-icon"><UiIcon name={item.icon} size={24} /></span>
                      <span>{item.path === "/compare" ? "So sánh" : item.label}</span>
                      {item.path === "/compare" && comparisonItems.length ? <output>{comparisonItems.length}/3</output> : null}
                    </button>
                  ))}
                </div>
              </section>
              <section aria-labelledby="hn-menu-help-title">
                <h3 id="hn-menu-help-title">Hỗ trợ</h3>
                <div className="hn-menu-dialog__group-grid hn-menu-dialog__group-rows">
                  {MENU_DESTINATIONS.filter((item) => item.path === "/requests" || item.path === "/help").map((item) => (
                    <button
                      key={item.path}
                      type="button"
                      aria-label={item.path === "/requests" ? "Yêu cầu đã gửi" : "Hướng dẫn & câu hỏi"}
                      aria-current={location.pathname === item.path ? "page" : undefined}
                      onClick={() => navigateFromMenu(item.path)}
                    >
                      <span className="hn-menu-icon"><UiIcon name={item.icon} size={24} /></span>
                      <span>{item.path === "/requests" ? "Yêu cầu đã gửi" : "Hướng dẫn"}</span>
                      <UiIcon className="hn-menu-arrow" name="chevronRight" size={20} />
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {showNavigation && !keyboardOpen ? (
        <nav className="hn-bottom-navigation" aria-label="Điều hướng chính">
          {BOTTOM_NAVIGATION.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`hn-bottom-navigation__item${activeKey === item.key ? " is-active" : ""}`}
              aria-current={activeKey === item.key ? "page" : undefined}
              onClick={() => {
                // A highlighted section can contain child routes (quote or
                // product detail). Its tab must still return to the section.
                if (location.pathname !== item.path) navigate(item.path, { animate: false });
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
