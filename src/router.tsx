import { createBrowserRouter } from "react-router-dom";
import Layout from "./components/layout";
import { getBasePath } from "./utils/zma";
import HomePage from "./pages/home";
import MenuPage from "./pages/menu";
import OrderPage from "./pages/order";
import ProfilePage from "./pages/profile";
import SearchPage from "./pages/search";
import ProductDetailPage from "./pages/product-detail";
import CheckoutPage from "./pages/checkout";
import SelectLocationPage from "./pages/select-location";
import OrderSuccessPage from "./pages/order-success";
import OrderDetailPage from "./pages/order-detail";
import CustomRequestPage from "./pages/custom-request";
import CustomRequestHistoryPage from "./pages/custom-request/history";
import CustomRequestDetailPage from "./pages/custom-request/history/detail";
import { copy } from "@/constants/copy";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Layout />,
      children: [
        { path: "/", element: <HomePage /> },
        { path: "/menu", element: <MenuPage /> },
        {
          path: "/order",
          element: <OrderPage />,
          handle: {
            hideCart: true,
          },
        },
        {
          path: "/profile",
          element: <ProfilePage />,
          handle: {
            title: copy.header.profile,
            back: false,
            whiteBackground: true,
            headerPosition: "sticky",
            hideCart: true,
          },
        },
        { path: "/menu/search", element: <SearchPage /> },
        {
          path: "/product/:id",
          element: <ProductDetailPage />,
          handle: {
            whiteBackground: true,
            hideFooter: true,
            hideHeader: true,
          },
        },
        {
          path: "/checkout",
          element: <CheckoutPage />,
          handle: {
            title: copy.header.delivery,
            back: true,
            whiteBackground: true,
            hideFooter: true,
            headerPosition: "sticky",
          },
        },
        {
          path: "/select-location",
          element: <SelectLocationPage />,
          handle: {
            back: true,
            title: copy.header.selectLocation,
            hideFooter: true,
            headerPosition: "sticky",
            whiteBackground: true,
            hideHeader: true,
          },
        },
        {
          path: "/order-success",
          element: <OrderSuccessPage />,
          handle: {
            title: copy.header.confirmation,
            whiteBackground: true,
            hideFooter: true,
          },
        },
        {
          path: "/order/:orderId",
          element: <OrderDetailPage />,
          handle: {
            title: " ",
            back: true,
            whiteBackground: true,
            hideFooter: true,
            headerPosition: "sticky",
            hideCart: true,
          },
        },
        {
          path: "/custom-request",
          element: <CustomRequestPage />,
          handle: {
            title: copy.custom.formTitle,
            back: true,
            whiteBackground: true,
            hideFooter: true,
            headerPosition: "sticky",
            hideCart: true,
          },
        },
        {
          path: "/custom-request/history",
          element: <CustomRequestHistoryPage />,
          handle: {
            title: copy.custom.historyTitle,
            back: true,
            whiteBackground: true,
            hideFooter: true,
            headerPosition: "sticky",
            hideCart: true,
          },
        },
        {
          path: "/custom-request/history/:id",
          element: <CustomRequestDetailPage />,
          handle: {
            title: copy.custom.detailTitle,
            back: true,
            whiteBackground: true,
            hideFooter: true,
            headerPosition: "sticky",
            hideCart: true,
          },
        },
      ],
    },
  ],
  {
    basename: getBasePath(),
  },
);

export default router;
