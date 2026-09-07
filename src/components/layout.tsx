import { Suspense, lazy } from "react";
import { getSystemInfo } from "zmp-sdk";
import {
  AnimationRoutes,
  App,
  Route,
  SnackbarProvider,
  ZMPRouter,
} from "zmp-ui";
import { AppProps } from "zmp-ui/app";

import { AppProvider } from "@/state/app-context";

const FoundationScreen = lazy(() => import("@/pages/foundation-screen").then((module) => ({ default: module.FoundationScreen })));
const CategoryPage = lazy(() => import("@/pages/category"));
const GalleryPage = lazy(() => import("@/pages/gallery"));
const HomePage = lazy(() => import("@/pages/index"));
const LaunchPage = lazy(() => import("@/pages/launch").then((module) => ({ default: module.LaunchPage })));
const ProductDetailPage = lazy(() => import("@/pages/product-detail"));
const ProductListPage = lazy(() => import("@/pages/product-list"));
const SearchPage = lazy(() => import("@/pages/search"));
const QuoteRequestPage = lazy(() => import("@/pages/quote-request"));

const RouteLoading = () => <div className="route-loading" role="status">Đang mở…</div>;

const Layout = () => {
  return (
    <App theme={getSystemInfo().zaloTheme as AppProps["theme"]}>
      <SnackbarProvider>
        <AppProvider>
          <ZMPRouter>
            <Suspense fallback={<RouteLoading />}>
              <AnimationRoutes>
                <Route path="/" element={<LaunchPage />}></Route>
                <Route path="/home" element={<HomePage />}></Route>
                <Route path="/categories" element={<CategoryPage />}></Route>
                <Route path="/products" element={<ProductListPage />}></Route>
                <Route path="/search" element={<SearchPage />}></Route>
                <Route path="/filters" element={<ProductListPage openFilter />}></Route>
                <Route path="/products/:slug/gallery" element={<GalleryPage />}></Route>
                <Route path="/products/:slug/quote" element={<QuoteRequestPage />}></Route>
                <Route path="/products/:slug" element={<ProductDetailPage />}></Route>
                <Route path="/contact" element={<FoundationScreen routeKey="contact" />}></Route>
                <Route path="/system" element={<FoundationScreen routeKey="system-states" />}></Route>
                <Route path="*" element={<FoundationScreen routeKey="system-states" />}></Route>
              </AnimationRoutes>
            </Suspense>
          </ZMPRouter>
        </AppProvider>
      </SnackbarProvider>
    </App>
  );
};
export default Layout;
