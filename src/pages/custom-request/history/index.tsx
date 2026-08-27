import { useNavigate } from "react-router-dom";
import { Button, Spinner, Text } from "zmp-ui";
import { copy } from "@/constants/copy";
import { useCustomRequests } from "@/services/custom-request/custom-request.queries";
import { CustomFlowerRequestStatus } from "@/types/custom-request.types";
import { ChevronRightIcon } from "@/components/common/vectors";
import { cn } from "@/utils/cn";
import { formatOrderDate } from "@/utils/order";

const STATUS_STYLE: Record<CustomFlowerRequestStatus, string> = {
  NEW: "bg-blue100 text-blue600",
  CONSULTING: "bg-yellow100 text-yellow700",
  SAMPLE_SENT: "bg-yellow100 text-yellow700",
  WAITING_CUSTOMER_CONFIRMATION: "bg-orange500/10 text-orange600",
  CONFIRMED: "bg-green100 text-green500",
  CONVERTED_TO_ORDER: "bg-green100 text-green500",
  CANCELLED: "bg-red100 text-red500",
};

export default function CustomRequestHistoryPage() {
  const navigate = useNavigate();
  const { data: requests, isLoading } = useCustomRequests();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const isEmpty = !requests || requests.length === 0;

  return (
    <div className="flex h-full flex-col bg-elevation-01">
      {isEmpty ? (
        <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <Text className="text-base font-medium text-text-primary">
              {copy.custom.historyEmpty}
            </Text>
            <Text size="xSmall" className="text-text-secondary">
              {copy.custom.historyEmptyHint}
            </Text>
          </div>
          <Button
            onClick={() => navigate("/custom-request")}
            className="rounded-full border border-primary !bg-transparent px-8 py-3 text-small text-primary active:!bg-transparent"
          >
            {copy.custom.newRequest}
          </Button>
        </div>
      ) : (
        <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
          {requests.map((request) => (
            <div
              key={request.id}
              onClick={() => navigate(`/custom-request/history/${request.id}`)}
              className="flex cursor-pointer flex-col gap-2 rounded-lg bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <Text className="text-xsmall text-text-secondary">
                  # {request.requestCode}
                </Text>
                <span
                  className={cn(
                    "rounded-full px-2 py-1 text-xxxsmall font-medium",
                    STATUS_STYLE[request.status],
                  )}
                >
                  {copy.custom.status[request.status]}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <Text className="text-small-m text-text-primary">
                    {request.occasion} — {request.recipient}
                  </Text>
                  <Text size="xSmall" className="text-text-disabled">
                    {formatOrderDate(request.createdAt)}
                  </Text>
                </div>
                <ChevronRightIcon className="h-5 w-5 text-text-secondary" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isEmpty && (
        <div className="border-divider01 border-t bg-white px-4 py-4 pb-5">
          <Button
            onClick={() => navigate("/custom-request")}
            className="w-full rounded-lg bg-primary py-3 font-medium text-white active:bg-primary"
          >
            {copy.custom.newRequest}
          </Button>
        </div>
      )}
    </div>
  );
}
