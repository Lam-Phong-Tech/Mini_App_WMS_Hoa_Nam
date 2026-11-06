/**
 * Ca kỹ thuật gắn với đúng một phiên đăng nhập.
 *
 * `current` chỉ phục hồi ca ACTIVE của chính phiên; current:null không chứng
 * minh START cũ chưa thực thi/đã ENDED. Receipt cùng START key mới đối chiếu
 * chính xác ý định cũ. Lệnh
 * `start` không được tự retry: bên gọi giữ nguyên Idempotency-Key, hỏi lại
 * `current`, rồi mới cho người dùng gửi lại cùng key + cùng warehouse_id.
 */

import {
  AppError,
  extractErrorCode,
  extractRequestId,
} from '../../errors/AppError';
import { getAppStorage } from '../../storage/storage';
import {
  apiClient,
  type ApiResponse,
  type RequestOptions,
} from '../../api/client';
import { approvedWriteFor } from '../../api/writeGate';
import { type ReadClient, type ReadOptions } from './readOnlyClient';
import type { ApiEnvelope } from './types';
import {
  captureSessionScope,
  isSessionScopeCurrent,
  getSession,
} from '../../auth/session';
import {
  currentShiftOwner,
  publishShiftState,
  getShiftState,
  assertShiftResponseCurrent,
  sameShiftOwner,
  hasPendingEndIntent,
  knownTrackedFamily,
} from '../../shift/shiftState';
import { parseShiftAdmission } from '../../shift/admission';
import { readShiftLocalOwners } from '../../shift/localOwners';

export const WORK_SHIFT_PATHS = {
  current: '/api/v1/mini-app/work-shifts/current',
  start: '/api/v1/mini-app/work-shifts/start',
} as const;

export interface WorkShift {
  readonly shift_id: string;
  readonly actor_id: string;
  readonly auth_session_id: string;
  readonly warehouse_id: string;
  readonly status: string;
  readonly started_at: string;
  readonly preview_ready: boolean;
  readonly version?: number;
  readonly ended_at?: string | null;
  readonly tracking_contract?: 'p14-shift-v1' | null;
  readonly lifecycle?: {
    readonly contract: 'p01-p14-lifecycle-v1';
    readonly mode: 'DISABLED' | 'ENABLED' | 'DRAINING';
    readonly tracking_status: 'TRACKED' | 'LEGACY_UNTRACKED';
    readonly end_supported: boolean;
    readonly end_unavailable_reason: string | null;
    readonly end_readiness: 'REQUIRES_CLOSE_CHECK_AND_LOCAL_CLEAN';
    readonly owner_coverage: 'PARTIAL_EXPLICIT_OWNER_PROTOCOLS';
    readonly local_state_verified: false;
    readonly legacy_upgrade_allowed: false;
  };
}

export interface StartWorkShiftInput {
  readonly actorId: string;
  readonly warehouseId: string;
  readonly authSessionId: string;
}

export interface WorkShiftWriteClient {
  request<T>(options: RequestOptions): Promise<ApiResponse<T>>;
}

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}
export function validShiftTimestamp(value: string): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    return false;
  const day = value.slice(0, 10),
    date = new Date(day + 'T00:00:00Z');
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day
  );
}

