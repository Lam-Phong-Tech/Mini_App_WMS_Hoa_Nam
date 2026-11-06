// Offline only. The isolated Vite config substitutes service imports, never the renderer.
import {
  NfcAssignment,
  type NfcJournal,
  type NfcStage,
} from '../features/nfc/nfcAssignment';
import {
  nfcSha256,
  type NfcRejectedConfirmation,
} from '../contracts/p07NfcRecovery';
import { AppError } from '../errors/AppError';
import type {
  NfcTag,
  NfcResolvedCode,
  NfcPreparation,
  NfcConfirmation,
} from '../services/wms/nfc';
import type {
  NfcItem,
  NfcTab,
  NfcCatalogPage,
} from '../services/wms/p07Catalog';
export type { NfcTag, NfcResolvedCode, NfcItem, NfcTab, NfcCatalogPage };
export const NFC_TABS = ['ALL', 'ASSIGNED', 'UNASSIGNED'] as const;
export const reviewScenarios = [
  'ready',
  'empty',
  'loading',
  'catalog-error',
  'items-empty',
  'items-error',
  'prepared',
  'prepare-unknown',
  'prepare-timeout',
  'write-unknown',
  'readback-verified',
  'unknown',
  'processing',
  'rejected-allowed',
  'rejected-blocked',
  'recovery-ready',
  'recovery-prepare-unknown',
  'success',
  'success-null',
  'success-long',
  'expired',
  'sku-inactive',
  'permission-denied',
  'unsupported',
  'read-error',
  'conflict',
  'readback-mismatch',
  'confirm-timeout',
  'confirmation-mismatch',
  'reconcile-success',
  'recovery-success',
  'recovery-same-chip',
  'recovery-nonblank',
] as const;
const uuid = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = {
  actorId: uuid(1),
  authSessionId: uuid(2),
  warehouseId: uuid(3),
};
const time = '2026-09-09T07:32:00Z';
const payload = 'HN1|SKU=XP-420B|ITEM=HN12345';
const item = {
  item_id: uuid(4),
  serial_number: 'HN12345',
  item_status: 'ISSUED',
};
const sku = {
  sku_id: uuid(5),
  sku_code: 'XP-420B',
  sku_name: 'Máy in nhiệt XP-420B',
  status: 'ACTIVE',
};
// Board alias is deliberately mock-only. Silicon UIDs are not derived from this label.
const oldUid = 'NFC-8A2F';
const preparation: NfcPreparation = {
  item,
  sku,
  assignable: true,
  assign_block_code: 'ASSIGNABLE',
  nfc_status: 'UNASSIGNED',
  nfc: null,
  stock_effect: 'NONE',
  movement_created: false,
  nfc_payload: payload,
  reservation_token: 'mock-hold',
  expires_at: '2026-09-09T07:37:00Z',
  auth_session_id: context.authSessionId,
  warehouse_id: context.warehouseId,
  replace_existing_allowed: false,
};
let scenario = 'ready',
  stored: NfcJournal | undefined,
  controller: NfcAssignment | undefined,
  newHold = false,
  sequence = 0;
