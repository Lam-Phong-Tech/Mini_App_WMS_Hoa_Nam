import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import {
  AccountRecoverySupportFlow,
  P14RecoveryReceived,
} from '../src/features/auth/AccountRecoverySupportFlow';
import {
  createP14RecoveryService,
  parseRecoveryReceipt,
  RecoveryRequestError,
  recoveryUsername,
  type RecoveryCommand,
} from '../src/services/wms/p14Recovery';
import { createRecoveryIdentity as webIdentity } from '../src/native/p14RecoveryIdentity.web';
import { getCurrentEnvironment } from '../src/config/env';
import { Input } from '../src/ui/Input';
import { Button } from '../src/ui/Button';
const command: RecoveryCommand = {
  operationId: '14141414-1414-4414-8414-141414141414',
  proof: 'A'.repeat(43),
  username: 'TEST-USER',
};
const body = () => ({
  success: true,
  data: {
    operation_id: command.operationId,
    state: 'RECEIVED',
    received_at: '2026-11-03T01:00:00.000000Z',
    expires_at: '2026-11-04T01:00:00.000000Z',
    account_access_granted: false,
  },
  meta: { contract: 'p14-recovery-v1', request_id: 'UNIT-ONLY-P14' },
});
const health = {
  success: true,
  data: { build: { sha: '99ffd6c652a662470c762da3487e743ccb67497a' } },
};
const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-WMS-Deployment-Tier': 'dev-test',
};
function response(b: any, status = 202, h: Record<string, string> = headers) {
  return {
    status,
    ok: status >= 200 && status < 300,
    redirected: false,
    json: async () => b,
    headers: {
      get: (k: string) =>
        Object.entries(h).find(
          ([key]) => key.toLowerCase() === k.toLowerCase(),
        )?.[1] ?? null,
    },
  } as Response;
}
function harness() {
  const fetchImpl = jest.fn(async (url: any, _init?: any) =>
    String(url).endsWith('/health') ? response(health, 200) : response(body()),
  );
  const identity = jest.fn(async () => ({
    operationId: command.operationId,
    proof: command.proof,
  }));
  const service = createP14RecoveryService({
    fetchImpl: fetchImpl as any,
    identity,
  });
  return { fetchImpl, identity, service };
}
let tree: Renderer.ReactTestRenderer | undefined;
afterEach(async () => {
  await act(() => tree?.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});
const json = () => JSON.stringify(tree?.toJSON());
async function mount(element: React.ReactElement) {
  await act(async () => {
    tree = Renderer.create(<AppProviders>{element}</AppProviders>);
  });
}
async function click(label: string) {
  await act(async () =>
    tree!.root
      .findAllByType(Button)
      .find(b => b.props.label === label)!
      .props.onPress(),
  );
}
test('exact anonymous username support command; no auth token, email/OTP, extra body or query', async () => {
  const h = harness(),
    c = await h.service.prepare('  TEST-USER  ');
  expect(c.username).toBe('TEST-USER');
  await h.service.submit(c);
  const [url, init] = h.fetchImpl.mock.calls[1];
  expect(url).toBe(
    getCurrentEnvironment().apiBaseUrl + '/api/v1/auth/recovery-requests',
  );
  expect(init).toMatchObject({
    method: 'POST',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    headers: {
      'X-Recovery-Proof': command.proof,
      'Idempotency-Key': command.operationId,
    },
  });
  expect(JSON.parse(init.body)).toEqual({ username: 'TEST-USER' });
  expect(init.headers.Authorization).toBeUndefined();
  expect(h.fetchImpl).toHaveBeenCalledTimes(2);
});
test('GET reconciliation keeps the same operation/proof and sends no create body or idempotency header', async () => {
  const h = harness();
  h.fetchImpl.mockImplementation(async (url: any) =>
    String(url).endsWith('/health')
      ? response(health, 200)
      : response(body(), 200),
  );
  await h.service.check(command);
  const [url, init] = h.fetchImpl.mock.calls[1];
  expect(url).toBe(
    getCurrentEnvironment().apiBaseUrl +
      '/api/v1/auth/recovery-requests/operations/' +
      command.operationId,
  );
  expect(String(url)).not.toContain(command.proof);
  expect(init.method).toBe('GET');
  expect(init.body).toBeUndefined();
  expect(init.headers['Idempotency-Key']).toBeUndefined();
});
test.each(['', '  ', 'x\u0000y', 'a'.repeat(201)])(
  'invalid username is rejected before entropy/network %s',
  async name => {
    const h = harness();
    await expect(h.service.prepare(name)).rejects.toBeInstanceOf(
      RecoveryRequestError,
    );
    expect(h.identity).not.toHaveBeenCalled();
    expect(h.fetchImpl).not.toHaveBeenCalled();
  },
);
test('username case is preserved and production/foreign environment fails closed', async () => {
  expect(recoveryUsername('  User.Name  ')).toBe('User.Name');
  const fetchImpl = jest.fn();
  const s = createP14RecoveryService({
    fetchImpl,
    environment: {
      ...getCurrentEnvironment(),
      apiBaseUrl: 'https://invalid.example',
    },
  });
  await expect(s.prepare('TEST')).rejects.toMatchObject({
    code: 'RECOVERY_DEV_ONLY',
  });
  expect(fetchImpl).not.toHaveBeenCalled();
});
test('environment changed during health cannot receive username or proof',async()=>{
  const env={...getCurrentEnvironment()},fetchImpl=jest.fn(async()=>{env.apiBaseUrl='https://invalid.example';return response(health,200);});
  const service=createP14RecoveryService({environment:env,fetchImpl:fetchImpl as any});
  await expect(service.submit(command)).rejects.toMatchObject({code:'RECOVERY_DEV_ONLY'});expect(fetchImpl).toHaveBeenCalledTimes(1);
});
test.each([
  (b: any) => (b.meta.contract = 'otp'),
  (b: any) => (b.data.operation_id = 'other'),
  (b: any) => (b.data.account_access_granted = true),
  (b: any) => (b.data.state = 'APPROVED'),
  (b: any) => (b.data.received_at = '2026-11-03 08:00:00'),
  (b: any) => (b.data.expires_at = b.data.received_at),
])(
  'invalid receipt never becomes received or grants account access %#',
  mutate => {
    const b = body();
    mutate(b);
    expect(() => parseRecoveryReceipt(b, command.operationId)).toThrow();
  },
);
test('source-disabled503 is explicit, and a network-unknown POST requires reconciliation', async () => {
  const h = harness();
  h.fetchImpl.mockImplementation(async (url: any) =>
    String(url).endsWith('/health')
      ? response(health, 200)
      : response(
          {
            success: false,
            error: { code: 'RECOVERY_SUPPORT_UNAVAILABLE' },
            message: 'OFF',
          },
          503,
        ),
  );
  await expect(h.service.submit(command)).rejects.toMatchObject({
    code: 'RECOVERY_SUPPORT_UNAVAILABLE',
    uncertain: false,
    status: 503,
  });
  h.fetchImpl.mockImplementation(async (url: any) => {
    if (String(url).endsWith('/health')) return response(health, 200);
    throw new TypeError('network');
  });
  await expect(h.service.submit(command)).rejects.toMatchObject({
    code: 'RECOVERY_NETWORK_UNKNOWN',
    uncertain: true,
  });
});
test('Web proof uses two CSPRNG draws and unpadded base64url32-byte output', async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const draws = jest.fn((bytes: Uint8Array) => {
    for (let i = 0; i < bytes.length; i++) bytes[i] = i;
    return bytes;
  });
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { getRandomValues: draws },
  });
  try {
    const id = await webIdentity();
    expect(draws).toHaveBeenCalledTimes(2);
    expect(id.operationId).toMatch(
      /^[0-9a-f-]{14}4[0-9a-f-]{4}[89ab][0-9a-f-]+$/,
    );
    expect(id.proof).toBe(
      Buffer.from(Array.from({ length: 32 }, (_, i) => i)).toString(
        'base64url',
      ),
    );
  } finally {
    if (saved) Object.defineProperty(globalThis, 'crypto', saved);
    else delete (globalThis as any).crypto;
  }
});
test('new P14 form is username support; no request fires on mount', async () => {
  const h = harness();
  await mount(
    <AccountRecoverySupportFlow
      onBack={jest.fn()}
      onDone={jest.fn()}
      service={h.service}
    />,
  );
  expect(json()).toContain('Khôi phục tài khoản');
  expect(tree!.root.findByType(Input).props.label).toBe('Tên đăng nhập');
  expect(json()).not.toContain('OTP');
  expect(h.fetchImpl).not.toHaveBeenCalled();
});
test('disabled backend never opens S02 and keeps the username editable',async()=>{
  const service={prepare:jest.fn(async()=>command),submit:jest.fn(async()=>{throw new RecoveryRequestError('RECOVERY_SUPPORT_UNAVAILABLE','Kênh hỗ trợ chưa khả dụng',{status:503});}),check:jest.fn()};
  await mount(<AccountRecoverySupportFlow onBack={jest.fn()} onDone={jest.fn()} service={service}/>);
  await act(async()=>tree!.root.findByType(Input).props.onChangeText('TEST-USER'));await click('Gửi yêu cầu hỗ trợ');
  expect(json()).toContain('Kênh hỗ trợ chưa khả dụng');expect(json()).not.toContain('Yêu cầu đã tiếp nhận');expect(tree!.root.findByType(Input).props.editable).toBe(true);expect(service.check).not.toHaveBeenCalled();
});
test('unknown outcome uses GET even if the old submit callback is invoked again; receipt alone opens S02', async () => {
  const c = { ...command },
    receipt = parseRecoveryReceipt(body(), command.operationId),
    service = {
      prepare: jest.fn(async () => c),
      submit: jest.fn(async () => {
        throw new RecoveryRequestError('UNKNOWN', 'Chưa rõ kết quả', {
          uncertain: true,
        });
      }),
      check: jest.fn(async () => receipt),
    };
  await mount(
    <AccountRecoverySupportFlow
      onBack={jest.fn()}
      onDone={jest.fn()}
      service={service}
    />,
  );
  await act(async () =>
    tree!.root.findByType(Input).props.onChangeText('TEST-USER'),
  );
  const original = tree!.root
    .findAllByType(Button)
    .find(b => b.props.label === 'Gửi yêu cầu hỗ trợ')!.props.onPress;
  await act(async () => original());
  expect(json()).not.toContain('Yêu cầu đã tiếp nhận');
  expect(tree!.root.findByType(Input).props.editable).toBe(false);
  await act(async () => original());
  expect(service.submit).toHaveBeenCalledTimes(1);
  expect(service.check).toHaveBeenCalledWith(c, expect.any(AbortSignal));
  expect(json()).toContain('Yêu cầu đã tiếp nhận');
  expect(json()).not.toContain('Mật khẩu đã được cập nhật');
});
test('received UI shows verified time/identity and copy exports only operation ID', async () => {
  const copy = jest.fn(async () => {});
  await mount(
    <P14RecoveryReceived
      username="TEST-USER"
      receipt={parseRecoveryReceipt(body(), command.operationId)}
      onDone={jest.fn()}
      copy={copy}
    />,
  );
  expect(json()).toContain('08:00 · 03/11/2026');
  expect(json()).toContain('Chờ quản trị viên xác minh');
  await act(async () =>
    tree!.root
      .findAll(
        n =>
          n.props.accessibilityLabel === 'Sao chép mã yêu cầu' &&
          typeof n.props.onPress === 'function',
      )[0]
      .props.onPress(),
  );
  expect(copy).toHaveBeenCalledWith(command.operationId);
  expect(JSON.stringify(copy.mock.calls)).not.toContain(command.proof);
});
