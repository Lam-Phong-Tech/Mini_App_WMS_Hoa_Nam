import { Suspense, lazy } from "react";
import {
  AnimationRoutes,
  App,
  Route,
  SnackbarProvider,
  ZMPRouter,
} from "zmp-ui";

import { AppProvider } from "@/state/app-context";
import { ProductLibraryProvider } from "@/state/product-library-context";
import { QuoteWorkflowProvider } from "@/state/quote-workflow-context";
import { CompareProvider } from "@/state/compare-context";

const FoundationScreen = lazy(() => import("@/pages/foundation-screen").then((module) => ({ default: module.FoundationScreen })));
const CategoryPage = lazy(() => import("@/pages/category"));
const GalleryPage = lazy(() => import("@/pages/gallery"));
const HomePage = lazy(() => import("@/pages/index"));
const LaunchPage = lazy(() => import("@/pages/launch").then((module) => ({ default: module.LaunchPage })));
const ProductDetailPage = lazy(() => import("@/pages/product-detail"));
const ProductListPage = lazy(() => import("@/pages/product-list"));
const ProductLibraryPage = lazy(() => import("@/pages/product-library"));
const ProductSelectionPage = lazy(() => import("@/pages/product-selection"));
const ComparePage = lazy(() => import("@/pages/compare"));
const HelpPage = lazy(() => import("@/pages/help"));
const RequestReceiptsPage = lazy(() => import("@/pages/request-receipts"));
const SearchPage = lazy(() => import("@/pages/search"));
const QuoteRequestPage = lazy(() => import("@/pages/quote-request"));

const RouteLoading = () => <div className="route-loading" role="status">Đang mở…</div>;

const Layout = () => {
  return (
    // The approved Preview baseline is a light surface.  Do not inherit Zalo's
    // dark theme here because it changes the locked colour contract; controls
    // remain explicitly readable with the shared token theme.
    <App theme="light">
      <SnackbarProvider>
        <AppProvider>
          <ProductLibraryProvider>
          <QuoteWorkflowProvider>
          <CompareProvider>
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
                <Route path="/quote" element={<QuoteRequestPage />}></Route>
                <Route path="/selection" element={<ProductSelectionPage />}></Route>
                <Route path="/compare" element={<ComparePage />}></Route>
                <Route path="/help" element={<HelpPage />}></Route>
                <Route path="/requests" element={<RequestReceiptsPage />}></Route>
                <Route path="/recent" element={<ProductLibraryPage kind="recent" />}></Route>
                <Route path="/saved" element={<ProductLibraryPage kind="saved" />}></Route>
                <Route path="/contact" element={<FoundationScreen routeKey="contact" />}></Route>
                <Route path="/system" element={<FoundationScreen routeKey="system-states" />}></Route>
                <Route path="*" element={<FoundationScreen routeKey="system-states" />}></Route>
              </AnimationRoutes>
            </Suspense>
          </ZMPRouter>
          </CompareProvider>
          </QuoteWorkflowProvider>
          </ProductLibraryProvider>
        </AppProvider>
      </SnackbarProvider>
    </App>
  );
};
export default Layout;
