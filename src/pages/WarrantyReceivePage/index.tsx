import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppButton } from "@/components/ui/Button";
import { WmsFlowSteps } from "@/components/ui/FlowSteps";
import { PageContainer } from "@/components/ui/Page";
import {
  WmsCard,
  WmsField,
  WmsInput,
  WmsNotice,
  WmsPageHeader,
  WmsSelect,
  WmsTextArea,
} from "@/components/ui/WmsRuntime";
import {
  getVietnamProvinces,
  getVietnamWards,
  type VietnamProvince,
  type VietnamWard,
} from "@/services/vietnam-address.service";
import {
  createWarrantyCase,
  getActiveWarrantyDefects,
  getWarrantyErrorMessage,
  resolveWarrantyCode,
  type WarrantyDefectOption,
  type WarrantyResolveResult,
} from "@/services/warranty-flow.service";

const DESCRIPTION_DEFECT_PREFIX = "Bệnh/lỗi: ";
const initialForm = {
  customer_name: "",
  customer_phone: "",
  street_address: "",
  description: "",
  accessories_received: "",
  received_condition: "",
  missing_code_reason: "Mất tem/mã",
  manual_product_description: "",
};

type WarrantyForm = typeof initialForm;
type WarrantyFormErrors = Partial<
  Record<
    | "code"
    | "customer_name"
    | "customer_phone"
    | "province"
    | "ward"
    | "street_address"
    | "description"
    | "missing_code_reason"
    | "manual_product_description",
    string
  >
>;

