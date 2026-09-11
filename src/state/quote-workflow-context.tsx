import { ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";

import { QuoteRequestItemInput } from "@/types/public-api";

export interface QuoteRamDraft {
  full_name: string;
  phone: string;
  note: string;
  consent: boolean;
}

export interface QuoteReceipt {
  request_id: string;
  status: "RECEIVED";
  items: QuoteRequestItemInput[];
  products: Array<{ product_id: string; name: string; model: string | null }>;
}

/** Public product display data retained only while the Mini App remains open.
 * It lets a consultation draft stay readable if the optional ID revalidation
 * request is briefly unavailable after the customer comes from Compare. */
export interface QuoteProductSnapshot {
  product_id: string;
  name: string;
  model: string | null;
}

interface QuoteWorkflowContextValue {
  selectedItems: QuoteRequestItemInput[];
  selectedProductSnapshots: QuoteProductSnapshot[];
  draft: QuoteRamDraft;
  receipts: QuoteReceipt[];
  setSelectedItems: (items: QuoteRequestItemInput[]) => void;
  addSelectedItem: (item: QuoteRequestItemInput) => boolean;
  removeSelectedItem: (productId: string) => void;
  rememberSelectedProducts: (products: QuoteProductSnapshot[]) => void;
  setDraft: (draft: QuoteRamDraft) => void;
  addReceipt: (receipt: QuoteReceipt) => void;
  removeReceipt: (requestId: string) => void;
}

const EMPTY_DRAFT: QuoteRamDraft = { full_name: "", phone: "", note: "", consent: false };
const MAX_QUOTE_ITEMS = 20;

const normalizeItem = (item: QuoteRequestItemInput): QuoteRequestItemInput | null => {
  const productId = item.product_id.trim();
  if (!productId) return null;
  return { product_id: productId, variant_id: item.variant_id?.trim() || null, quantity: item.quantity ?? null };
};

const normalizeItems = (items: QuoteRequestItemInput[]) => {
  const seen = new Set<string>();
  const normalized: QuoteRequestItemInput[] = [];
  items.forEach((item) => {
    const value = normalizeItem(item);
    if (!value || seen.has(value.product_id) || normalized.length >= MAX_QUOTE_ITEMS) return;
    seen.add(value.product_id);
    normalized.push(value);
  });
  return normalized;
};

const normalizeSnapshot = (snapshot: QuoteProductSnapshot): QuoteProductSnapshot | null => {
  const productId = snapshot.product_id.trim();
  const name = snapshot.name.trim();
  if (!productId || !name) return null;
  const model = snapshot.model?.trim() || null;
  return { product_id: productId, name, model };
};

const QuoteWorkflowContext = createContext<QuoteWorkflowContextValue | null>(null);

/** PII draft and receipt live only in React RAM for the current app-open session. */
export const QuoteWorkflowProvider = ({ children }: { children: ReactNode }) => {
  const [selectedItems, setSelectedItemsState] = useState<QuoteRequestItemInput[]>([]);
  const [selectedProductSnapshots, setSelectedProductSnapshots] = useState<QuoteProductSnapshot[]>([]);
  const [draft, setDraft] = useState<QuoteRamDraft>(EMPTY_DRAFT);
  const [receipts, setReceipts] = useState<QuoteReceipt[]>([]);

  const setSelectedItems = useCallback((items: QuoteRequestItemInput[]) => {
    const normalized = normalizeItems(items);
    const selectedIds = new Set(normalized.map((item) => item.product_id));
    setSelectedItemsState(normalized);
    setSelectedProductSnapshots((current) => current.filter((product) => selectedIds.has(product.product_id)));
  }, []);
  const addSelectedItem = useCallback((item: QuoteRequestItemInput) => {
    const value = normalizeItem(item);
    if (!value) return false;
    let added = false;
    setSelectedItemsState((current) => {
      if (current.some((entry) => entry.product_id === value.product_id) || current.length >= MAX_QUOTE_ITEMS) return current;
      added = true;
      return [...current, value];
    });
    return added;
  }, []);
  const removeSelectedItem = useCallback((productId: string) => {
    setSelectedItemsState((current) => current.filter((item) => item.product_id !== productId));
    setSelectedProductSnapshots((current) => current.filter((product) => product.product_id !== productId));
  }, []);
  const rememberSelectedProducts = useCallback((products: QuoteProductSnapshot[]) => {
    setSelectedProductSnapshots((current) => {
      const snapshots = new Map(current.map((product) => [product.product_id, product]));
      products.forEach((product) => {
        const normalized = normalizeSnapshot(product);
        if (normalized) snapshots.set(normalized.product_id, normalized);
      });
      return Array.from(snapshots.values());
    });
  }, []);
  const addReceipt = useCallback((receipt: QuoteReceipt) => setReceipts((current) => current.some((item) => item.request_id === receipt.request_id) ? current : [receipt, ...current]), []);
  const removeReceipt = useCallback((requestId: string) => setReceipts((current) => current.filter((item) => item.request_id !== requestId)), []);

  const value = useMemo<QuoteWorkflowContextValue>(() => ({
    selectedItems,
    selectedProductSnapshots,
    draft,
    receipts,
    setSelectedItems,
    addSelectedItem,
    removeSelectedItem,
    rememberSelectedProducts,
    setDraft,
    addReceipt,
    removeReceipt,
  }), [addReceipt, addSelectedItem, draft, receipts, rememberSelectedProducts, removeReceipt, removeSelectedItem, selectedItems, selectedProductSnapshots, setSelectedItems]);

  return <QuoteWorkflowContext.Provider value={value}>{children}</QuoteWorkflowContext.Provider>;
};

export const useQuoteWorkflow = () => {
  const context = useContext(QuoteWorkflowContext);
  if (!context) throw new Error("useQuoteWorkflow must be rendered inside QuoteWorkflowProvider");
  return context;
};
