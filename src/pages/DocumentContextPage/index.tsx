import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppButton } from "@/components/ui/Button";
import { WmsFlowSteps } from "@/components/ui/FlowSteps";
import { Icon, type IconName } from "@/components/ui/Icon";
import {
  WmsField,
  WmsInput,
  WmsNotice,
  WmsPageHeader,
  WmsSelect,
} from "@/components/ui/WmsRuntime";
import { DEFAULT_WAREHOUSE } from "@/constants/default-warehouse";
import {
  getInboundDocuments,
  type InboundDocumentSummary,
} from "@/services/scan.service";
import {
  getVietnamProvinces,
  getVietnamWards,
  type VietnamProvince,
  type VietnamWard,
} from "@/services/vietnam-address.service";
import {
  getWmsLinkContext,
  mergeWmsLinkContext,
} from "@/services/wms-link-context";
import {
  getReceiptErrorMessage,
  getReceiptWarehouses,
  type ReceiptWarehouseOption,
} from "@/services/receipt-flow.service";
import {
  resolveWmsContext,
  type WmsResolvedContext,
} from "@/services/wms-context.service";
import {
  createOutboundScanRows,
  useOutboundSessionStore,
} from "@/stores/outbound-session.store";
import type { ScanContext } from "@/types/scan.types";
import { generateClientScanId } from "@/utils/generateClientScanId";
import { isUuid } from "@/utils/isUuid";

const validContexts: ScanContext[] = ["RECEIPT", "OUTBOUND", "WARRANTY_ITEM"];
const INBOUND_DOCUMENT_PICKER_PAGE_SIZE = 8;

const recipientTypeOptions = [
  { value: "DEALER", label: "Đại Lý" },
  { value: "DISTRIBUTOR", label: "Nhà Phân Phối" },
  { value: "CONSTRUCTION_CUSTOMER", label: "Khách Công Trường" },
  { value: "RETAIL_CUSTOMER", label: "Khách Lẻ" },
] as const;

type OutboundFormErrors = Partial<
  Record<
    | "recipientType"
    | "recipientName"
    | "recipientPhone"
    | "province"
    | "ward"
    | "expectedQty",
    string
  >
>;

type OperationMeta = {
  title: string;
  eyebrow: string;
  documentLabel: string;
  documentPlaceholder: string;
  status: string;
  purpose: string;
  warehouseLabel: string;
  startLabel: string;
  changeLabel: string;
  toneClass: string;
  badgeClass: string;
  icon: IconName;
  scanContextLabel: string;
};

const operationMeta: Record<ScanContext, OperationMeta> = {
  RECEIPT: {
    title: "Nhập kho",
    eyebrow: "Chọn phiếu cần vận hành",
    documentLabel: "Chứng từ nhập",
    documentPlaceholder: "Nhập mã phiếu nhập",
    status: "Đang chuẩn bị",
    purpose: "Nhập hàng",
    warehouseLabel: "Kho nhận",
    startLabel: "Bắt đầu quét nhập kho",
    changeLabel: "Đổi phiếu nhập",
    toneClass: "border-blue-200 bg-blue-50 text-blue-800",
    badgeClass: "bg-blue-100 text-blue-800",
    icon: "package-plus",
    scanContextLabel: "INBOUND",
  },
  OUTBOUND: {
    title: "Xuất kho",
    eyebrow: "Chọn ngữ cảnh vận hành",
    documentLabel: "Chứng từ xuất",
    documentPlaceholder: "Nhập mã phiếu xuất",
    status: "Đang chuẩn bị",
    purpose: "Xuất bán hàng",
    warehouseLabel: "Kho xuất",
    startLabel: "Bắt đầu quét xuất kho",
    changeLabel: "Đổi phiếu xuất",
    toneClass: "border-amber-200 bg-amber-50 text-amber-800",
    badgeClass: "bg-amber-100 text-amber-800",
    icon: "package-minus",
    scanContextLabel: "OUTBOUND",
  },
  WARRANTY_ITEM: {
    title: "Tra cứu Bảo hành",
    eyebrow: "Chọn hồ sơ cần kiểm tra",
    documentLabel: "Hồ sơ bảo hành",
    documentPlaceholder: "Nhập mã phiếu/hồ sơ bảo hành",
    status: "Chờ tra cứu",
    purpose: "Tiếp nhận bảo hành",
    warehouseLabel: "Điểm tiếp nhận",
    startLabel: "Bắt đầu quét bảo hành",
    changeLabel: "Đổi hồ sơ",
    toneClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
    badgeClass: "bg-emerald-100 text-emerald-800",
    icon: "shield-check",
    scanContextLabel: "WARRANTY",
  },
  WARRANTY_COMPONENT: {} as OperationMeta,
  INVENTORY_LOOKUP: {} as OperationMeta,
};