/** Chỉ trả ca khi response đủ bằng chứng để mở Home. */
export function parseWorkShift(value: unknown, route: string): WorkShift {
  const root = record(value);
  const source = record(root?.shift) ?? root;
  const shiftId = text(source?.shift_id) ?? text(source?.id);
  const warehouseId = text(source?.warehouse_id);
  const status = text(source?.status);
  const startedAt = text(source?.started_at);
  const previewReady = source?.preview_ready;
  const actorId = text(source?.actor_id),
    authSessionId = text(source?.auth_session_id);
  const hasLifecycle =
    source && ('lifecycle' in source || 'tracking_contract' in source);
  const life = record(source?.lifecycle);
  if (
    hasLifecycle &&
    (!life ||
      life.contract !== 'p01-p14-lifecycle-v1' ||
      !['DISABLED', 'ENABLED', 'DRAINING'].includes(String(life.mode)) ||
      ![null, 'p14-shift-v1'].includes(source!.tracking_contract as null) ||
      life.tracking_status !==
        (source!.tracking_contract === 'p14-shift-v1'
          ? 'TRACKED'
          : 'LEGACY_UNTRACKED') ||
      typeof life.end_supported !== 'boolean' ||
      life.local_state_verified !== false ||
      life.legacy_upgrade_allowed !== false ||
      life.owner_coverage !== 'PARTIAL_EXPLICIT_OWNER_PROTOCOLS' ||
      life.end_readiness !== 'REQUIRES_CLOSE_CHECK_AND_LOCAL_CLEAN' ||
      !(
        life.end_unavailable_reason === null ||
        typeof life.end_unavailable_reason === 'string'
      ) ||
      !Number.isSafeInteger(source!.version) ||
      Number(source!.version) < 1 ||
      !['ACTIVE', 'ENDED'].includes(String(status)) ||
      (status === 'ENDED'
        ? !(
            typeof source!.ended_at === 'string' &&
            validShiftTimestamp(source!.ended_at)
          ) || previewReady !== false
        : source!.ended_at !== null) ||
      (life.end_supported &&
        (status !== 'ACTIVE' ||
          source!.tracking_contract !== 'p14-shift-v1' ||
          life.mode === 'DISABLED' ||
          life.end_unavailable_reason !== null)))
  ) {
    throw new AppError({
      kind: 'parse',
      route,
      message: 'Lifecycle ca không đúng contract p01-p14-safety-r2.',
    });
  }

  if (
    shiftId === undefined ||
    warehouseId === undefined ||
    status === undefined ||
    !['ACTIVE', 'ENDED'].includes(status) ||
    startedAt === undefined ||
    actorId === undefined ||
    authSessionId === undefined ||
    !validShiftTimestamp(startedAt) ||
    typeof previewReady !== 'boolean'
  ) {
    throw new AppError({
      kind: 'parse',
      route,
      message: 'WMS chưa trả đủ bằng chứng ca làm việc.',
    });
  }

  return {
    shift_id: shiftId,
    actor_id: actorId,
    auth_session_id: authSessionId,
    warehouse_id: warehouseId,
    status,
    started_at: startedAt,
    preview_ready: previewReady,
    ...(hasLifecycle
      ? {
          version: source!.version as number,
          ended_at: source!.ended_at as string | null,
          tracking_contract: source!
            .tracking_contract as WorkShift['tracking_contract'],
          lifecycle: life as unknown as WorkShift['lifecycle'],
        }
      : {}),
  };
}

export function isPreviewReadyShift(
  shift: WorkShift,
  expected: StartWorkShiftInput,
): boolean {
  return (
    shift.status === 'ACTIVE' &&
    shift.actor_id === expected.actorId &&
    !!expected.actorId &&
    shift.preview_ready === true &&
    validShiftTimestamp(shift.started_at) &&
    shift.warehouse_id === expected.warehouseId &&
    shift.auth_session_id === expected.authSessionId
  );
}

