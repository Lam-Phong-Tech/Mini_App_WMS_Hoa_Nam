import { AppButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { WmsChoiceControl } from "@/components/ui/WmsRuntime";

export type ApprovalFilter = "ALL" | "READY" | "NEEDS_ATTENTION";
export type ApprovalFolder = "INBOUND" | "OUTBOUND";

export function ApprovalHeader() {
  return (
    <header className="approval-header">
      <div>
        <p className="approval-header__eyebrow">Theo phiếu</p>
        <h1>Duyệt phiếu</h1>
      </div>
    </header>
  );
}

export function ApprovalSyncBar({
  pendingCount,
  isSyncing,
  onSync,
}: {
  pendingCount: number;
  isSyncing: boolean;
  onSync: () => void;
}) {
  return (
    <div className="approval-sync-bar">
      <button
        aria-label="Đồng bộ danh sách phiếu"
        className="approval-sync-button"
        disabled={isSyncing}
        type="button"
        onClick={onSync}
      >
        <Icon
          className={isSyncing ? "approval-sync-button__icon--spinning" : ""}
          name="refresh"
          size={15}
          strokeWidth={2.15}
        />
        <span>Đồng bộ WMS</span>
      </button>
      <span>{pendingCount} phiếu chờ duyệt</span>
    </div>
  );
}

export function ApprovalDocumentTabs({
  activeFolder,
  inboundCount,
  outboundCount,
  onChange,
}: {
  activeFolder: ApprovalFolder;
  inboundCount: number;
  outboundCount: number;
  onChange: (folder: ApprovalFolder) => void;
}) {
  const tabs: Array<{
    folder: ApprovalFolder;
    count: number;
    icon: "package-plus" | "package-minus";
    label: string;
  }> = [
    {
      folder: "INBOUND",
      count: inboundCount,
      icon: "package-plus",
      label: "Phiếu nhập",
    },
    {
      folder: "OUTBOUND",
      count: outboundCount,
      icon: "package-minus",
      label: "Phiếu xuất",
    },
  ];

  return (
    <section
      aria-label="Loại phiếu chờ duyệt"
      className="approval-document-tabs"
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = tab.folder === activeFolder;

        return (
          <button
            aria-selected={active}
            className={[
              "approval-document-tab",
              active && "approval-document-tab--active",
            ]
              .filter(Boolean)
              .join(" ")}
            key={tab.folder}
            role="tab"
            type="button"
            onClick={() => onChange(tab.folder)}
          >
            <Icon name={tab.icon} size={16} strokeWidth={2.2} />
            <span>
              {tab.label} · {tab.count}
            </span>
          </button>
        );
      })}
    </section>
  );
}

export function InventoryPostNotice() {
  return (
    <section className="approval-post-notice">
      <Icon name="shield-check" size={18} strokeWidth={2.15} />
      <p>Tồn kho cập nhật sau Post</p>
      <Icon
        aria-label="Thông tin tồn kho"
        className="approval-post-notice__info"
        name="info"
        size={18}
        strokeWidth={2}
      />
    </section>
  );
}

export function ApprovalFilters({
  activeFilter,
  allCount,
  readyCount,
  needsAttentionCount,
  onChange,
}: {
  activeFilter: ApprovalFilter;
  allCount: number;
  readyCount: number;
  needsAttentionCount: number;
  onChange: (filter: ApprovalFilter) => void;
}) {
  const filters: Array<{
    value: ApprovalFilter;
    label: string;
    count: number;
    className: string;
  }> = [
    { value: "ALL", label: "Tất cả", count: allCount, className: "" },
    {
      value: "READY",
      label: "Sẵn sàng",
      count: readyCount,
      className: "approval-filter--ready",
    },
    {
      value: "NEEDS_ATTENTION",
      label: "Cần xử lý",
      count: needsAttentionCount,
      className: "approval-filter--attention",
    },
  ];

  return (
    <div
      aria-label="Lọc phiếu chờ duyệt"
      className="approval-filters"
      role="group"
    >
      {filters.map((filter) => {
        const active = filter.value === activeFilter;

        return (
          <button
            aria-pressed={active}
            className={[
              "approval-filter",
              filter.className,
              active && "approval-filter--active",
            ]
              .filter(Boolean)
              .join(" ")}
            key={filter.value}
            type="button"
            onClick={() => onChange(filter.value)}
          >
            {filter.label} {filter.count}
          </button>
        );
      })}
    </div>
  );
}

export function ReadySelectBar({
  checked,
  disabled,
  selectedCount,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  selectedCount: number;
  onToggle: () => void;
}) {
  return (
    <button
      aria-pressed={checked}
      className="approval-select-all"
      disabled={disabled}
      type="button"
      onClick={onToggle}
    >
      <span className="approval-select-all__main">
        <StaticCheckbox checked={checked} />
        <span>Chọn phiếu sẵn sàng</span>
      </span>
      <span className="approval-select-all__count">
        {selectedCount} đã chọn
      </span>
    </button>
  );
}