export default function DocumentContextPage() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const context = validContexts.includes(params.context as ScanContext)
    ? (params.context as ScanContext)
    : "RECEIPT";
  const meta = operationMeta[context];
  const [resolvedWms, setResolvedWms] = useState<WmsResolvedContext>();
  const [isEditingDocument, setIsEditingDocument] = useState(false);
  const [manualDocumentId, setManualDocumentId] = useState(
    searchParams.get("documentId") || "",
  );
  const [inboundDocuments, setInboundDocuments] = useState<
    InboundDocumentSummary[]
  >([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [documentListError, setDocumentListError] = useState<string>();
  const [outboundName, setOutboundName] = useState("");
  const [recipientType, setRecipientType] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientStreetAddress, setRecipientStreetAddress] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [outboundNote, setOutboundNote] = useState("");
  const [outboundExpectedQty, setOutboundExpectedQty] = useState("1");
  const [outboundFormErrors, setOutboundFormErrors] =
    useState<OutboundFormErrors>({});
  const [createOutboundError, setCreateOutboundError] = useState<string>();
  const [provinces, setProvinces] = useState<VietnamProvince[]>([]);
  const [wards, setWards] = useState<VietnamWard[]>([]);
  const [selectedProvinceCode, setSelectedProvinceCode] = useState("");
  const [selectedWardCode, setSelectedWardCode] = useState("");
  const [isLoadingProvinces, setIsLoadingProvinces] = useState(false);
  const [isLoadingWards, setIsLoadingWards] = useState(false);
  const [addressError, setAddressError] = useState<string>();
  const [outboundWarehouses, setOutboundWarehouses] = useState<
    ReceiptWarehouseOption[]
  >([DEFAULT_WAREHOUSE]);
  const [selectedOutboundWarehouseId, setSelectedOutboundWarehouseId] =
    useState(DEFAULT_WAREHOUSE.id);
  const [isLoadingOutboundWarehouses, setIsLoadingOutboundWarehouses] =
    useState(false);
  const [outboundWarehouseError, setOutboundWarehouseError] =
    useState<string>();
  const upsertOutboundSession = useOutboundSessionStore(
    (state) => state.upsertSession,
  );

  useEffect(() => {
    let mounted = true;

    void resolveWmsContext()
      .then((resolved) => {
        if (mounted) setResolvedWms(resolved);
      })
      .catch(() => {
        if (mounted) {
          setResolvedWms({
            linked: false,
            context: getWmsLinkContext(),
            source: "none",
          });
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (context !== "RECEIPT") return;

    let mounted = true;
    setIsLoadingDocuments(true);
    setDocumentListError(undefined);

    void getInboundDocuments({ perPage: INBOUND_DOCUMENT_PICKER_PAGE_SIZE })
      .then((items) => {
        if (!mounted) return;
        setInboundDocuments(items as InboundDocumentSummary[]);
      })
      .catch((error) => {
        if (mounted) {
          setDocumentListError(
            error instanceof Error
              ? error.message
              : "Không tải được danh sách phiếu nhập.",
          );
        }
      })
      .finally(() => {
        if (mounted) setIsLoadingDocuments(false);
      });

    return () => {
      mounted = false;
    };
  }, [context]);

  useEffect(() => {
    if (context !== "OUTBOUND") return;

    let mounted = true;
    setIsLoadingOutboundWarehouses(true);
    setOutboundWarehouseError(undefined);

    void getReceiptWarehouses()
      .then((items) => {
        if (!mounted) return;
        const warehouseItems = items.length > 0 ? items : [DEFAULT_WAREHOUSE];
        setOutboundWarehouses(warehouseItems);
        setSelectedOutboundWarehouseId(
          (current) => current || warehouseItems[0]?.id || DEFAULT_WAREHOUSE.id,
        );
      })
      .catch((error) => {
        console.warn(
          "Không tải được danh sách kho, dùng kho tổng mặc định.",
          error,
        );
        if (mounted) {
          setOutboundWarehouses([DEFAULT_WAREHOUSE]);
          setSelectedOutboundWarehouseId(DEFAULT_WAREHOUSE.id);
          setOutboundWarehouseError(undefined);
        }
      })
      .finally(() => {
        if (mounted) setIsLoadingOutboundWarehouses(false);
      });

    return () => {
      mounted = false;
    };
  }, [context]);

  useEffect(() => {
    if (context !== "OUTBOUND") return;

    let mounted = true;
    setIsLoadingProvinces(true);
    setAddressError(undefined);

    void getVietnamProvinces()
      .then((items) => {
        if (mounted) setProvinces(items);
      })
      .catch(() => {
        if (mounted) {
          setAddressError(
            "Không tải được danh sách tỉnh/thành. Vui lòng kiểm tra kết nối mạng.",
          );
        }
      })
      .finally(() => {
        if (mounted) setIsLoadingProvinces(false);
      });

    return () => {
      mounted = false;
    };
  }, [context]);

  useEffect(() => {
    if (context !== "OUTBOUND") return;

    const provinceCode = Number(selectedProvinceCode);
    setSelectedWardCode("");
    setWards([]);

    if (!provinceCode) return;

    let mounted = true;
    setIsLoadingWards(true);
    setAddressError(undefined);

    void getVietnamWards(provinceCode)
      .then((items) => {
        if (mounted) setWards(items);
      })
      .catch(() => {
        if (mounted) {
          setAddressError(
            "Không tải được danh sách phường/xã. Vui lòng chọn lại tỉnh/thành.",
          );
        }
      })
      .finally(() => {
        if (mounted) setIsLoadingWards(false);
      });

    return () => {
      mounted = false;
    };
  }, [context, selectedProvinceCode]);

  const linkContext = resolvedWms?.context || getWmsLinkContext();
  const linkedDocumentId =
    context === "RECEIPT" ? linkContext.documentId : undefined;
  const documentId =
    manualDocumentId.trim() ||
    searchParams.get("documentId") ||
    linkedDocumentId ||
    "";
  const selectedOutboundWarehouse = useMemo(
    () =>
      outboundWarehouses.find(
        (warehouse) => warehouse.id === selectedOutboundWarehouseId,
      ),
    [outboundWarehouses, selectedOutboundWarehouseId],
  );
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
  const recipientAddress = useMemo(
    () =>
      [
        recipientStreetAddress.trim(),
        selectedWard?.name,
        selectedProvince?.name,
      ]
        .filter(Boolean)
        .join(", "),
    [recipientStreetAddress, selectedProvince?.name, selectedWard?.name],
  );
  const warehouseName = useMemo(() => {
    const warehouse = resolvedWms?.warehouse;
    return (
      selectedOutboundWarehouse?.name ||
      warehouse?.warehouse_name ||
      warehouse?.name ||
      warehouse?.warehouse_code ||
      warehouse?.code ||
      linkContext.warehouseId ||
      "Theo phân quyền WMS"
    );
  }, [
    linkContext.warehouseId,
    resolvedWms?.warehouse,
    selectedOutboundWarehouse,
  ]);
  const warehouseId =
    [
      selectedOutboundWarehouseId,
      resolvedWms?.warehouse?.id,
      resolvedWms?.warehouse?.uuid,
      resolvedWms?.warehouse?.warehouse_id,
      resolvedWms?.warehouse?.warehouse_uuid,
      linkContext.warehouseId,
    ].find((value) => isUuid(value)) || "";
  const hasInvalidWarehouseContext =
    Boolean(linkContext.warehouseId) && !isUuid(linkContext.warehouseId);
  const outboundQuantity = Number(outboundExpectedQty);
  const canCreateOutbound =
    context === "OUTBOUND" &&
    isUuid(warehouseId) &&
    Boolean(recipientType) &&
    Boolean(recipientName.trim()) &&
    Boolean(selectedProvince) &&
    Boolean(selectedWard) &&
    isVietnamPhoneNumber(recipientPhone) &&
    Number.isInteger(outboundQuantity) &&
    outboundQuantity > 0;
  const canStart =
    context === "WARRANTY_ITEM" ||
    (context !== "OUTBOUND" && Boolean(documentId));
  const scannerUrl = `/scanner/${context}${documentId ? `?documentId=${encodeURIComponent(documentId)}` : ""}`;
  const progressValue = documentId ? 42 : 8;

  const createOutboundDraft = async () => {
    setCreateOutboundError(undefined);
    const errors = validateOutboundForm({
      recipientType,
      recipientName,
      recipientPhone,
      selectedProvince,
      selectedWard,
      outboundQuantity,
    });
    setOutboundFormErrors(errors);

    if (Object.keys(errors).length > 0 || !canCreateOutbound) {
      setCreateOutboundError(
        "Vui lòng kiểm tra lại các trường bắt buộc trước khi quét.",
      );
      return;
    }

    try {
      const createdId = `local-outbound-${Date.now()}`;

      if (!isUuid(warehouseId)) {
        setCreateOutboundError(
          "Kho xuất chưa hợp lệ. Mini App cần warehouse_id dạng UUID từ WMS, không dùng mã kho như HN1.",
        );
        return;
      }

      upsertOutboundSession({
        outboundId: createdId,
        outboundName:
          outboundName.trim() ||
          `Phiếu xuất ${new Date().toLocaleString("vi-VN")}`,
        warehouseId,
        warehouseName,
        recipientType,
        recipientName: recipientName.trim(),
        recipientAddress,
        recipientPhone: normalizePhone(recipientPhone),
        recipientProvinceCode: selectedProvince?.code,
        recipientProvinceName: selectedProvince?.name,
        recipientWardCode: selectedWard?.code,
        recipientWardName: selectedWard?.name,
        recipientStreetAddress: recipientStreetAddress.trim() || undefined,
        note: buildOutboundNote(recipientType, outboundNote),
        expectedQty: outboundQuantity,
        status: "scanning",
        items: [],
        scanRows: createOutboundScanRows(outboundQuantity),
        createdAt: new Date().toISOString(),
        recordIdempotencyKey: generateClientScanId(),
      });
      mergeWmsLinkContext({ warehouseId });
      navigate(`/scanner/OUTBOUND?documentId=${encodeURIComponent(createdId)}`);
    } catch (error) {
      setCreateOutboundError(
        error instanceof Error
          ? error.message
          : "Không tạo được phiên xuất kho.",
      );
    }
  };

  return (
    <main className="wms-flow-page px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+28px)]">
      <div className="mx-auto max-w-md space-y-3">
        <WmsPageHeader
          eyebrow={meta.eyebrow}
          title={meta.title}
          onBack={() => navigate(-1)}
        />

        <WmsFlowSteps
          current={1}
          labels={["Thông tin", "Quét mã", "Kiểm tra", "Gửi duyệt"]}
        />

        {context === "WARRANTY_ITEM" && (
          <>
            <section className={`rounded-[18px] border p-3 ${meta.toneClass}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.08em]">
                    {meta.documentLabel}
                  </p>
                  <p className="mt-1 truncate text-[14px] font-black text-[#06142A]">
                    {documentId || "Chưa chọn phiếu"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-black ${meta.badgeClass}`}
                >
                  {meta.status}
                </span>
              </div>
            </section>

            <section className="rounded-[22px] border border-[#D6E0EC] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium text-[#8C98AA]">
                    {meta.warehouseLabel}
                  </p>
                  <h2 className="mt-1 text-[15px] font-black text-[#06142A]">
                    {warehouseName}
                  </h2>
                </div>
                <span className="grid h-11 w-11 place-items-center rounded-[var(--wms-radius-control)] bg-[var(--wms-primary)] text-white">
                  <Icon name={meta.icon} size={21} strokeWidth={2.5} />
                </span>
              </div>

              <div className="mt-4 divide-y divide-[#E6ECF3] text-[12px]">
                <DocumentInfoRow label="Mục đích" value={meta.purpose} />
                <DocumentInfoRow
                  label="Mã phiếu"
                  value={documentId || "Chưa chọn"}
                />
                <DocumentInfoRow
                  label="Trạng thái"
                  value={canStart ? "Cho phép quét" : "Cần chọn phiếu"}
                />
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#E8EEF6]">
                <div
                  className="h-full rounded-full bg-[var(--wms-primary)]"
                  style={{ width: `${progressValue}%` }}
                />
              </div>
            </section>
          </>
        )}

        {context === "OUTBOUND" && (
          <section className="rounded-[22px] border border-[#D6E0EC] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--wms-primary)]">
                  Thông tin xuất kho
                </p>
                <h2 className="mt-1 text-[17px] font-black tracking-[-0.04em]">
                  Tạo phiếu trước khi quét
                </h2>
                <p className="mt-1 text-[12px] font-medium text-[#69758A]">
                  Nhập thông tin cơ bản và số lượng cần quét, không nhập SKU
                </p>
              </div>
              <span className="rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-black text-amber-700">
                TẠO MỚI
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {createOutboundError && (
                <WmsNotice
                  tone="danger"
                  title="Không tạo được phiếu xuất"
                  description={createOutboundError}
                />
              )}

              {outboundWarehouseError && (
                <WmsNotice
                  tone="danger"
                  title="Không tải được kho xuất"
                  description={outboundWarehouseError}
                />
              )}

              {!warehouseId &&
                !hasInvalidWarehouseContext &&
                !outboundWarehouseError && (
                  <WmsNotice
                    tone="warning"
                    title="Chưa xác định kho xuất"
                    description={
                      isLoadingOutboundWarehouses
                        ? "Đang lấy danh sách kho active từ WMS..."
                        : "WMS chưa trả UUID kho tổng mặc định. Vui lòng kiểm tra API /api/v1/warehouses có trả kho ACTIVE trong data scope hiện tại."
                    }
                  />
                )}

              {hasInvalidWarehouseContext && !warehouseId && (
                <WmsNotice
                  tone="warning"
                  title="warehouse_id chưa đúng định dạng"
                  description={`Ngữ cảnh hiện có "${linkContext.warehouseId}" giống mã kho, nhưng API xuất kho cần UUID kho. Vui lòng mở Mini App từ WMS hoặc đăng nhập tài khoản có kho mặc định.`}
                />
              )}

              <WmsNotice
                tone="info"
                title="Không nhập SKU ở bước này"
                description="Backend WMS sẽ tự resolve SKU/item theo QR/Barcode khi quét. Số lượng ở đây chỉ là tổng số sản phẩm cần quét cho phiếu."
              />

              {addressError && (
                <WmsNotice
                  tone="warning"
                  title="Không tải được dữ liệu địa chỉ"
                  description={addressError}
                />
              )}

              <WmsField label="Tên phiếu / ghi nhớ">
                <WmsInput
                  value={outboundName}
                  placeholder="Ví dụ: Xuất hàng chiều nay"
                  onChange={(event) => setOutboundName(event.target.value)}
                />
              </WmsField>

              <WmsField
                label="Nhóm đối tượng xuất"
                required
                error={outboundFormErrors.recipientType}
              >
                <WmsSelect
                  value={recipientType}
                  error={Boolean(outboundFormErrors.recipientType)}
                  onChange={(event) => {
                    setRecipientType(event.target.value);
                    setOutboundFormErrors((current) => ({
                      ...current,
                      recipientType: undefined,
                    }));
                  }}
                >
                  <option value="">Chọn nhóm đối tượng</option>
                  {recipientTypeOptions.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </WmsSelect>
              </WmsField>

              <WmsField
                label="Tên người nhận / đơn vị"
                required
                error={outboundFormErrors.recipientName}
              >
                <WmsInput
                  value={recipientName}
                  error={Boolean(outboundFormErrors.recipientName)}
                  placeholder="Ví dụ: Đại lý Minh Anh"
                  onChange={(event) => {
                    setRecipientName(event.target.value);
                    setOutboundFormErrors((current) => ({
                      ...current,
                      recipientName: undefined,
                    }));
                  }}
                />
              </WmsField>

              <WmsField
                label="Số điện thoại"
                required
                error={outboundFormErrors.recipientPhone}
              >
                <WmsInput
                  inputMode="numeric"
                  value={recipientPhone}
                  error={Boolean(outboundFormErrors.recipientPhone)}
                  placeholder="Ví dụ: 0901234567"
                  onChange={(event) => {
                    setRecipientPhone(
                      event.target.value.replace(/[^\d]/g, "").slice(0, 10),
                    );
                    setOutboundFormErrors((current) => ({
                      ...current,
                      recipientPhone: undefined,
                    }));
                  }}
                />
              </WmsField>

              <WmsField
                label="Tỉnh/Thành phố"
                required
                error={outboundFormErrors.province}
              >
                <WmsSelect
                  value={selectedProvinceCode}
                  disabled={isLoadingProvinces}
                  error={Boolean(outboundFormErrors.province)}
                  onChange={(event) => {
                    setSelectedProvinceCode(event.target.value);
                    setOutboundFormErrors((current) => ({
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

              <WmsField
                label="Phường/Xã"
                required
                error={outboundFormErrors.ward}
              >
                <WmsSelect
                  value={selectedWardCode}
                  disabled={!selectedProvinceCode || isLoadingWards}
                  error={Boolean(outboundFormErrors.ward)}
                  onChange={(event) => {
                    setSelectedWardCode(event.target.value);
                    setOutboundFormErrors((current) => ({
                      ...current,
                      ward: undefined,
                    }));
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

              <WmsField label="Địa chỉ chi tiết">
                <WmsInput
                  value={recipientStreetAddress}
                  placeholder="Số nhà, tên đường, ghi chú địa chỉ"
                  onChange={(event) =>
                    setRecipientStreetAddress(event.target.value)
                  }
                />
              </WmsField>

              <WmsField
                label="Số lượng cần quét"
                required
                error={outboundFormErrors.expectedQty}
              >
                <WmsInput
                  min={1}
                  max={1000}
                  type="number"
                  value={outboundExpectedQty}
                  error={Boolean(outboundFormErrors.expectedQty)}
                  placeholder="Ví dụ: 10"
                  onChange={(event) => {
                    setOutboundExpectedQty(event.target.value);
                    setOutboundFormErrors((current) => ({
                      ...current,
                      expectedQty: undefined,
                    }));
                  }}
                />
              </WmsField>
              <WmsField label="Ghi chú">
                <WmsInput
                  value={outboundNote}
                  placeholder="Thông tin cần lưu ý khi xuất"
                  onChange={(event) => setOutboundNote(event.target.value)}
                />
              </WmsField>

              <AppButton
                fullWidth
                disabled={
                  !isUuid(warehouseId) || isLoadingProvinces || isLoadingWards
                }
                icon="package-minus"
                onClick={createOutboundDraft}
              >
                Tạo phiên và bắt đầu quét
              </AppButton>
            </div>
          </section>
        )}

        {context !== "OUTBOUND" && (isEditingDocument || !canStart) ? (
          <section className="rounded-[20px] border border-[#D6E0EC] bg-white p-3">
            <WmsField label="Chọn phiếu">
              <WmsInput
                value={manualDocumentId}
                placeholder={meta.documentPlaceholder}
                onChange={(event) => setManualDocumentId(event.target.value)}
              />
            </WmsField>
          </section>
        ) : null}

        {context === "RECEIPT" && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-black text-[#182B45]">
                Danh sách phiếu nhập
              </h2>
              <span className="text-[11px] font-semibold text-[#69758A]">
                Đồng bộ từ WMS
              </span>
            </div>

            {isLoadingDocuments && (
              <div className="rounded-2xl border border-[#D6E0EC] bg-white p-3 text-[12px] font-semibold text-[#69758A]">
                Đang tải phiếu nhập...
              </div>
            )}

            {documentListError && (
              <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-[12px] font-semibold text-red-700">
                Không tải được danh sách phiếu. Bạn vẫn có thể nhập mã phiếu thủ
                công.
              </div>
            )}

            {inboundDocuments.slice(0, 5).map((document) => {
              const optionId = getDocumentId(document);
              if (!optionId) return null;

              return (
                <button
                  className={`w-full rounded-[18px] border p-3 text-left shadow-sm transition active:scale-[0.99] ${
                    optionId === documentId
                      ? "border-[#0F73DC] bg-blue-50"
                      : "border-[#D6E0EC] bg-white"
                  }`}
                  key={optionId}
                  type="button"
                  onClick={() => {
                    setManualDocumentId(optionId);
                    setIsEditingDocument(false);
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-black text-[#06142A]">
                        {getDocumentCode(document)}
                      </p>
                      <p className="mt-1 truncate text-[11px] font-medium text-[#69758A]">
                        {document.warehouse_name ||
                          document.src_warehouse_id ||
                          document.dst_warehouse_id ||
                          document.warehouse_id ||
                          "Theo kho trên phiếu"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-700">
                        {documentStatusLabel(document.status)}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </section>
        )}

        <WmsNotice
          tone="warning"
          title="Kiểm tra đúng phiếu trước khi quét"
          description={
            context === "WARRANTY_ITEM"
              ? "Scanner chỉ tra cứu bảo hành theo hồ sơ/ngữ cảnh đã chọn."
              : context === "OUTBOUND"
                ? "Tạo phiếu xuất trước, sau đó scanner sẽ quét liên tục theo số lượng đã nhập."
                : "Scanner chỉ nhận sản phẩm thuộc chứng từ, đúng kho và chưa được ghi nhận trước đó."
          }
        />

        {context !== "OUTBOUND" && (
          <>
            <AppButton
              fullWidth
              disabled={!canStart}
              icon="scan"
              onClick={() => navigate(scannerUrl)}
            >
              {meta.startLabel}
            </AppButton>

            <AppButton
              fullWidth
              variant="secondary"
              onClick={() => setIsEditingDocument((current) => !current)}
            >
              {meta.changeLabel}
            </AppButton>
          </>
        )}
      </div>
    </main>
  );
}

function getDocumentId(document: { id?: string; document_id?: string }) {
  return document.id || document.document_id;
}

function getDocumentCode(document: InboundDocumentSummary) {
  return (
    document.doc_no ||
    document.document_no ||
    getDocumentId(document) ||
    "Phiếu"
  );
}

function documentStatusLabel(status?: string) {
  const normalized = String(status || "DRAFT").toUpperCase();
  const labels: Record<string, string> = {
    DRAFT: "Đang xử lý",
    SCANNING: "Đang quét",
    WAITING_APPROVAL: "Chờ duyệt",
    POSTED: "Hoàn tất",
    CANCELLED: "Đã hủy",
  };

  return labels[normalized] || status || "Đang xử lý";
}

function validateOutboundForm(input: {
  recipientType: string;
  recipientName: string;
  recipientPhone: string;
  selectedProvince?: VietnamProvince;
  selectedWard?: VietnamWard;
  outboundQuantity: number;
}): OutboundFormErrors {
  const errors: OutboundFormErrors = {};

  if (!input.recipientType) {
    errors.recipientType = "Vui lòng chọn nhóm đối tượng xuất.";
  }

  if (!input.recipientName.trim()) {
    errors.recipientName = "Vui lòng nhập tên người nhận/đơn vị.";
  }

  if (!isVietnamPhoneNumber(input.recipientPhone)) {
    errors.recipientPhone =
      "Số điện thoại phải gồm 10 số và dùng đầu số Việt Nam: 03, 05, 07, 08 hoặc 09.";
  }

  if (!input.selectedProvince) {
    errors.province = "Vui lòng chọn tỉnh/thành phố.";
  }

  if (!input.selectedWard) {
    errors.ward = "Vui lòng chọn phường/xã sau khi chọn tỉnh/thành.";
  }

  if (
    !Number.isInteger(input.outboundQuantity) ||
    input.outboundQuantity < 1 ||
    input.outboundQuantity > 1000
  ) {
    errors.expectedQty = "Số lượng cần quét phải từ 1 đến 1000.";
  }

  return errors;
}

function isVietnamPhoneNumber(value: string) {
  return /^(03|05|07|08|09)\d{8}$/.test(normalizePhone(value));
}

function normalizePhone(value: string) {
  return value.replace(/[^\d]/g, "").slice(0, 10);
}

function buildOutboundNote(recipientType: string, note: string) {
  const label =
    recipientTypeOptions.find((option) => option.value === recipientType)
      ?.label || recipientType;
  const parts = [`Đối tượng xuất: ${label}`, note.trim()].filter(Boolean);

  return parts.join(" · ");
}

function DocumentInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-[var(--wms-text-muted)]">{label}</span>
      <span className="min-w-0 truncate text-right font-semibold text-[var(--wms-text-strong)]">
        {value}
      </span>
    </div>
  );
}