let calls: Record<string, number> = {};
const bump = (key: string) => {
  calls[key] = (calls[key] || 0) + 1;
};
const wait = () => new Promise(resolve => setTimeout(resolve, 70));
const reject = (
  code: string,
  kind: 'config' | 'http' | 'network' = 'config',
) => {
  throw new AppError({
    kind,
    code,
    status: kind === 'http' ? 422 : undefined,
    message: 'Lỗi giả lập local',
  });
};
function receipt(j?: NfcJournal): NfcConfirmation {
  const uid = j?.hardwareUid || oldUid;
  return {
    ...preparation,
    nfc_status: 'ASSIGNED',
    nfc: {
      physical_code_id: uuid(6),
      hardware_uid: uid,
      status: 'ACTIVE',
      tab_status: 'ASSIGNED',
      status_label: 'Đã liên kết',
      assigned_at: time,
      assigned_warehouse: {
        warehouse_id: context.warehouseId,
        name: 'Kho Hoa Nam',
      },
      linker: { user_id: context.actorId, display_name: 'Minh Anh' },
    },
    confirmation: {
      state: 'SUCCEEDED',
      item_id: item.item_id,
      physical_code_id: uuid(6),
      actor_id: context.actorId,
      auth_session_id: context.authSessionId,
      warehouse_id: context.warehouseId,
    },
  };
}
function rejection(j: NfcJournal, allowed = true): NfcRejectedConfirmation {
  const r = {
    receipt_id: uuid(7),
    state: 'REJECTED' as const,
    operation: 'CONFIRM' as const,
    actor_id: context.actorId,
    auth_session_id: context.authSessionId,
    warehouse_id: context.warehouseId,
    item_id: item.item_id,
    sku_id: sku.sku_id,
    hardware_uid: j.hardwareUid,
    request_key_sha256: nfcSha256(j.key),
    original_request_id: null,
    payload_sha256: nfcSha256(payload),
    reason_code: 'SKU_INACTIVE' as const,
    evidence_type: 'SERVER_PREWRITE_SKU_CHECK' as const,
    rejected_at: time,
    mapping_created_by_request: false as const,
    stock_effect: 'NONE' as const,
  };
  return {
    state: 'REJECTED',
    http_status: 422,
    response: { success: false, data: { confirmation: r } },
    receipt: r,
    recovery: {
      prepare_allowed: allowed,
      next_action: allowed ? 'PREPARE_WITH_RECOVERY_KEY' : 'BLOCKED',
      blank_new_tag_required: true,
      old_tag_reuse_allowed: false,
      same_key_retry_allowed: false,
      chip_write_rolled_back: false,
      reservation_released_by_check: false,
      completed: false,
      permit_consumed: newHold,
      confirm_dispatched: false,
    },
    may_create_new_request: allowed && !newHold,
    retry_policy: 'NEW_PREPARE_ONLY',
  } as NfcRejectedConfirmation;
}
export function configureP07Review(value: string) {
  scenario = value;
  calls = {};
  newHold = false;
  sequence = 0;
  const stages: Record<string, NfcStage> = {
    prepared: 'PREPARED',
    'prepare-unknown': 'PREPARE_UNKNOWN',
    'write-unknown': 'WRITE_UNKNOWN',
    'readback-verified': 'READBACK_VERIFIED',
    unknown: 'UNKNOWN',
    processing: 'UNKNOWN',
    'rejected-allowed': 'REJECTED',
    'rejected-blocked': 'REJECTED',
    'recovery-ready': 'RECOVERY_READY',
    'recovery-prepare-unknown': 'RECOVERY_PREPARE_UNKNOWN',
    success: 'CONFIRMED',
    'success-null': 'CONFIRMED',
    'success-long': 'CONFIRMED',
    expired: 'PREPARED',
    'reconcile-success': 'UNKNOWN',
    'recovery-success': 'REJECTED',
    'recovery-same-chip': 'REJECTED',
    'recovery-nonblank': 'REJECTED',
  };
  stored = stages[value]
    ? {
        context,
        itemId: item.item_id,
        key: 'mock-original-key',
        preparation: JSON.parse(JSON.stringify(preparation)),
        hardwareUid: oldUid,
        stage: stages[value],
        readAt: time,
      }
    : undefined;
  if (stored) {
    if (value === 'expired')
      stored.preparation = {
        ...preparation,
        expires_at: '2026-09-09T07:31:00Z',
      };
    if (value === 'processing')
      stored.lastCheck = { state: 'PROCESSING', checkedAt: time };
    if (['UNKNOWN', 'REJECTED', 'CONFIRMED'].includes(stored.stage))
      stored.writtenPayload = payload;
    if (stored.stage === 'REJECTED')
      stored.rejection = rejection(stored, value !== 'rejected-blocked');
    if (
      stored.stage === 'RECOVERY_READY' ||
      stored.stage === 'RECOVERY_PREPARE_UNKNOWN'
    ) {
      const source = {
        ...stored,
        stage: 'REJECTED' as const,
        writtenPayload: payload,
      };
      source.rejection = rejection(source);
      newHold = stored.stage === 'RECOVERY_READY';
      stored.recoveryPrepare = {
        source,
        preparation: newHold
          ? {
              ...preparation,
              reservation_token: 'mock-new-hold',
              recovery: {
                receipt_id: uuid(7),
                blank_new_tag_required: true,
                old_tag_reuse_allowed: false,
                new_confirm_key_required: true,
              },
            }
          : undefined,
      };
    }
    if (stored.stage === 'CONFIRMED') {
      stored.result = receipt(stored);
      if (value === 'success-null')
        stored.result = {
          ...stored.result,
          nfc: {
            ...stored.result.nfc,
            assigned_at: null,
            assigned_warehouse: null,
            linker: null,
          },
          sku: { ...sku, sku_name: null },
        };
      if (value === 'success-long')
        stored.result = {
          ...stored.result,
          sku: {
            ...sku,
            sku_name: 'Máy in nhiệt dùng cho quản lý hàng hóa '.repeat(10),
          },
          item: { ...item, serial_number: 'SN-' + 'DÀI'.repeat(60) },
          nfc: {
            ...stored.result.nfc,
            hardware_uid: '04' + 'AB'.repeat(70),
            linker: {
              user_id: context.actorId,
              display_name: 'Nhân viên kho '.repeat(25),
            },
          },
        };
    }
  }
  Object.assign(window, {
    p07Review: {
      snapshot: () => controller?.snapshot(),
      calls: () => ({ ...calls }),
      scenario: () => scenario,
    },
  });
}
export function currentNfcContext() {
  return context;
}
export function createNativeNfcAssignment() {
  controller = new NfcAssignment({
    assertWritable: async () => undefined, // Local review fixture only.
    context: currentNfcContext,
    now: () => Date.parse(time),
    createKey: () => `mock-key-${++sequence}`,
    preflight: async () => {
      bump('preflight');
      await wait();
      if (scenario === 'permission-denied') reject('ACCESS_DENIED', 'http');
      if (scenario === 'unsupported') reject('NFC_UNSUPPORTED');
    },
    read: async () => {
      bump('read');
      await wait();
      if (scenario === 'read-error') reject('NFC_READ_FAILED');
      return {
        hardwareUid:
          newHold && scenario !== 'recovery-same-chip' ? '04BBCCDD' : oldUid,
        hasNdefData: newHold
          ? scenario === 'recovery-nonblank'
          : ['write-unknown', 'readback-verified'].includes(scenario),
        rawCode: ['write-unknown', 'readback-verified'].includes(scenario)
          ? payload
          : undefined,
      };
    },
    write: async (value, uid) => {
      bump('write');
      await wait();
      return {
        hardwareUid: uid,
        writtenPayload: scenario === 'readback-mismatch' ? 'WRONG' : value,
      };
    },
    resolveTag: async () => {
      bump('resolveTag');
      return scenario === 'conflict'
        ? {
            resolve_code: 'RESOLVED',
            nfc: { physical_code_id: uuid(8), status: 'ACTIVE' },
            item: {},
          }
        : { resolve_code: 'NFC_TAG_NOT_REGISTERED', nfc: null, item: null };
    },
    prepare: async () => {
      bump('prepare');
      await wait();
      if (scenario === 'sku-inactive') reject('SKU_INACTIVE', 'http');
      if (scenario === 'prepare-timeout') reject('TIMEOUT', 'network');
      return preparation;
    },
    confirm: async j => {
      bump('confirm');
      await wait();
      if (scenario === 'confirm-timeout') reject('TIMEOUT', 'network');
      const result = receipt(j);
      return scenario === 'confirmation-mismatch'
        ? { ...result, item: { item_id: uuid(99) } }
        : result;
    },
    reconcile: async j => {
      bump('reconcile');
      await wait();
      if (scenario === 'reconcile-success')
        return {
          state: 'SUCCEEDED',
          http_status: 200,
          response: { success: true, data: receipt(j) },
          may_create_new_request: false,
        };
      if (scenario.startsWith('recovery') || scenario.startsWith('rejected'))
        return rejection(j, scenario !== 'rejected-blocked');
      return {
        state: scenario === 'processing' ? 'PROCESSING' : 'UNKNOWN',
        may_create_new_request: false,
      };
    },
    prepareRecovery: async () => {
      bump('prepareRecovery');
      newHold = true;
      return {
        ...preparation,
        reservation_token: 'mock-new-hold',
        recovery: {
          receipt_id: uuid(7),
          blank_new_tag_required: true,
          old_tag_reuse_allowed: false,
          new_confirm_key_required: true,
        },
      };
    },
    release: async () => {
      bump('release');
      return { released: true, stock_effect: 'NONE' };
    },
    load: () => stored,
    save: j => {
      stored = JSON.parse(JSON.stringify(j));
    },
    remove: () => {
      stored = undefined;
    },
  });
  return controller;
}
const tags: NfcTag[] = [
  'TAG-001',
  'TAG-002',
  'TAG-003',
  'TAG-004',
  'TAG-005',
].map((code, n) => ({
  physical_code_id: uuid(20 + n),
  code_value: code,
  hardware_uid: n === 0 ? oldUid : `NFC-MOCK-${n}`,
  sku_name: [
    'Máy in nhiệt XP-420B',
    'Chưa gắn sản phẩm',
    'Đầu in XP-420B',
    'Giấy in nhiệt 80mm',
    'Cáp nguồn XP-420B',
  ][n],
  sku_code: ['XP-420B', null, 'XP-420B', 'PAPER-80', 'CABLE-01'][n],
  serial_number: ['HN12345', null, 'HN12346', 'PAPER-80', 'CABLE-01'][n],
  status: n === 3 ? 'INACTIVE' : 'ACTIVE',
  tab_status:
    n === 3 ? 'LOCKED' : n % 2 === 0 && n !== 4 ? 'ASSIGNED' : 'UNASSIGNED',
  status_label:
    n === 3
      ? 'Tạm khóa'
      : n % 2 === 0 && n !== 4
      ? 'Đã liên kết'
      : 'Chưa liên kết',
  assigned_at: n === 0 || n === 2 ? time : null,
}));
export async function readP07Tags(
  _warehouse: string,
  options: {
    keyword?: string;
    tab_status?: NfcTab;
    status?: string;
    page?: number;
  },
): Promise<NfcCatalogPage<NfcTag>> {
  bump('tags');
  if (scenario === 'loading') await new Promise(() => {});
  await wait();
  if (scenario === 'catalog-error') reject('SERVICE_UNAVAILABLE', 'network');
  const baseItems =
    scenario === 'empty'
      ? []
      : tags.filter(
          t =>
            (!options.status || options.status === t.status) &&
            (!options.keyword ||
              JSON.stringify(t)
                .toLowerCase()
                .includes(options.keyword.toLowerCase())),
        );
  const items = baseItems.filter(
    t =>
      !options.tab_status ||
      options.tab_status === 'ALL' ||
      t.tab_status === options.tab_status,
  );
  const totals =
    options.keyword || options.status || scenario === 'empty'
      ? {
          ALL: baseItems.length,
          ASSIGNED: baseItems.filter(t => t.tab_status === 'ASSIGNED').length,
          UNASSIGNED: baseItems.filter(t => t.tab_status === 'UNASSIGNED')
            .length,
          LOCKED: baseItems.filter(t => t.tab_status === 'LOCKED').length,
          UNKNOWN: 0,
        }
      : { ALL: 8, ASSIGNED: 5, UNASSIGNED: 2, LOCKED: 1, UNKNOWN: 0 };
  return {
    items,
    totals,
    page: 1,
    lastPage: 1,
    total: items.length,
  };
}
export async function readP07Items(
  _warehouse: string,
  query: string,
): Promise<NfcCatalogPage<NfcItem>> {
  bump('items');
  await wait();
  if (scenario === 'items-error') reject('SERVICE_UNAVAILABLE', 'network');
  return {
    items:
      scenario === 'items-empty'
        ? []
        : [{ ...item, sku, nfc_status: 'UNASSIGNED' }].filter(t =>
            JSON.stringify(t).toLowerCase().includes(query.toLowerCase()),
          ),
    totals: null,
    page: 1,
    lastPage: 1,
    total: 1,
  };
}
export async function readP07Tag(_warehouse: string, id: string) {
  bump('tag');
  await wait();
  return (
    tags.find(t => t.physical_code_id === id) || {
      ...receipt().nfc,
      sku_name: sku.sku_name,
      sku_code: sku.sku_code,
      serial_number: item.serial_number,
    }
  );
}
export async function resolveNfcCode(): Promise<NfcResolvedCode> {
  bump('resolveCode');
  return preparation;
}
export async function fetchCurrentUser() {
  return {
    active_warehouse_id: context.warehouseId,
    available_warehouses: [
      { warehouse_id: context.warehouseId, name: 'Kho Hoa Nam' },
    ],
  };
}
export function cancelNfc() {
  bump('cancel');
}
export async function copyNfcIdentifier(value: string) {
  bump('copy');
  await navigator.clipboard.writeText(value);
}
