import { decodePushPayload, decodePushClick, deliveryUuid } from './parse';
import { AppError } from '../../../errors/AppError';
import type {
  DeliveryBinding,
  DeliveryCapabilities,
  DeliveryService,
  InstallationIdentity,
  PushPlatform,
  Registration,
  SelfTestReceipt,
  PushPermission,
} from './types';
export interface DeliveryState {
  phase: 'checking' | 'off' | 'ready' | 'busy' | 'unavailable' | 'error';
  message: string;
  selfTestEnabled?: boolean;
  receipt?: SelfTestReceipt;
  canDisable?: boolean;
  canReconcile?: boolean;
}
const same = (a: DeliveryBinding | null, b: DeliveryBinding) =>
  a?.registrationId === b.registrationId &&
  a.bindingVersion === b.bindingVersion;
function binding(r: Registration): DeliveryBinding | null {
  return r.active && r.ownership === 'OWN' && r.registrationId
    ? { registrationId: r.registrationId, bindingVersion: r.bindingVersion }
    : null;
}
function readinessFailure(error: unknown): string {
  return error instanceof AppError &&
    error.status === 404 &&
    error.route?.endsWith('/notification-delivery/capabilities')
    ? 'API FCM chưa có trong bản máy chủ đang chạy (404). Chưa thể đăng ký hoặc gửi thử. Danh sách thông báo vẫn dùng bình thường.'
    : 'Chưa xác minh được cấu hình thông báo thiết bị. Chọn Kiểm tra lại trước khi bật hoặc gửi thử.';
}
export class NotificationDeliveryController {
  private disposed = false;
  private busy = false;
  private refreshing = false;
  private identityValue?: InstallationIdentity;
  private owned: DeliveryBinding | null = null;
  private capabilitiesValue?: DeliveryCapabilities;
  private seen = new Set<string>();
  private stops: (() => void)[] = [];
  private testKey?: string;
  private testBinding?: DeliveryBinding;
  private permissionValue?: PushPermission;
  constructor(
    private platform: PushPlatform,
    private service: DeliveryService,
    private effects: {
      isCurrent(): boolean;
      onState(s: DeliveryState): void;
      onSignal(recipientId: string): Promise<void>;
      onOpen(recipient: string): Promise<void>;
    },
  ) {
    this.stops = [
      platform.onMessage(d => this.signal(d, false)),
      platform.onClick(d => this.signal(d, true)),
    ];
  }
  private current() {
    return !this.disposed && this.effects.isCurrent();
  }
  private state(s: DeliveryState) {
    if (this.current())
      this.effects.onState({
        ...s,
        canDisable: !!this.owned,
        canReconcile: !!(
          this.owned &&
          this.testKey &&
          this.testBinding &&
          same(this.testBinding, this.owned)
        ),
      });
  }
  private async identity() {
    return (
      this.identityValue ??
      (this.identityValue = await this.platform.identity())
    );
  }
  private async capabilities() {
    const identity =
      this.platform.platform === 'ANDROID' ? await this.identity() : undefined;
    if (!this.current()) throw new Error('Notification owner changed');
    return this.service.capabilities(identity);
  }
  private async originalTest() {
    const pending = await this.platform.readTestIntent?.();
    if (!this.current()) return;
    if (!pending) return;
    if (
      !deliveryUuid(pending.requestKey) ||
      !deliveryUuid(pending.binding.registrationId) ||
      !Number.isSafeInteger(pending.binding.bindingVersion) ||
      pending.binding.bindingVersion < 1
    )
      throw Error('Invalid pending TEST identity');
    if (
      (this.testKey && this.testKey !== pending.requestKey) ||
      (this.testBinding && !same(this.testBinding, pending.binding))
    )
      throw Error('Pending TEST identity changed');
    this.testKey ??= pending.requestKey;
    this.testBinding ??= pending.binding;
  }
  private blockedOriginalTest() {
    this.state({
      phase: 'unavailable',
      message:
        'Giữ yêu cầu gửi thử gốc để đối chiếu; không đăng ký lại hoặc tạo yêu cầu gửi khác.',
    });
  }
  async refresh() {
    if (this.busy || this.refreshing || !this.current()) return;
    this.refreshing = true;
    // Failed readiness must not retain admission from an earlier response.
    this.capabilitiesValue = undefined;
    this.state({
      phase: 'checking',
      message: 'Đang kiểm tra thông báo thiết bị…',
    });
    try {
      const support = await this.platform.support();
      this.permissionValue = support;
      if (!this.current()) return;
      if (support === 'unsupported' || support === 'not-configured') {
        this.state({
          phase: 'unavailable',
          message: 'Thiết bị hoặc trình duyệt chưa hỗ trợ thông báo.',
        });
        return;
      }
      this.capabilitiesValue = await this.capabilities();
      const cap = this.capabilitiesValue;
      if (!this.current()) return;
      const marker = await this.platform.getBinding();
      if (!this.current()) return;
      if (marker) {
        const own = binding(await this.service.read(await this.identity()));
        if (!this.current()) return;
        this.owned = own && same(own, marker) ? own : null;
      } else this.owned = null;
      if (this.platform.platform === 'ANDROID') {
        await this.originalTest();
        if (!this.current()) return;
        if (this.testKey) {
          if (
            !this.owned ||
            !this.testBinding ||
            !same(this.testBinding, this.owned)
          ) {
            this.blockedOriginalTest();
            return;
          }
          this.state({
            phase: cap.enabled ? 'ready' : 'unavailable',
            message:
              'Đã có yêu cầu gửi thử gốc. Chỉ đối chiếu kết quả, không gửi lại.',
            selfTestEnabled: false,
          });
          return;
        }
      }
      if (
        !cap.enabled ||
        !cap.platforms.includes(this.platform.platform) ||
        this.platform.configurationReady?.(cap) === false
      ) {
        this.state({
          phase: 'unavailable',
          message:
            'Thông báo thiết bị chưa được cấu hình. Danh sách thông báo vẫn dùng bình thường.',
        });
        return;
      }
      if (!this.current()) return;
      if (this.owned && support === 'granted') {
        this.refreshing = false;
        await this.enable();
        return;
      }
      this.state({
        phase: 'off',
        message:
          support === 'denied'
            ? 'Thông báo bị chặn. Mở cài đặt thiết bị/trình duyệt để cho phép.'
            : 'Bật thông báo cho riêng thiết bị này.',
      });
    } catch (error) {
      this.capabilitiesValue = undefined;
      this.state({
        phase: 'unavailable',
        message: readinessFailure(error),
      });
    } finally {
      this.refreshing = false;
    }
  }
  async enable() {
    if (this.busy || this.refreshing || !this.current()) return;
    this.busy = true;
    this.state({ phase: 'busy', message: 'Đang đăng ký thông báo…' });
    const cached = this.capabilitiesValue;
    // On Web, use readiness checked by refresh before the user's gesture.
    try {
      if (this.platform.platform === 'ANDROID') {
        await this.originalTest();
        if (!this.current()) return;
        if (this.testKey) {
          this.blockedOriginalTest();
          return;
        }
      }
      const earlyPermission =
        cached?.enabled &&
        cached.platforms.includes(this.platform.platform) &&
        this.platform.configurationReady?.(cached) !== false &&
        this.permissionValue === 'default'
          ? this.platform.requestPermission()
          : undefined;
      const cap = cached ?? (await this.capabilities());
      this.capabilitiesValue = cap;
      if (
        !cap.enabled ||
        !cap.platforms.includes(this.platform.platform) ||
        this.platform.configurationReady?.(cap) === false
      ) {
        this.state({
          phase: 'unavailable',
          message: 'Thông báo thiết bị chưa được cấu hình đầy đủ.',
        });
        return;
      }
      if (!this.current()) return;
      let permission = earlyPermission
        ? await earlyPermission
        : await this.platform.support();
      if (permission === 'default')
        permission = await this.platform.requestPermission();
      if (!this.current()) return;
      if (permission !== 'granted') {
        this.state({
          phase: permission === 'denied' ? 'off' : 'unavailable',
          message: 'Chưa được cấp quyền thông báo trên thiết bị này.',
        });
        return;
      }
      const i = await this.identity();
      const token = await this.platform.token(cap);
      if (!this.current()) return;
      let before = await this.service.read(i);
      if (!this.current()) return;
      if (
        before.active &&
        before.ownership === 'OWN' &&
        !(await this.platform.getBinding())
      ) {
        // Explicit consent after a local clear: retire the exact current version
        // before creating a fresh binding. Never resurrect a cleared marker.
        if (!this.current()) return;
        before = await this.service.unregister(i, before.bindingVersion);
        if (!this.current() || before.active)
          throw Error('Opt-out needs reconciliation');
      }
      let result: Registration;
      try {
        result = await this.service.register(
          i,
          token,
          before.bindingVersion,
          this.platform.platform,
        );
      } catch (cause) {
        if (!this.current()) return;
        const read = await this.service.read(i);
        if (!binding(read) || read.bindingVersion <= before.bindingVersion)
          throw cause;
        result = read;
      }
      const b = binding(result);
      if (!this.current()) return;
      if (!b) throw Error('Binding not active');
      await this.platform.storeBinding(b);
      this.owned = b;
      if (!this.current()) {
        await this.platform.clearBinding(b);
        return;
      }
      if (!same(await this.platform.getBinding(), b))
        throw Error('Binding was cleared');
      this.state({
        phase: 'ready',
        message:
          'Đã đăng ký thiết bị. Gửi thành công chưa đồng nghĩa thông báo đã hiển thị.',
        selfTestEnabled: cap.selfTestEnabled,
      });
    } catch (error) {
      this.state({
        phase: this.capabilitiesValue ? 'error' : 'unavailable',
        message: this.capabilitiesValue
          ? 'Chưa xác minh được đăng ký. Không tự gửi lại; chọn Kiểm tra lại để đối chiếu.'
          : readinessFailure(error),
      });
    } finally {
      this.busy = false;
    }
  }
  async disable() {
    if (this.busy || !this.current()) return;
    this.busy = true;
    const b = this.owned;
    try {
      if (!b) return;
      const cleared = await this.platform.clearBinding(b);
      if (!cleared) {
        this.owned = null;
        this.state({
          phase: 'error',
          message: 'Đăng ký thiết bị đã thay đổi. Chọn Kiểm tra lại.',
        });
        return;
      }
      this.owned = null;
      const i = await this.identity();
      if (!this.current()) return;
      await this.service.unregister(i, b.bindingVersion);
      this.state({
        phase: 'off',
        message: 'Đã tắt thông báo trên thiết bị này.',
      });
    } catch {
      this.state({
        phase: 'off',
        message:
          'Đã tắt hiển thị trên thiết bị; chưa xác minh được việc hủy đăng ký tại máy chủ.',
      });
    } finally {
      this.busy = false;
    }
  }
  async selfTest() {
    if (this.busy || !this.current() || !this.owned) return;
    this.busy = true;
    try {
      if (this.platform.platform === 'ANDROID') {
        await this.originalTest();
        if (!this.current()) return;
        if (this.testBinding && !same(this.owned, this.testBinding)) {
          this.blockedOriginalTest();
          return;
        }
      }
      const b = this.owned,
        i = await this.identity(),
        pending = await this.platform.readTestIntent?.();
      const readOnly =
        !!(pending && same(pending.binding, b)) || !!this.testKey;
      if (!this.capabilitiesValue?.selfTestEnabled && !readOnly) return;
      this.testBinding = b;
      this.testKey ??=
        pending && same(pending.binding, b)
          ? pending.requestKey
          : await this.platform.newRequestKey();
      if (!this.current()) return;
      const key = this.testKey;
      let receipt: SelfTestReceipt;
      if (readOnly) receipt = await this.service.readTest(i, key);
      else {
        await this.platform.storeTestIntent?.({ requestKey: key, binding: b });
        if (!this.current()) return;
        try {
          receipt = await this.service.test(i, b, key);
        } catch {
          receipt = await this.service.readTest(i, key);
        }
      }
      if (!this.current() || !same(await this.platform.getBinding(), b)) return;
      if (receipt.requestKey !== key || !same(receipt, b))
        throw Error('Self-test receipt scope mismatch');
      this.state({
        phase: 'ready',
        message:
          'Trạng thái gửi thử: ' +
          receipt.state +
          '. Kiểm tra thông báo thực tế trên thiết bị.',
        receipt,
        selfTestEnabled: this.capabilitiesValue?.selfTestEnabled === true,
      });
    } catch {
      this.state({
        phase: 'error',
        message:
          'Kết quả gửi thử chưa rõ. Giữ mã yêu cầu để đối chiếu; không tự gửi yêu cầu khác.',
      });
    } finally {
      this.busy = false;
    }
  }
  private async signal(data: unknown, click: boolean) {
    const p = click ? decodePushClick(data) : decodePushPayload(data);
    if (!p || !this.current()) return;
    try {
      if (!same(await this.platform.getBinding(), p) || !this.current()) return;
      const current = binding(await this.service.read(await this.identity()));
      if (!current || !same(current, p) || !this.current()) return;
      if (click) {
        await this.effects.onOpen(p.recipientId);
        return;
      }
      if (this.seen.has(p.deliveryId)) return;
      this.seen.add(p.deliveryId);
      if (this.seen.size > 256)
        this.seen.delete(this.seen.values().next().value!);
      await this.effects.onSignal(p.recipientId);
    } catch {
      /* A push is a hint; protected P13 remains authoritative. */
    }
  }
  dispose() {
    this.disposed = true;
    this.stops.forEach(s => s());
    const b = this.owned;
    if (b && !this.effects.isCurrent()) void this.platform.clearBinding(b);
  }
}