export async function fetchCurrentWorkShift(
  options: ReadOptions = {},
  client: ReadClient = apiClient,
): Promise<WorkShift | null> {
  const scope = captureSessionScope();
  const atDispatch = getShiftState();
  const response = await client.get<ApiEnvelope<unknown | null>>(
    WORK_SHIFT_PATHS.current,
    options,
  );
  if (
    response.status !== 200 ||
    response.data?.success !== true ||
    !('data' in response.data)
  ) {
    throw new AppError({
      kind: 'parse',
      route: WORK_SHIFT_PATHS.current,
      message: 'Nguồn current chưa xác nhận kết quả đọc ca.',
    });
  }
  const data = response.data.data;
  const shift =
    data === null ? null : parseWorkShift(data, WORK_SHIFT_PATHS.current);
  if (client === apiClient) {
    const owner = currentShiftOwner();
    if (!isSessionScopeCurrent(scope) || !owner)
      throw new AppError({
        kind: 'cancelled',
        code: 'SHIFT_OWNER_CHANGED',
        message: 'Không nhận current của phiên cũ.',
      });
    assertShiftResponseCurrent(shift, atDispatch);
    const meta = record((response.data as { meta?: unknown }).meta);
    const admission = meta && Object.hasOwn(meta, 'shift_admission')
      ? parseShiftAdmission(meta.shift_admission, shift, owner) : undefined;
    publishShiftState(shift, owner, scope.generation, admission);
  }
  return shift;
}

function envelopeMessage(value: unknown): string | undefined {
  const message = record(value)?.message;
  return typeof message === 'string' && message.trim() !== ''
    ? message.trim()
    : undefined;
}

export async function startWorkShift(
  input: StartWorkShiftInput,
  idempotencyKey: string,
  options: Pick<RequestOptions, 'signal' | 'timeoutMs'> = {},
  client: WorkShiftWriteClient = apiClient,
): Promise<WorkShift> {
  const scope = captureSessionScope();
  const atDispatch = getShiftState();
  if (client === apiClient) {
    const owner = currentShiftOwner();
    if (!owner || !sameShiftOwner(owner, input))
      throw new AppError({
        kind: 'cancelled',
        code: 'SHIFT_OWNER_CHANGED',
        message: 'Không gửi START cho owner khác.',
      });
  }
  if (!UUID_PATTERN.test(input.warehouseId)) {
    throw new AppError({
      kind: 'config',
      route: WORK_SHIFT_PATHS.start,
      message: 'Kho làm việc không có UUID hợp lệ.',
    });
  }
  if (input.authSessionId.trim() === '') {
    throw new AppError({
      kind: 'config',
      route: WORK_SHIFT_PATHS.start,
      message: 'Phiên đăng nhập thiếu auth_session_id.',
    });
  }
  if (!input.actorId.trim())
    throw new AppError({
      kind: 'config',
      route: WORK_SHIFT_PATHS.start,
      message: 'Phiên thiếu actor đã xác minh.',
    });
  if (!UUID_PATTERN.test(idempotencyKey)) {
    throw new AppError({
      kind: 'config',
      route: WORK_SHIFT_PATHS.start,
      message: 'Idempotency-Key của yêu cầu bắt đầu ca không hợp lệ.',
    });
  }
  if (approvedWriteFor('POST', WORK_SHIFT_PATHS.start) !== 'workShift.start') {
    throw new AppError({
      kind: 'blocked_by_gate',
      route: WORK_SHIFT_PATHS.start,
      message: 'Thao tác bắt đầu ca chưa được mở trong cổng ghi của ứng dụng.',
    });
  }

  const response = await client.request<ApiEnvelope<unknown>>({
    path: WORK_SHIFT_PATHS.start,
    method: 'POST',
    body: { warehouse_id: input.warehouseId },
    headers: { 'Idempotency-Key': idempotencyKey },
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  });
  if (response.status !== 200 && response.status !== 201) {
    throw new AppError({
      kind: 'http',
      status: response.status,
      route: WORK_SHIFT_PATHS.start,
      message: 'WMS trả mã HTTP không hợp lệ cho bắt đầu ca.',
    });
  }
  const envelope = response.data;
  if (envelope?.success !== true) {
    throw new AppError({
      kind: 'http',
      status: response.status,
      code: extractErrorCode(envelope),
      route: WORK_SHIFT_PATHS.start,
      requestId:
        response.header?.('x-request-id') ?? extractRequestId(envelope),
      message: envelopeMessage(envelope) ?? 'WMS từ chối bắt đầu ca.',
    });
  }
  if (envelope === undefined || envelope === null || !('data' in envelope)) {
    throw new AppError({
      kind: 'parse',
      status: response.status,
      route: WORK_SHIFT_PATHS.start,
      message: 'Phản hồi bắt đầu ca không có trường data.',
    });
  }
  const shift = parseWorkShift(envelope.data, WORK_SHIFT_PATHS.start);
  if (client === apiClient) {
    if (!isSessionScopeCurrent(scope))
      throw new AppError({
        kind: 'cancelled',
        code: 'SHIFT_OWNER_CHANGED',
        message: 'Không nhận START của phiên cũ.',
      });
    assertShiftResponseCurrent(shift, atDispatch);
    publishShiftState(shift, input, scope.generation);
  }
  return shift;
}