export function ApprovalDocumentCard({
  title,
  code,
  warehouseName,
  createdAt,
  scannedQty,
  expectedQty,
  ready,
  selected,
  selectionDisabled,
  onSelect,
  onOpen,
}: {
  title: string;
  code: string;
  warehouseName: string;
  createdAt?: string;
  scannedQty: number;
  expectedQty: number;
  ready: boolean;
  selected: boolean;
  selectionDisabled: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const expectedLabel =
    expectedQty > 0 ? `${scannedQty}/${expectedQty}` : `${scannedQty}`;
  const missingQty = Math.max(0, expectedQty - scannedQty);
  const warning =
    missingQty > 0 ? `Thiếu ${missingQty} mã` : "Cần kiểm tra lại";

  return (
    <article
      className={[
        "approval-document-card",
        !ready && "approval-document-card--attention",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="approval-document-card__checkbox">
        <InteractiveCheckbox
          checked={selected}
          disabled={selectionDisabled}
          label={`Chọn ${code} để duyệt hàng loạt`}
          onChange={onSelect}
        />
      </div>
      <button
        className="approval-document-card__main"
        type="button"
        onClick={onOpen}
      >
        <h2>{title}</h2>
        <span className="approval-document-card__code">
          <span>{code}</span>
          <Icon name="copy" size={15} strokeWidth={2.1} />
        </span>
        <span className="approval-document-card__meta">
          <span>
            <Icon name="warehouse" size={15} strokeWidth={2} />
            {warehouseName}
          </span>
          {createdAt && (
            <span>
              <Icon name="calendar" size={15} strokeWidth={2} />
              {formatApprovalDate(createdAt)}
            </span>
          )}
        </span>
      </button>
      <div className="approval-document-card__status">
        <span
          className={[
            "approval-status-badge",
            ready
              ? "approval-status-badge--ready"
              : "approval-status-badge--attention",
          ].join(" ")}
        >
          {ready ? "Đủ hàng" : "Cần xử lý"}
        </span>
        {ready ? (
          <span className="approval-document-card__ready-text">
            Đã quét đủ {expectedLabel}
          </span>
        ) : (
          <span className="approval-document-card__warning-text">
            <Icon name="alert-triangle" size={15} strokeWidth={2.2} />
            {warning}
          </span>
        )}
        {!ready && (
          <button
            className="approval-document-card__reconcile"
            type="button"
            onClick={onOpen}
          >
            Đối soát
          </button>
        )}
      </div>
      <button
        aria-label={`Mở chi tiết ${code}`}
        className="approval-document-card__chevron"
        type="button"
        onClick={onOpen}
      >
        <Icon name="chevron-right" size={20} strokeWidth={2.2} />
      </button>
    </article>
  );
}

export function ApprovalBottomAction({
  selectedCount,
  needsAttentionCount,
  isApproving,
  onApprove,
}: {
  selectedCount: number;
  needsAttentionCount: number;
  isApproving: boolean;
  onApprove: () => void;
}) {
  const readyLabel =
    selectedCount === 1
      ? "1 phiếu sẵn sàng"
      : `${selectedCount} phiếu sẵn sàng`;
  const approvalLabel =
    selectedCount === 1
      ? "Duyệt 1 phiếu"
      : selectedCount > 1
        ? `Duyệt ${selectedCount} phiếu`
        : "Duyệt phiếu";

  return (
    <aside className="approval-bottom-action">
      <div className="approval-bottom-action__icon">
        <Icon name="check-circle" size={22} strokeWidth={2.25} />
      </div>
      <div className="approval-bottom-action__copy">
        <strong>{readyLabel}</strong>
        <span>Không gồm {needsAttentionCount} phiếu cần xử lý</span>
      </div>
      <AppButton
        className="approval-bottom-action__button"
        disabled={selectedCount === 0}
        icon="check-circle"
        loading={isApproving}
        onClick={onApprove}
      >
        {approvalLabel}
      </AppButton>
    </aside>
  );
}

function InteractiveCheckbox({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label
      className={[
        "approval-checkbox",
        disabled && "approval-checkbox--disabled",
      ]
        .filter(Boolean)
        .join(" ")}
      title={label}
    >
      <WmsChoiceControl
        aria-label={label}
        checked={checked}
        disabled={disabled}
        type="checkbox"
        onChange={onChange}
      />
      <StaticCheckbox checked={checked} />
    </label>
  );
}

function StaticCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={[
        "approval-checkbox__visual",
        checked && "approval-checkbox__visual--checked",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span>✓</span>
    </span>
  );
}

function formatApprovalDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;

  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
