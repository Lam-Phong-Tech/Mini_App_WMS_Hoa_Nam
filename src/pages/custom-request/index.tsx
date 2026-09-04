import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Text, useSnackbar } from "zmp-ui";
import { copy } from "@/constants/copy";
import { cn } from "@/utils/cn";
import DeliverySchedulePicker from "@/components/common/delivery-schedule-picker";
import { useCreateCustomRequest } from "@/services/custom-request/custom-request.mutations";
import { CloseIcon } from "@/components/common/vectors";
import { WmsField, WmsInput, WmsTextArea } from "@/components/ui/WmsRuntime";

const OCCASION_OPTIONS = [
  "Sinh nhật",
  "Kỷ niệm",
  "Tỏ tình",
  "Cầu hôn",
  "Khai trương",
  "Chúc mừng",
  "Tốt nghiệp",
  "Chia buồn",
  "Khác",
];

const SIZE_OPTIONS = ["Nhỏ", "Vừa", "Lớn"];

function SelectionGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Text size="xSmall" className="text-text-primary">
        {label}
      </Text>
      {children}
    </div>
  );
}

function ChipGroup({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xsmall",
              isSelected
                ? "border-primary bg-primary text-white"
                : "border-border-primary bg-white text-text-secondary",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

export default function CustomRequestPage() {
  const navigate = useNavigate();
  const { openSnackbar } = useSnackbar();
  const { mutate: createRequest, isPending } = useCreateCustomRequest();

  const [occasion, setOccasion] = useState("");
  const [recipient, setRecipient] = useState("");
  const [budget, setBudget] = useState("");
  const [flowerType, setFlowerType] = useState("");
  const [colorPreference, setColorPreference] = useState("");
  const [stylePreference, setStylePreference] = useState("");
  const [size, setSize] = useState("");
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [cardMessage, setCardMessage] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [deliveryTimeSlot, setDeliveryTimeSlot] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [specialRequest, setSpecialRequest] = useState("");

  const handleAddImage = () => {
    const url = imageUrlInput.trim();
    if (!url || referenceImages.length >= 3) return;
    setReferenceImages((prev) => [...prev, url]);
    setImageUrlInput("");
  };

  const isValid =
    occasion.trim() &&
    recipient.trim() &&
    budget.trim() &&
    deliveryTimeSlot.trim() &&
    deliveryAddress.trim();

  const handleSubmit = () => {
    if (!isValid) {
      openSnackbar({
        text: "Vui lòng điền đủ dịp tặng, người nhận, ngân sách, khung giờ và địa chỉ giao",
        type: "warning",
      });
      return;
    }

    createRequest(
      {
        occasion,
        recipient,
        budget,
        flowerType: flowerType || undefined,
        colorPreference: colorPreference || undefined,
        stylePreference: stylePreference || undefined,
        size: size || undefined,
        referenceImages,
        cardMessage: cardMessage || undefined,
        deliveryDate,
        deliveryTimeSlot,
        deliveryAddress,
        specialRequest: specialRequest || undefined,
      },
      {
        onSuccess: () => {
          openSnackbar({ text: copy.custom.submitSuccess, type: "success" });
          navigate("/custom-request/history", { replace: true });
        },
        onError: (error) => {
          openSnackbar({ text: error.message, type: "error" });
        },
      },
    );
  };

  return (
    <div className="flex h-full flex-col bg-elevation-01">
      <div className="no-scrollbar flex-1 overflow-y-auto pb-28">
        <div className="mx-3.5 mt-3 flex flex-col gap-1">
          <div className="text-xlarge-m text-text-primary">
            {copy.custom.formTitle}
          </div>
          <div className="text-xsmall text-text-secondary">
            {copy.custom.formSubtitle}
          </div>
        </div>

        <div className="mx-3.5 mt-4 flex flex-col gap-4 rounded-xl bg-white p-4">
          <SelectionGroup label={copy.custom.occasion}>
            <ChipGroup
              options={OCCASION_OPTIONS}
              value={occasion}
              onChange={setOccasion}
            />
          </SelectionGroup>

          <WmsField label={copy.custom.recipient}>
            <WmsInput
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={copy.custom.recipientPlaceholder}
            />
          </WmsField>

          <WmsField label={copy.custom.budget}>
            <WmsInput
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder={copy.custom.budgetPlaceholder}
            />
          </WmsField>

          <SelectionGroup label={copy.custom.size}>
            <ChipGroup options={SIZE_OPTIONS} value={size} onChange={setSize} />
          </SelectionGroup>
        </div>

        <div className="mx-3.5 mt-3 flex flex-col gap-4 rounded-xl bg-white p-4">
          <WmsField label={copy.custom.flowerType}>
            <WmsInput
              value={flowerType}
              onChange={(e) => setFlowerType(e.target.value)}
              placeholder={copy.custom.flowerTypePlaceholder}
            />
          </WmsField>

          <WmsField label={copy.custom.colorPreference}>
            <WmsInput
              value={colorPreference}
              onChange={(e) => setColorPreference(e.target.value)}
              placeholder={copy.custom.colorPreferencePlaceholder}
            />
          </WmsField>

          <WmsField label={copy.custom.stylePreference}>
            <WmsInput
              value={stylePreference}
              onChange={(e) => setStylePreference(e.target.value)}
              placeholder={copy.custom.stylePreferencePlaceholder}
            />
          </WmsField>

          <SelectionGroup label={copy.custom.referenceImage}>
            <div className="flex flex-col gap-2">
              <div className="text-xxxsmall text-text-disabled">
                {copy.custom.referenceImageHint}
              </div>
              {referenceImages.length > 0 && (
                <div className="flex gap-2">
                  {referenceImages.map((url, index) => (
                    <div key={url + index} className="relative h-16 w-16">
                      <img
                        src={url}
                        alt=""
                        className="h-16 w-16 rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setReferenceImages((prev) =>
                            prev.filter((_, i) => i !== index),
                          )
                        }
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow"
                      >
                        <CloseIcon size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {referenceImages.length < 3 && (
                <div className="flex gap-2">
                  <WmsField className="min-w-0 flex-1" label="Link ảnh mẫu">
                    <WmsInput
                      value={imageUrlInput}
                      onChange={(e) => setImageUrlInput(e.target.value)}
                      placeholder="Dán link ảnh mẫu"
                    />
                  </WmsField>
                  <Button
                    onClick={handleAddImage}
                    className="!w-fit rounded-lg !bg-neutral100 px-3 !text-text-primary"
                  >
                    {copy.custom.referenceImageAdd}
                  </Button>
                </div>
              )}
            </div>
          </SelectionGroup>

          <WmsField
            label={copy.custom.cardMessage}
            helper={`${cardMessage.length}/200`}
          >
            <WmsTextArea
              value={cardMessage}
              onChange={(e) => setCardMessage(e.target.value.slice(0, 200))}
              maxLength={200}
              placeholder={copy.custom.cardMessagePlaceholder}
              className="min-h-20"
            />
          </WmsField>
        </div>

        <div className="mx-3.5 mt-3 flex flex-col gap-4 rounded-xl bg-white p-4">
          <DeliverySchedulePicker
            dateLabel={copy.custom.deliveryDate}
            timeSlotLabel={copy.custom.deliveryTimeSlot}
            selectedDate={deliveryDate}
            selectedTimeSlot={deliveryTimeSlot}
            onDateChange={setDeliveryDate}
            onTimeSlotChange={setDeliveryTimeSlot}
          />

          <WmsField label={copy.custom.deliveryAddress}>
            <WmsInput
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder={copy.custom.deliveryAddressPlaceholder}
            />
          </WmsField>

          <WmsField
            label={copy.custom.specialRequest}
            helper={`${specialRequest.length}/200`}
          >
            <WmsTextArea
              value={specialRequest}
              onChange={(e) => setSpecialRequest(e.target.value.slice(0, 200))}
              maxLength={200}
              placeholder={copy.custom.specialRequestPlaceholder}
              className="min-h-20"
            />
          </WmsField>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-divider01 border-t bg-white px-4 py-4 pb-5">
        <Button
          onClick={handleSubmit}
          disabled={isPending}
          className="w-full rounded-lg bg-primary py-3 font-medium text-white active:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? copy.custom.submitting : copy.custom.submit}
        </Button>
      </div>
    </div>
  );
}
