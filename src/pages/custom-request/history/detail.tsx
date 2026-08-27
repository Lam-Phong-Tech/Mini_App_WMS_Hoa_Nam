import { useNavigate, useParams } from "react-router-dom";
import { Button, Spinner, Text, useSnackbar } from "zmp-ui";
import { copy } from "@/constants/copy";
import { formatCurrency } from "@/utils/format";
import { formatOrderDate } from "@/utils/order";
import {
  useCancelCustomRequest,
  useConfirmCustomRequestQuote,
} from "@/services/custom-request/custom-request.mutations";
import { useCustomRequestById } from "@/services/custom-request/custom-request.queries";
import { CustomFlowerRequestStatus } from "@/types/custom-request.types";

const STAGE_ORDER: CustomFlowerRequestStatus[] = [
  "NEW",
  "CONSULTING",
  "SAMPLE_SENT",
  "WAITING_CUSTOMER_CONFIRMATION",
  "CONFIRMED",
  "CONVERTED_TO_ORDER",
];

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4">
      <div className="text-small text-text-secondary">{label}</div>
      <div className="text-small text-text-primary text-right">{value}</div>
    </div>
  );
}

export default function CustomRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { openSnackbar } = useSnackbar();

  const { data: request, isLoading } = useCustomRequestById(id || "");
  const { mutate: cancelRequest, isPending: isCancelling } =
    useCancelCustomRequest();
  const { mutate: confirmQuote, isPending: isConfirming } =
    useConfirmCustomRequestQuote();

  if (isLoading || !request) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const currentStageIndex = STAGE_ORDER.indexOf(request.status);
  const isCancelled = request.status === "CANCELLED";
  const latestQuote = request.quotes[request.quotes.length - 1];
  const canCancel = !isCancelled && request.status !== "CONVERTED_TO_ORDER";
  const canConfirmQuote = request.status === "WAITING_CUSTOMER_CONFIRMATION";

  const handleCancel = () => {
    cancelRequest(request.id, {
      onSuccess: () => openSnackbar({ text: "Đã hủy yêu cầu", type: "success" }),
      onError: (error) => openSnackbar({ text: error.message, type: "error" }),
    });
  };

  const handleConfirmQuote = () => {
    confirmQuote(request.id, {
      onSuccess: () =>
        openSnackbar({ text: copy.custom.confirmQuote, type: "success" }),
      onError: (error) => openSnackbar({ text: error.message, type: "error" }),
    });
  };

  return (
    <div className="flex h-full flex-col bg-elevation-01">
      <div className="no-scrollbar flex-1 overflow-y-auto pb-28">
        <div className="mx-3.5 mt-3 rounded-lg bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <Text className="text-large-m">{copy.custom.detailTitle}</Text>
            <Text className="text-xsmall text-text-secondary">
              # {request.requestCode}
            </Text>
          </div>

          {!isCancelled ? (
            <div className="flex items-center">
              {STAGE_ORDER.map((stage, index) => (
                <div key={stage} className="flex flex-1 items-center last:flex-none">
                  <div
                    className={`flex h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                      index <= currentStageIndex ? "bg-primary" : "bg-neutral100"
                    }`}
                  />
                  {index < STAGE_ORDER.length - 1 && (
                    <div
                      className={`h-0.5 flex-1 ${
                        index < currentStageIndex ? "bg-primary" : "bg-neutral100"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg bg-red100 px-3 py-2 text-xsmall text-red500">
              {copy.custom.status.CANCELLED}
            </div>
          )}
          <div className="mt-2 text-xsmall font-medium text-primary">
            {copy.custom.status[request.status]}
          </div>
        </div>

        <div className="mx-3.5 mt-3 flex flex-col gap-3 rounded-lg bg-white p-4">
          <InfoRow label={copy.custom.createdAt} value={formatOrderDate(request.createdAt)} />
          <InfoRow label={copy.custom.occasion} value={request.occasion} />
          <InfoRow label={copy.custom.recipient} value={request.recipient} />
          <InfoRow label={copy.custom.budget} value={request.budget} />
          <InfoRow label={copy.custom.size} value={request.size} />
          <InfoRow label={copy.custom.flowerType} value={request.flowerType} />
          <InfoRow label={copy.custom.colorPreference} value={request.colorPreference} />
          <InfoRow label={copy.custom.stylePreference} value={request.stylePreference} />
          <InfoRow label={copy.custom.deliveryDate} value={request.deliveryDate} />
          <InfoRow label={copy.custom.deliveryTimeSlot} value={request.deliveryTimeSlot} />
          <InfoRow label={copy.custom.deliveryAddress} value={request.deliveryAddress} />
          <InfoRow label={copy.custom.cardMessage} value={request.cardMessage} />
          <InfoRow label={copy.custom.specialRequest} value={request.specialRequest} />
        </div>

        {request.referenceImages.length > 0 && (
          <div className="mx-3.5 mt-3 rounded-lg bg-white p-4">
            <Text className="mb-2 text-small-m">{copy.custom.referenceImage}</Text>
            <div className="flex gap-2">
              {request.referenceImages.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  className="h-20 w-20 rounded-lg object-cover"
                />
              ))}
            </div>
          </div>
        )}

        {latestQuote && (
          <div className="mx-3.5 mt-3 flex flex-col gap-3 rounded-lg bg-white p-4">
            <Text className="text-small-m">{copy.custom.quoteTitle}</Text>
            {latestQuote.sampleImage && (
              <img
                src={latestQuote.sampleImage}
                alt=""
                className="h-40 w-full rounded-lg object-cover"
              />
            )}
            <InfoRow
              label={copy.custom.quotePrice}
              value={`${formatCurrency(latestQuote.price)}đ`}
            />
            <InfoRow label={copy.custom.quoteEta} value={latestQuote.etaLabel} />
            <InfoRow label={copy.custom.quoteNote} value={latestQuote.note} />
          </div>
        )}
      </div>

      {(canCancel || canConfirmQuote) && (
        <div className="fixed bottom-0 left-0 right-0 z-40 flex gap-3 border-divider01 border-t bg-white px-4 py-4 pb-5">
          {canCancel && (
            <Button
              onClick={handleCancel}
              disabled={isCancelling}
              className="flex-1 rounded-lg border border-border-primary !bg-transparent py-3 font-medium text-text-primary active:!bg-transparent"
            >
              {copy.custom.cancelRequest}
            </Button>
          )}
          {canConfirmQuote && (
            <Button
              onClick={handleConfirmQuote}
              disabled={isConfirming}
              className="flex-1 rounded-lg bg-primary py-3 font-medium text-white active:bg-primary"
            >
              {copy.custom.confirmQuote}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
