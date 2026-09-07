import { Page, useLocation, useNavigate } from "zmp-ui";
import { ReactNode, TouchEventHandler } from "react";

import { BOTTOM_NAVIGATION, FoundationRoute, getBottomNavigationKey } from "@/routes";
import { UiIcon, UiIconName } from "@/components/ui-icon";

type BottomNavigationKey = (typeof BOTTOM_NAVIGATION)[number]["key"];

const BottomNavigationIcon = ({ itemKey }: { itemKey: BottomNavigationKey }) => {
  const iconByItemKey: Record<BottomNavigationKey, UiIconName> = {
    home: "home",
    categories: "grid",
    contact: "phone",
  };
  return <UiIcon name={iconByItemKey[itemKey]} size={24} strokeWidth={1.8} />;
};

interface AppShellProps {
  route: FoundationRoute;
  children: ReactNode;
  showNavigation?: boolean;
  scrollKey?: string;
  onContentTouchStart?: TouchEventHandler<HTMLElement>;
  onContentTouchEnd?: TouchEventHandler<HTMLElement>;
}

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
  const isHome = route.key === "home";
  const headerTitle = isHome ? "Product Viewer" : route.title;
  // The prototype keeps a consistent app identity line on every screen.
  // Route context is already conveyed by the title, so do not replace it
  // with an all-caps eyebrow (that caused the header to drift from wireframe).
  const headerSubtitle = "Hoa Nam · Catalogue công khai";

  return (
    <Page
      name={scrollKey ?? route.key}
      className={`hn-page hn-page--${route.key}`}
      resetScroll
      restoreScrollOnBack
      hideScrollbar
    >
      <div className="hn-shell">
        <header className={`hn-header app-header${isHome ? " app-header--home" : ""}`}>
          {isHome ? <span className="mini-mark" aria-hidden="true">HN</span> : <button className="header-back" type="button" aria-label="Quay lại" onClick={() => {
            // Preserve the user's navigation context (category → list → detail)
            // and only fall back to Home when the screen was opened directly.
            if (window.history.length > 1) {
              navigate(-1);
            } else {
              navigate("/home", { animate: false });
            }
          }}><UiIcon name="chevronLeft" size={24} /></button>}
          <div className="app-title">
            <strong>{headerTitle}</strong>
            <span>{headerSubtitle}</span>
          </div>
          {/* Search remains available in its own dedicated screen and Home field.
              Keeping this spacer makes the title sit in the same visual frame
              on all screens without a redundant corner search control. */}
          <span className="header-spacer" aria-hidden="true" />
        </header>
        <main className={`hn-content app-content${isHome ? " app-content--home" : ""}`} onTouchStart={onContentTouchStart} onTouchEnd={onContentTouchEnd}>{children}</main>
      </div>
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