export default function WarrantyReceivePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCode = searchParams.get("code") || "";
  const [rawCode, setRawCode] = useState(initialCode);
  const [tempOnly, setTempOnly] = useState(
    searchParams.get("tempOnly") === "1",
  );
  const [resolved, setResolved] = useState<WarrantyResolveResult>();
  const [isResolving, setIsResolving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [formErrors, setFormErrors] = useState<WarrantyFormErrors>({});
  const [form, setForm] = useState<WarrantyForm>(initialForm);
  const [provinces, setProvinces] = useState<VietnamProvince[]>([]);
  const [wards, setWards] = useState<VietnamWard[]>([]);
  const [selectedProvinceCode, setSelectedProvinceCode] = useState("");
  const [selectedWardCode, setSelectedWardCode] = useState("");
  const [isLoadingProvinces, setIsLoadingProvinces] = useState(false);
  const [isLoadingWards, setIsLoadingWards] = useState(false);
  const [addressError, setAddressError] = useState<string>();
  const [defects, setDefects] = useState<WarrantyDefectOption[]>([]);
  const [selectedDefectIds, setSelectedDefectIds] = useState<string[]>([]);
  const [defectSearch, setDefectSearch] = useState("");
  const [isLoadingDefects, setIsLoadingDefects] = useState(false);
  const [defectError, setDefectError] = useState<string>();

  useEffect(() => {
    let mounted = true;
    setIsLoadingProvinces(true);
    void getVietnamProvinces()
      .then((items) => mounted && setProvinces(items))
      .catch(() => {
        if (mounted) {
          setAddressError(
            "Không tải được danh sách tỉnh/thành. Vui lòng kiểm tra kết nối mạng.",
          );
        }
      })
      .finally(() => mounted && setIsLoadingProvinces(false));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const provinceCode = Number(selectedProvinceCode);
    setSelectedWardCode("");
    setWards([]);
    if (!provinceCode) return;

    let mounted = true;
    setIsLoadingWards(true);
    setAddressError(undefined);
    void getVietnamWards(provinceCode)
      .then((items) => mounted && setWards(items))
      .catch(() => {
        if (mounted) {
          setAddressError(
            "Không tải được danh sách phường/xã. Vui lòng chọn lại tỉnh/thành.",
          );
        }
      })
      .finally(() => mounted && setIsLoadingWards(false));
    return () => {
      mounted = false;
    };
  }, [selectedProvinceCode]);

  useEffect(() => {
    let mounted = true;
    setIsLoadingDefects(true);
    void getActiveWarrantyDefects()
      .then((items) => mounted && setDefects(items))
      .catch((requestError) => {
        if (mounted) setDefectError(getWarrantyErrorMessage(requestError));
      })
      .finally(() => mounted && setIsLoadingDefects(false));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (initialCode.trim()) void runResolve(initialCode);
    // Scanner chuyển mã về trang này; chỉ resolve một lần cho mỗi URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  const selectedProvince = useMemo(
    () =>
      provinces.find(
        (province) => String(province.code) === selectedProvinceCode,
      ),
    [provinces, selectedProvinceCode],
  );
  const selectedWard = useMemo(
    () => wards.find((ward) => String(ward.code) === selectedWardCode),
    [selectedWardCode, wards],
  );
  const customerAddress = useMemo(
    () =>
      [form.street_address.trim(), selectedWard?.name, selectedProvince?.name]
        .filter(Boolean)
        .join(", "),
    [form.street_address, selectedProvince?.name, selectedWard?.name],
  );
  const visibleDefects = useMemo(() => {
    const keyword = normalizeSearch(defectSearch);
    if (!keyword) return defects;
    return defects.filter((defect) =>
      normalizeSearch(
        [defect.defect_code, defect.defect_name, defect.description]
          .filter(Boolean)
          .join(" "),
      ).includes(keyword),
    );
  }, [defectSearch, defects]);

  const runResolve = async (code = rawCode) => {
    if (!code.trim()) {
      setFormErrors((current) => ({
        ...current,
        code: "Vui lòng nhập hoặc quét mã sản phẩm.",
      }));
      return;
    }
    setIsResolving(true);
    setError(undefined);
    setFormErrors((current) => ({ ...current, code: undefined }));
    try {
      const result = await resolveWarrantyCode(code);
      setResolved(result);
      setRawCode(result.item_code || result.raw_code || code);
      setTempOnly(result.recommended_flow === "TEMP_ONLY");
    } catch (requestError) {
      setResolved(undefined);
      setError(getWarrantyErrorMessage(requestError));
    } finally {
      setIsResolving(false);
    }
  };

  const submitCase = async () => {
    const nextErrors = validateWarrantyForm({
      form,
      rawCode,
      tempOnly,
      resolved,
      selectedProvince,
      selectedWard,
    });
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setError(
        "Vui lòng kiểm tra lại các trường bắt buộc trước khi tạo hồ sơ.",
      );
      return;
    }

    setIsSubmitting(true);
    setError(undefined);
    try {
      const commonPayload = {
        customer_name: form.customer_name,
        customer_phone: normalizePhone(form.customer_phone),
        customer_address: customerAddress,
        description: form.description,
        defect_ids: selectedDefectIds,
        accessories_received: form.accessories_received,
        received_condition: form.received_condition,
      };
      const response = await createWarrantyCase(
        tempOnly
          ? {
              ...commonPayload,
              missing_code_reason: form.missing_code_reason,
              manual_product_description: form.manual_product_description,
            }
          : { ...commonPayload, item_code: rawCode },
      );
      navigate(`/warranty/${encodeURIComponent(response.case.id)}?created=1`, {
        replace: true,
      });
    } catch (requestError) {
      setError(getWarrantyErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  };

  function updateField(field: keyof WarrantyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => ({ ...current, [field]: undefined }));
  }

  function toggleDefect(defectId: string) {
    const nextIds = selectedDefectIds.includes(defectId)
      ? selectedDefectIds.filter((id) => id !== defectId)
      : [...selectedDefectIds, defectId];
    const selectedNames = defects
      .filter((defect) => nextIds.includes(defect.defect_id))
      .map((defect) => defect.defect_name);
    setSelectedDefectIds(nextIds);
    setForm((current) => ({
      ...current,
      description: mergeDefectSuggestions(current.description, selectedNames),
    }));
    setFormErrors((current) => ({ ...current, description: undefined }));
  }

  return (
    <PageContainer className="space-y-4">
      <WmsPageHeader
        eyebrow="Bảo hành"
        title="Tạo hồ sơ bảo hành"
        onBack={() => navigate("/warranty")}
      />

      <WmsFlowSteps
        current={1}
        labels={["Tiếp nhận", "Tạo hồ sơ", "Kiểm tra"]}
      />

      <WmsCard className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.08em] text-emerald-700">
              {tempOnly ? "Không có mã" : "Có mã định danh"}
            </p>
            <h2 className="mt-1 text-[17px] font-black tracking-[-0.04em] text-[#06142A]">
              {tempOnly
                ? "Không có mã / mất tem"
                : "Quét hoặc nhập mã sản phẩm"}
            </h2>
          </div>
          <button
            className="rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-black text-emerald-700"
            type="button"
            onClick={() => {
              setTempOnly((current) => !current);
              setError(undefined);
              setFormErrors((current) => ({ ...current, code: undefined }));
            }}
          >
            {tempOnly ? "Nhập/quét mã" : "Mất mã"}
          </button>
        </div>

        {!tempOnly && (
          <>
            <WmsField
              label="Mã sản phẩm / serial"
              required
              error={formErrors.code}
            >
              <WmsInput
                value={rawCode}
                error={Boolean(formErrors.code)}
                maxLength={512}
                placeholder="SER-000123 hoặc QR/Barcode"
                onChange={(event) => {
                  setRawCode(event.target.value);
                  setResolved(undefined);
                  setFormErrors((current) => ({ ...current, code: undefined }));
                }}
              />
            </WmsField>
            <div className="grid grid-cols-2 gap-3">
              <AppButton
                fullWidth
                variant="secondary"
                icon="scan"
                onClick={() => navigate("/scanner/WARRANTY_ITEM")}
              >
                Quét camera
              </AppButton>
              <AppButton
                fullWidth
                icon="search"
                loading={isResolving}
                onClick={() => void runResolve()}
              >
                Kiểm tra mã
              </AppButton>
            </div>
          </>
        )}

        {resolved && (
          <WmsNotice
            tone={resolved.eligible_for_warranty ? "success" : "warning"}
            title={
              resolved.eligible_for_warranty
                ? "Mã đủ điều kiện bảo hành"
                : "Mã chưa đủ điều kiện"
            }
            description={buildWarrantyResolveDescription(resolved)}
          />
        )}
      </WmsCard>

      <WmsCard className="space-y-3">
        <h2 className="text-[17px] font-black tracking-[-0.04em] text-[#06142A]">
          Thông tin khách hàng
        </h2>
        <WmsField
          label="Tên khách hàng"
          required
          error={formErrors.customer_name}
        >
          <WmsInput
            value={form.customer_name}
            error={Boolean(formErrors.customer_name)}
            maxLength={200}
            placeholder="Nguyễn Văn A"
            onChange={(event) =>
              updateField("customer_name", event.target.value)
            }
          />
        </WmsField>
        <WmsField
          label="Số điện thoại"
          required
          error={formErrors.customer_phone}
        >
          <WmsInput
            inputMode="numeric"
            value={form.customer_phone}
            error={Boolean(formErrors.customer_phone)}
            placeholder="0901234567"
            onChange={(event) =>
              updateField("customer_phone", normalizePhone(event.target.value))
            }
          />
        </WmsField>

        {addressError && (
          <WmsNotice
            tone="warning"
            title="Không tải được dữ liệu địa chỉ"
            description={addressError}
          />
        )}
        <WmsField label="Tỉnh/Thành phố" required error={formErrors.province}>
          <WmsSelect
            value={selectedProvinceCode}
            disabled={isLoadingProvinces}
            error={Boolean(formErrors.province)}
            onChange={(event) => {
              setSelectedProvinceCode(event.target.value);
              setFormErrors((current) => ({
                ...current,
                province: undefined,
                ward: undefined,
              }));
            }}
          >
            <option value="">
              {isLoadingProvinces
                ? "Đang tải tỉnh/thành..."
                : "Chọn tỉnh/thành phố"}
            </option>
            {provinces.map((province) => (
              <option value={province.code} key={province.code}>
                {province.name}
              </option>
            ))}
          </WmsSelect>
        </WmsField>
        <WmsField label="Phường/Xã" required error={formErrors.ward}>
          <WmsSelect
            value={selectedWardCode}
            disabled={!selectedProvinceCode || isLoadingWards}
            error={Boolean(formErrors.ward)}
            onChange={(event) => {
              setSelectedWardCode(event.target.value);
              setFormErrors((current) => ({ ...current, ward: undefined }));
            }}
          >
            <option value="">
              {!selectedProvinceCode
                ? "Chọn tỉnh/thành trước"
                : isLoadingWards
                  ? "Đang tải phường/xã..."
                  : "Chọn phường/xã"}
            </option>
            {wards.map((ward) => (
              <option value={ward.code} key={ward.code}>
                {ward.name}
              </option>
            ))}
          </WmsSelect>
        </WmsField>
        <WmsField
          label="Số nhà, tên đường"
          required
          error={formErrors.street_address}
        >
          <WmsInput
            value={form.street_address}
            error={Boolean(formErrors.street_address)}
            maxLength={350}
            placeholder="Số nhà, tên đường, thôn/xóm..."
            onChange={(event) =>
              updateField("street_address", event.target.value)
            }
          />
        </WmsField>
      </WmsCard>

      <WmsCard className="space-y-3">
        <div>
          <h2 className="text-[17px] font-black tracking-[-0.04em] text-[#06142A]">
            Bệnh/lỗi khách báo
          </h2>
          <p className="mt-1 text-[12px] font-medium text-[#69758A]">
            Có thể chọn nhiều lỗi. App sẽ tự điền các lỗi đã chọn vào ô mô tả.
          </p>
        </div>
        {defectError && (
          <WmsNotice
            tone="warning"
            title="Không tải được danh mục bệnh/lỗi"
            description={`${defectError} Bạn vẫn có thể nhập mô tả thủ công.`}
          />
        )}
        <WmsField label="Tìm bệnh/lỗi">
          <WmsInput
            value={defectSearch}
            placeholder={
              isLoadingDefects ? "Đang tải bệnh/lỗi..." : "Nhập tên hoặc mã lỗi"
            }
            disabled={isLoadingDefects || defects.length === 0}
            onChange={(event) => setDefectSearch(event.target.value)}
          />
        </WmsField>
        {!isLoadingDefects && visibleDefects.length > 0 && (
          <div className="max-h-52 space-y-2 overflow-y-auto rounded-[var(--wms-radius-card)] border border-[var(--wms-divider)] bg-[var(--wms-surface-subtle)] p-2">
            {visibleDefects.map((defect) => {
              const selected = selectedDefectIds.includes(defect.defect_id);
              return (
                <button
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition active:scale-[0.99] ${
                    selected
                      ? "border-[#0F73DC] bg-blue-50 text-[#075BAE]"
                      : "border-transparent bg-white text-[#06142A]"
                  }`}
                  key={defect.defect_id}
                  type="button"
                  onClick={() => toggleDefect(defect.defect_id)}
                >
                  <span
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] font-black ${
                      selected
                        ? "border-[#0F73DC] bg-[#0F73DC] text-white"
                        : "border-[#C9D4E1] bg-white text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-black">
                      {defect.defect_name}
                    </span>
                    {(defect.defect_code || defect.description) && (
                      <span className="mt-0.5 block text-[11px] font-medium leading-4 opacity-70">
                        {[defect.defect_code, defect.description]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <WmsField label="Mô tả yêu cầu" required error={formErrors.description}>
          <WmsTextArea
            className="min-h-28"
            error={Boolean(formErrors.description)}
            value={form.description}
            maxLength={2000}
            placeholder="Khách báo lỗi / nhu cầu kiểm tra..."
            onChange={(event) => updateField("description", event.target.value)}
          />
        </WmsField>

        {tempOnly && (
          <>
            <WmsField
              label="Lý do thiếu mã"
              required
              error={formErrors.missing_code_reason}
            >
              <WmsInput
                value={form.missing_code_reason}
                error={Boolean(formErrors.missing_code_reason)}
                maxLength={500}
                placeholder="Mất tem/mã"
                onChange={(event) =>
                  updateField("missing_code_reason", event.target.value)
                }
              />
            </WmsField>
            <WmsField
              label="Mô tả sản phẩm thủ công"
              required
              error={formErrors.manual_product_description}
            >
              <WmsTextArea
                className="min-h-24"
                error={Boolean(formErrors.manual_product_description)}
                value={form.manual_product_description}
                maxLength={2000}
                placeholder="Tên/loại máy, nhãn hiệu, màu sắc, đặc điểm nhận dạng..."
                onChange={(event) =>
                  updateField("manual_product_description", event.target.value)
                }
              />
            </WmsField>
          </>
        )}

        <WmsField label="Phụ kiện nhận kèm">
          <WmsInput
            value={form.accessories_received}
            maxLength={1000}
            placeholder="Pin, sạc, hộp..."
            onChange={(event) =>
              updateField("accessories_received", event.target.value)
            }
          />
        </WmsField>
        <WmsField label="Tình trạng khi nhận">
          <WmsInput
            value={form.received_condition}
            maxLength={500}
            placeholder="Trầy xước nhẹ, còn nguyên tem..."
            onChange={(event) =>
              updateField("received_condition", event.target.value)
            }
          />
        </WmsField>

        {error && (
          <WmsNotice
            tone="danger"
            title="Không thể tạo hồ sơ bảo hành"
            description={error}
          />
        )}
        <div className="wms-sticky-action">
          <AppButton
            fullWidth
            icon="shield-check"
            loading={isSubmitting}
            disabled={isSubmitting}
            onClick={submitCase}
          >
            Tạo hồ sơ bảo hành
          </AppButton>
        </div>
      </WmsCard>
    </PageContainer>
  );
}

function validateWarrantyForm({
  form,
  rawCode,
  tempOnly,
  resolved,
  selectedProvince,
  selectedWard,
}: {
  form: WarrantyForm;
  rawCode: string;
  tempOnly: boolean;
  resolved?: WarrantyResolveResult;
  selectedProvince?: VietnamProvince;
  selectedWard?: VietnamWard;
}) {
  const errors: WarrantyFormErrors = {};
  if (!tempOnly) {
    if (!rawCode.trim()) {
      errors.code = "Vui lòng nhập hoặc quét mã sản phẩm.";
    } else if (!resolved?.eligible_for_warranty) {
      errors.code =
        "Vui lòng kiểm tra mã và bảo đảm sản phẩm đủ điều kiện bảo hành.";
    }
  }
  if (form.customer_name.trim().length < 2) {
    errors.customer_name = "Tên khách hàng phải có ít nhất 2 ký tự.";
  }
  if (!isVietnamPhoneNumber(form.customer_phone)) {
    errors.customer_phone =
      "Số điện thoại phải gồm 10 số và dùng đầu số Việt Nam: 03, 05, 07, 08 hoặc 09.";
  }
  if (!selectedProvince) errors.province = "Vui lòng chọn tỉnh/thành phố.";
  if (!selectedWard) {
    errors.ward = "Vui lòng chọn phường/xã sau khi chọn tỉnh/thành.";
  }
  if (!form.street_address.trim()) {
    errors.street_address = "Vui lòng nhập số nhà, tên đường hoặc thôn/xóm.";
  } else if (
    [form.street_address.trim(), selectedWard?.name, selectedProvince?.name]
      .filter(Boolean)
      .join(", ").length > 500
  ) {
    errors.street_address = "Địa chỉ đầy đủ không được vượt quá 500 ký tự.";
  }
  if (!form.description.trim()) {
    errors.description =
      "Vui lòng nhập mô tả yêu cầu hoặc chọn bệnh/lỗi gợi ý.";
  }
  if (tempOnly && !form.missing_code_reason.trim()) {
    errors.missing_code_reason = "Vui lòng nhập lý do không có mã sản phẩm.";
  }
  if (tempOnly && !form.manual_product_description.trim()) {
    errors.manual_product_description =
      "Vui lòng mô tả đầy đủ sản phẩm khi không có mã.";
  }
  return errors;
}

function mergeDefectSuggestions(description: string, defectNames: string[]) {
  const manualLines = description
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(DESCRIPTION_DEFECT_PREFIX));
  const defectLine = defectNames.length
    ? `${DESCRIPTION_DEFECT_PREFIX}${defectNames.join(", ")}`
    : "";
  return [defectLine, ...manualLines].filter(Boolean).join("\n").trimStart();
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isVietnamPhoneNumber(value: string) {
  return /^(03|05|07|08|09)\d{8}$/.test(normalizePhone(value));
}

function normalizePhone(value: string) {
  return value.replace(/[^\d]/g, "").slice(0, 10);
}

function buildWarrantyResolveDescription(result: WarrantyResolveResult) {
  const productLabel =
    result.product_name ||
    result.sku_code ||
    result.item_code ||
    result.raw_code;
  const flowLabel =
    result.recommended_flow === "TEMP_ONLY"
      ? "Tạo hồ sơ tạm"
      : "Tạo hồ sơ theo mã";
  return [
    warrantyEligibilityLabel(result.eligibility_code),
    flowLabel,
    productLabel,
  ]
    .filter(Boolean)
    .join(" · ");
}

function warrantyEligibilityLabel(code?: string) {
  const labels: Record<string, string> = {
    ELIGIBLE: "Đủ điều kiện",
    ITEM_NOT_FOUND: "Không tìm thấy item",
    ITEM_NOT_ISSUED: "Item chưa xuất kho",
    ACTIVE_WARRANTY_EXISTS: "Đã có hồ sơ bảo hành đang mở",
  };
  return labels[String(code || "").toUpperCase()] || code || "Đã kiểm tra mã";
}
