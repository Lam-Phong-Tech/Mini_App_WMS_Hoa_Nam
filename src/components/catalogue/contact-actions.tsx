import type { MouseEvent } from "react";
import { useSnackbar } from "zmp-ui";

import { getContactTargets, getPublicHotline, OA_UNAVAILABLE_MESSAGE } from "@/services/contact-config";
import { openDeviceDialer } from "@/services/phone-dialer";
import { PublicConfigDto } from "@/types/public-api";
import { UiIcon } from "@/components/ui-icon";

interface ContactActionsProps {
  config: PublicConfigDto | null;
  compact?: boolean;
  /**
   * Detail uses a stable two-action footer from the wireframe. When public
   * config is not ready, keep the buttons visible but disabled—never invent a
   * phone number or OA URL just to fill the UI.
   */
  showUnavailable?: boolean;
  className?: string;
}

export const ContactActions = ({
  config,
  compact = false,
  showUnavailable = false,
  className = "",
}: ContactActionsProps) => {
  const { openSnackbar } = useSnackbar();
  const hotline = getPublicHotline(config);
  const targets = getContactTargets(config);
  if (!hotline && !showUnavailable) return null;

  const notifyOaUnavailable = () => {
    openSnackbar({
      text: OA_UNAVAILABLE_MESSAGE,
      type: "warning",
      icon: true,
      duration: 3500,
    });
  };

  const openDialer = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!hotline || !targets.hotlineHref) return;

    event.preventDefault();
    openDeviceDialer(hotline.tel, targets.hotlineHref);
  };

  return (
    <div className={`contact-actions ${compact ? "contact-actions--compact" : ""} ${className}`.trim()}>
      {hotline && targets.hotlineHref ? (
        <a
          className="contact-link contact-link--hotline"
          href={targets.hotlineHref}
          aria-label={`Gọi ${hotline.display}`}
          onClick={openDialer}
        >
          <span className="contact-link__button">
            <UiIcon name="phone" size={17} />
            {hotline.display}
          </span>
        </a>
      ) : showUnavailable ? <button className="contact-action-placeholder contact-action-placeholder--hotline" type="button" disabled><UiIcon name="phone" size={17} />Gọi hotline</button> : null}
      {targets.oaUrl ? <a className="contact-link contact-link--oa" href={targets.oaUrl} aria-label="Mở Chat Zalo OA"><span className="contact-link__button"><UiIcon name="message" size={17} />Chat Zalo OA</span></a> : <button className="contact-action-placeholder contact-action-placeholder--oa" type="button" onClick={notifyOaUnavailable}><UiIcon name="message" size={17} />Chat Zalo OA</button>}
    </div>
  );
};
