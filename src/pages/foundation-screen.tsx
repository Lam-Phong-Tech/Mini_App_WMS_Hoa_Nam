import { Button, useSnackbar } from "zmp-ui";
import { useNavigate } from "zmp-ui";

import { AppShell } from "@/components/app-shell";
import { SystemStatePanel } from "@/components/system-state-panel";
import { FoundationRouteKey, getFoundationRoute } from "@/routes";
import { useAppContext } from "@/state/app-context";
import { createEmptyState, createLoadingState } from "@/state/system-state";
import { UiIcon } from "@/components/ui-icon";
import { formatSupportDays, getContactTargets, getPublicHotline } from "@/services/contact-config";
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
  recent: {
    heading: "Sản phẩm đã xem",
    body: "Danh sách sản phẩm đã xem trên thiết bị này.",
  },
  saved: {
    heading: "Sản phẩm đã lưu",
    body: "Danh sách sản phẩm đã lưu trên thiết bị này.",
  },
  selection: {
    heading: "Chọn sản phẩm",
    body: "Chọn sản phẩm để gửi yêu cầu tư vấn.",
  },
  compare: {
    heading: "So sánh sản phẩm",
    body: "Đối chiếu các sản phẩm cùng danh mục.",
  },
  requests: {
    heading: "Yêu cầu đã gửi",
    body: "Các yêu cầu được tiếp nhận trong lần mở app này.",
  },
  help: {
    heading: "Hướng dẫn",
    body: "Câu hỏi thường gặp về sản phẩm và yêu cầu tư vấn.",
  },
  "system-states": {
    heading: "Trạng thái hệ thống",
    body: "Loading, empty, no-network, API error, rate-limit, maintenance, unavailable và update-required dùng thông điệp an toàn.",
  },
};

const copyPhoneNumber = async (value: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "true");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(input);
    return copied;
  } catch {
    return false;
  }
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
        <section className="contact-screen" aria-labelledby="contact-screen-title">
          <header className="contact-screen__intro">
            <div className="contact-screen__kicker"><UiIcon name="message" size={20} /><span>KẾT NỐI VỚI HOA NAM</span></div>
            <h1 id="contact-screen-title">Liên hệ & tư vấn</h1>
            <p>Chọn cách kết nối phù hợp với bạn.</p>
          </header>

          <div className="contact-screen__methods" aria-label="Kênh liên hệ">
            <article className="contact-screen__card contact-screen__card--primary">
              <div className="contact-screen__card-heading">
                <span className="contact-screen__icon"><UiIcon name="send" size={24} /></span>
                <h2>Gửi yêu cầu đặt hàng</h2>
              </div>
              <p>Chọn sản phẩm và để lại thông tin, Hoa Nam sẽ liên hệ.</p>
              <button className="contact-screen__button contact-screen__button--primary" type="button" onClick={() => navigate("/selection", { animate: false })}>
                Gửi yêu cầu đặt hàng <UiIcon name="arrowRight" size={19} />
              </button>
            </article>

            <article className="contact-screen__card">
              <div className="contact-screen__card-heading">
                <UiIcon name="phone" size={24} />
                <h2>Gọi hotline</h2>
              </div>
              {hotline && contactTargets.hotlineHref ? (
                <>
                  <div className="contact-screen__phone-row">
                    <a
                      className="contact-screen__phone"
                      href={contactTargets.hotlineHref}
                      aria-label={`Gọi hotline ${hotline.display}`}
                      onClick={(event) => {
                        event.preventDefault();
                        openDeviceDialer(hotline.tel, contactTargets.hotlineHref!);
                      }}
                    >
                      {hotline.display}
                    </a>
                    <button
                      className="contact-screen__phone-copy"
                      type="button"
                      aria-label="Sao chép số điện thoại"
                      onClick={() => {
                        void copyPhoneNumber(hotline.display).then((copied) => openSnackbar({
                          text: copied ? "Đã sao chép số điện thoại." : "Không thể sao chép số điện thoại.",
                          type: copied ? "success" : "warning",
                          icon: true,
                        }));
                      }}
                    >
                      <UiIcon name="copy" size={20} />
                    </button>
                  </div>
                  <p>Trao đổi trực tiếp với nhân viên tư vấn.</p>
                  <a
                    className="contact-screen__button contact-screen__button--outline"
                    href={contactTargets.hotlineHref}
                    onClick={(event) => {
                      event.preventDefault();
                      openDeviceDialer(hotline.tel, contactTargets.hotlineHref!);
                    }}
                  >
                    <UiIcon name="phone" size={18} /> Gọi ngay
                  </a>
                </>
              ) : <>
                <span className="contact-screen__unavailable">Hotline đang được cập nhật</span>
                <p>Kênh gọi chưa có cấu hình công khai.</p>
              </>}
            </article>

            <article className="contact-screen__card">
              <div className="contact-screen__card-heading">
                <span className="contact-screen__icon contact-screen__icon--neutral"><UiIcon name="message" size={24} /></span>
                <h2>Nhắn Zalo OA</h2>
              </div>
              <span className="contact-screen__unavailable">Tạm thời chưa khả dụng</span>
              <p>Bạn vẫn có thể gửi yêu cầu hoặc gọi hotline.</p>
            </article>
          </div>

          {supportHours.length ? (
            <section className="contact-screen__card contact-screen__hours" aria-labelledby="contact-hours-title">
              <div className="contact-screen__card-heading"><UiIcon name="clock" size={24} /><h2 id="contact-hours-title">Giờ hỗ trợ</h2></div>
              <dl>
                {supportHours.map((interval, index) => (
                  <div key={`${interval.days.join("-")}:${interval.opens_at}:${index}`}>
                    <dt>{formatSupportDays(interval.days)}</dt>
                    <dd>{interval.opens_at} – {interval.closes_at}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <button className="contact-screen__browse" type="button" onClick={() => navigate("/products", { animate: false })}>Tiếp tục xem sản phẩm <UiIcon name="arrowRight" size={19} /></button>
        </section>
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
