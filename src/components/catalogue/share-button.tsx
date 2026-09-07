import { useState } from "react";
import { Button } from "zmp-ui";

import { getProductShareContext, shareProduct, ShareResult } from "@/services/share";
import { ProductDetailDto, VariantDto } from "@/types/public-api";
import { UiIcon } from "@/components/ui-icon";

interface ShareButtonProps {
  product: ProductDetailDto;
  variant: VariantDto | null;
}

const resultMessage: Record<ShareResult, string> = {
  shared: "Đã mở lựa chọn chia sẻ.",
  "fallback-shared": "Đã mở chia sẻ của thiết bị.",
  copied: "Đã sao chép liên kết sản phẩm.",
  unavailable: "Không thể mở chia sẻ lúc này.",
};

export const ShareButton = ({ product, variant }: ShareButtonProps) => {
  const [status, setStatus] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const onShare = async () => {
    if (sharing) return;
    setSharing(true);
    const result = await shareProduct(getProductShareContext(product, variant));
    setStatus(resultMessage[result]);
    setSharing(false);
  };

  return (
    <div className="share-action">
      <Button variant="secondary" onClick={() => void onShare()} disabled={sharing}>
        <UiIcon name="share" size={17} />{sharing ? "Đang chia sẻ" : "Chia sẻ"}
      </Button>
      {status ? <span className="share-action__status" aria-live="polite">{status}</span> : null}
    </div>
  );
};