// ---------------------------------------------------------------------------
// Lưu đúng một lần thử bắt đầu ca qua reload
// ---------------------------------------------------------------------------

const PENDING_START_KEY = 'work-shift.start.pending';
// Private retention in the existing journal storage, not another ShiftState.
// New login must not adopt or erase an unresolved old-family intent.
const RETAINED_START_PREFIX = 'work-shift.start.retained:';

export interface PendingWorkShiftStart {
  readonly actorId?: string;
  readonly authSessionId: string;
  readonly warehouseId: string;
  readonly idempotencyKey: string;
  readonly body?: { readonly warehouse_id: string };
  readonly outcome?: 'PREPARED' | 'IN_FLIGHT' | 'UNKNOWN';
}

function isPendingStart(value: unknown): value is PendingWorkShiftStart {
  const item = record(value);
  return (
    text(item?.authSessionId) !== undefined &&
    UUID_PATTERN.test(text(item?.warehouseId) ?? '') &&
    UUID_PATTERN.test(text(item?.idempotencyKey) ?? '') &&
    (item?.body === undefined ||
      (!Array.isArray(item.body) &&
        record(item.body)?.warehouse_id === item.warehouseId &&
        Object.keys(record(item.body) ?? {}).length === 1)) &&
    (item?.outcome === undefined ||
      ['PREPARED', 'IN_FLIGHT', 'UNKNOWN'].includes(String(item.outcome)))
  );
}

/** UUID v4 hợp lệ cho backend; không dùng khoá có tiền tố cũ của outbox. */
export function createWorkShiftIdempotencyKey(
  random: () => number = Math.random,
): string {
  const bytes = Array.from(
    { length: 16 },
    () => Math.floor(random() * 256) & 0xff,
  );
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.map(byte => byte.toString(16).padStart(2, '0'));
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}

