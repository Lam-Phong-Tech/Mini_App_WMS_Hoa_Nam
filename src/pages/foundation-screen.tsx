import { Button, useSnackbar } from "zmp-ui";
import { useNavigate } from "zmp-ui";

import { AppShell } from "@/components/app-shell";
import { SystemStatePanel } from "@/components/system-state-panel";
import { FoundationRouteKey, getFoundationRoute } from "@/routes";
import { useAppContext } from "@/state/app-context";
import { createEmptyState, createLoadingState } from "@/state/system-state";
import { UiIcon } from "@/components/ui-icon";
import { getContactTargets, getPublicHotline, OA_MAINTENANCE_MESSAGE } from "@/services/contact-config";
import { openDeviceDialer } from "@/services/phone-dialer";

interface FoundationScreenProps {
  routeKey: Exclude<FoundationRouteKey, "launch" | "home">;
}

const screenCopy: Record<FoundationScreenProps["routeKey"], { heading: string; body: string }> = {
  categories: {
    heading: "Danh mục sản phẩm",
    body: "Danh mục sẽ hiển thị khi có thông tin phù hợp.",
  },
  products: {
    heading: "Danh sách sản phẩm đang sẵn sàng",
    body: "Grid, phân trang và dữ liệu thực sẽ được hoàn thiện ở G2 qua API boundary này.",
  },
  search: {
    heading: "Tìm kiếm sản phẩm",
    body: "Search chuẩn hóa, ưu tiên model/mã hàng và không dấu sẽ được kết nối ở G2.",
  },
  filters: {
    heading: "Lọc & sắp xếp",
    body: "Facet chỉ hiển thị khi Public API trả option hợp lệ; không có filter cứng trong UI.",
  },
  "product-detail": {
    heading: "Chi tiết sản phẩm",
    body: "Media, variant, thông số và related chỉ xuất hiện khi Public DTO có dữ liệu được duyệt.",
  },
  gallery: {
    heading: "Xem ảnh sản phẩm",
    body: "Gallery chỉ tải media công khai đã được duyệt; G1 không dùng ảnh demo hoặc ảnh catalogue nhúng.",
  },
  "quote-request": {
    heading: "Yêu cầu tư vấn",
    body: "Gửi thông tin sản phẩm và nhu cầu của bạn để Hoa Nam tiếp nhận yêu cầu tư vấn.",
  },
  contact: {
    heading: "Liên hệ Hoa Nam",
    body: "Chọn kênh hỗ trợ phù hợp với nhu cầu của bạn.",
  },
  "system-states": {
    heading: "Trạng thái hệ thống",
    body: "Loading, empty, no-network, API error, rate-limit, maintenance, unavailable và update-required dùng thông điệp an toàn.",
  },
};

export const FoundationScreen = ({ routeKey }: FoundationScreenProps) => {
  const navigate = useNavigate();
  const { openSnackbar } = useSnackbar();
  const route = getFoundationRoute(routeKey);
  const { phase, config, systemState, refresh } = useAppContext();
  const copy = screenCopy[routeKey];

  if (phase === "loading") {
    return (
      <AppShell route={route}>
        <SystemStatePanel state={createLoadingState()} />
      </AppShell>
    );
  }

  if (systemState) {
    return (
      <AppShell route={route}>
        <SystemStatePanel state={systemState} onRetry={() => void refresh()} />
      </AppShell>
    );
  }

  if (routeKey === "contact") {
    const hotline = getPublicHotline(config);
    const contactTargets = getContactTargets(config);
    const supportHours = config?.support_hours?.intervals ?? [];
    return (
      <AppShell route={route}>
        <section className="contact-hero-card">
          <div className="contact-hero-card__icon"><UiIcon name="message" size={34} strokeWidth={1.8} /></div>
          <h2>Cần hỗ trợ về sản phẩm?</h2>
          <p>Chọn một trong hai kênh liên hệ chính thức của Hoa Nam.</p>
        </section>
        <section className="contact-channel-list" aria-label="Kênh liên hệ">
          <a
            className="contact-channel-card contact-channel-card--hotline"
            href={contactTargets.hotlineHref ?? undefined}
            aria-disabled={!hotline}
            onClick={(event) => {
              if (!hotline || !contactTargets.hotlineHref) {
                event.preventDefault();
                return;
              }

              event.preventDefault();
              openDeviceDialer(hotline.tel, contactTargets.hotlineHref);
            }}
          >
              <span className="contact-channel-card__icon"><UiIcon name="phone" size={27} strokeWidth={1.8} /></span>
              <span><strong>Gọi hotline</strong><small>{hotline?.display ?? "Hotline đang được cập nhật"}</small></span>
              <UiIcon name="chevronRight" size={22} />
          </a>
          <button
            className="contact-channel-card contact-channel-card--oa"
            type="button"
            onClick={() => openSnackbar({ text: OA_MAINTENANCE_MESSAGE, type: "warning", icon: true, duration: 3500 })}
          >
              <span className="contact-channel-card__icon"><strong>Z</strong></span>
              <span><strong>Chat Zalo OA</strong><small>Tính năng đang được bảo trì</small></span>
              <UiIcon name="chevronRight" size={22} />
          </button>
        </section>
        <aside className="contact-demo-alert">
          <UiIcon name="info" size={20} />
          <p>Hotline nhận giá trị từ Public Config API. Chat Zalo OA tạm thời hiển thị trạng thái bảo trì.</p>
        </aside>
        {supportHours.length ? (
          <section className="info-card contact-info-card">
            <div className="contact-hours">
              <strong>Giờ hỗ trợ</strong>
              {supportHours.map((interval, index) => (
                <p key={`${interval.days.join("-")}:${interval.opens_at}:${index}`}>
                  {interval.days.join(", ")}: {interval.opens_at} – {interval.closes_at}
                </p>
              ))}
            </div>
          </section>
        ) : null}
        {config?.privacy_policy_url ? <a className="privacy-link" href={config.privacy_policy_url}>Chính sách dữ liệu</a> : null}
      </AppShell>
    );
  }

  return (
    <AppShell route={route}>
      <section className="info-card">
        <h2>{copy.heading}</h2>
        <p>{copy.body}</p>
        {routeKey === "categories" ? (
          <Button variant="primary" onClick={() => navigate("/products", { animate: false })}>Mở danh sách</Button>
        ) : null}
      </section>
      <SystemStatePanel state={createEmptyState()} onRetry={() => void refresh()} />
    </AppShell>
  );
};