export function getOrCreatePendingWorkShiftStart(
  authSessionId: string,
  warehouseId: string,
  actorId?: string,
): PendingWorkShiftStart {
  if (
    hasPendingEndIntent({
      actorId: actorId ?? currentShiftOwner()?.actorId ?? '',
      authSessionId,
      warehouseId,
    })
  )
    throw new AppError({
      kind: 'unknown',
      code: 'SHIFT_END_PENDING',
      message:
        'END cũ chưa có receipt xác minh. Chỉ đối chiếu key END gốc; không mở ca bù.',
    });
  const storage = getAppStorage();
  const saved = storage.getObject<unknown>(PENDING_START_KEY);
  if (storage.has(PENDING_START_KEY) && !isPendingStart(saved))
    throw new AppError({
      kind: 'unknown',
      code: 'SHIFT_START_INTENT_DAMAGED',
      message:
        'Journal START cũ không hợp lệ. Giữ nguyên, không tạo key thay thế.',
    });
  const sameIntentOwner =
    isPendingStart(saved) &&
    saved.authSessionId === authSessionId &&
    saved.actorId === actorId;
  if (!sameIntentOwner) {
    const state = getShiftState();
    if (state.admission && (state.admission.actor_id !== actorId || state.admission.auth_session_id !== authSessionId ||
      state.admission.warehouse_id !== warehouseId))
      throw new AppError({ kind: 'blocked_by_gate', code: 'SHIFT_ADMISSION_SCOPE_CHANGED', message: 'Capability nhận ca không thuộc đúng owner/kho.' });
    if (state.admission && !state.admission.new_tracked_start_supported)
      throw new AppError({ kind: 'blocked_by_gate', code: 'SHIFT_ADMISSION_CLOSED', message: 'BE hiện không nhận ca mới. Giữ nguyên ca và intent đã có.' });
    if (state.admission?.tracked_family) {
      const local = readShiftLocalOwners();
      if (!local.coverageComplete || local.state !== 'CLEAN' || local.busy || local.pendingRequestIds.length)
        throw new AppError({ kind: 'blocked_by_gate', code: 'SHIFT_LOCAL_RECONCILIATION_REQUIRED',
          message: 'Các chủ luồng trên máy chưa xác nhận CLEAN. Giữ bản nháp và đối chiếu yêu cầu gốc trước khi nhận ca mới.' });
    }
    if (knownTrackedFamily() && !state.shift?.lifecycle && !state.admission?.new_tracked_start_supported)
      throw new AppError({
        kind: 'blocked_by_gate',
        code: 'SHIFT_LIFECYCLE_UNVERIFIED',
        message:
          'Family tracked chưa có mode hiện tại để nhận ca mới. Không tạo key/START legacy thay thế.',
      });
    if (
      state.shift?.lifecycle?.mode === 'DRAINING' ||
      (state.phase === 'ENDED' && state.shift?.lifecycle?.mode === 'DISABLED')
    )
      throw new AppError({
        kind: 'blocked_by_gate',
        code: 'SHIFT_START_PAUSED',
        message: 'Lifecycle hiện tại không nhận ý định ca mới.',
      });
  }
  if (
    isPendingStart(saved) &&
    saved.authSessionId === authSessionId &&
    (saved.warehouseId !== warehouseId || saved.actorId !== actorId)
  )
    throw new AppError({
      kind: 'unknown',
      code: 'SHIFT_START_INTENT_CONFLICT',
      message:
        'START intent cũ của phiên cần đối chiếu. Không đổi owner/kho/key để mở intent khác.',
    });
  if (
    isPendingStart(saved) &&
    saved.authSessionId === authSessionId &&
    saved.warehouseId === warehouseId &&
    saved.actorId === actorId
  ) {
    return saved;
  }
  const next: PendingWorkShiftStart = {
    authSessionId,
    warehouseId,
    ...(actorId ? { actorId } : {}),
    idempotencyKey: createWorkShiftIdempotencyKey(),
    body: { warehouse_id: warehouseId },
    outcome: 'PREPARED',
  };
  if (isPendingStart(saved))
    storage.setObject(RETAINED_START_PREFIX + saved.idempotencyKey, saved);
  storage.setObject(PENDING_START_KEY, next);
  return next;
}

export function readPendingWorkShiftStart(): PendingWorkShiftStart | undefined {
  const saved = getAppStorage().getObject<unknown>(PENDING_START_KEY);
  const session = getSession();
  return isPendingStart(saved) &&
    session &&
    saved.authSessionId === session.authSessionId &&
    saved.actorId === session.userId
    ? saved
    : undefined;
}
export function markPendingWorkShiftStart(
  outcome: 'IN_FLIGHT' | 'UNKNOWN',
): void {
  const saved = readPendingWorkShiftStart();
  if (saved)
    getAppStorage().setObject(PENDING_START_KEY, { ...saved, outcome });
}

export function clearPendingWorkShiftStart(authSessionId?: string): void {
  const storage = getAppStorage();
  if (authSessionId === undefined) return; // no blanket UNKNOWN/corrupt cleanup
  const saved = storage.getObject<unknown>(PENDING_START_KEY);
  if (isPendingStart(saved) && saved.authSessionId === authSessionId) {
    storage.remove(PENDING_START_KEY);
  }
}
