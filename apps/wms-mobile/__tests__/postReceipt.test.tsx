/**
 * Hành động **Post Receipt** ở màn Duyệt phiếu — `GATE_WMS §2f`.
 *
 * Đây là thao tác duy nhất trong app **tăng tồn kho thật** và không hoàn tác
 * được bằng cách bấm lại. Bộ test này canh bốn tính chất, theo thứ tự nguy hiểm
 * giảm dần:
 *
 * 1. Không Post khi máy chủ chưa nói phiếu sẵn sàng.
 * 2. Không Post trước khi người dùng xác nhận.
 * 3. Khoá idempotency ổn định theo phiếu, qua mọi lần bấm lại.
 * 4. Nút mờ phải **kèm lý do**, không mờ câm lặng.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { ApprovalsScreen } from '../src/features/approvals/ApprovalsScreen';
import {
  POST_RECEIPT_KEY_PREFIX,
  canPostReceipt,
  postBlockedReason,
  postReceiptIdempotencyKey,
  usePostReceipt,
} from '../src/features/approvals/usePostReceipt';
import { resetTierCheckForTesting } from '../src/services/wms/tierCheck';
import type { InboundDocument } from '../src/services/wms/types';

const READY: InboundDocument = {
  id: 'c725221e-b87e-41b7-a81a-ffbd9b859ab3',
  doc_no: 'PN-COV-P00060',
  version: 7,
  ready_for_post: true,
  expected_total_qty: 8,
  scanned_total_qty: 8,
};

const NOT_READY: InboundDocument = {
  ...READY,
  ready_for_post: false,
  scanned_total_qty: 5,
};

afterEach(() => {
  resetTierCheckForTesting();
});

// ---------------------------------------------------------------------------
// 1. Điều kiện Post
// ---------------------------------------------------------------------------

describe('🔒 chỉ Post khi MÁY CHỦ nói phiếu sẵn sàng', () => {
  it('ready_for_post = true thì cho', () => {
    expect(canPostReceipt(READY)).toBe(true);
    expect(postBlockedReason(READY)).toBeUndefined();
  });

  it('ready_for_post = false thì KHÔNG cho, dù đã quét đủ', () => {
    // Client không tự suy từ scanned/expected. Spec: "Chỉ SCANNING full-scan
    // mới được Post" — điều kiện đó do máy chủ đánh giá, không phải client.
    expect(
      canPostReceipt({ ...READY, ready_for_post: false }),
    ).toBe(false);
  });

  it('thiếu hẳn trường ready_for_post thì KHÔNG cho', () => {
    // Máy chủ chưa nói được thì client không thay nó quyết định.
    const withoutFlag: InboundDocument = { ...READY };
    delete (withoutFlag as { ready_for_post?: boolean }).ready_for_post;
    expect(canPostReceipt(withoutFlag)).toBe(false);
    expect(postBlockedReason(withoutFlag)).toBeDefined();
  });

  it('lý do nêu ĐÚNG số mã còn thiếu, không phải câu chung chung', () => {
    // Nút mờ câm lặng không nói được việc cần làm.
    expect(postBlockedReason(NOT_READY)).toContain('3 mã');
  });

  it('quét đủ nhưng máy chủ chưa duyệt thì nói đúng lý do đó', () => {
    expect(postBlockedReason({ ...READY, ready_for_post: false })).toContain(
      'WMS chưa đánh dấu',
    );
  });
});

// ---------------------------------------------------------------------------
// 2 + 3. Xác nhận và khoá idempotency
// ---------------------------------------------------------------------------

/** Dựng hook trong một component tối giản để gọi được API của nó. */
function renderHook(deps: Parameters<typeof usePostReceipt>[0]) {
  const captured: { current?: ReturnType<typeof usePostReceipt> } = {};
  function Probe(): null {
    captured.current = usePostReceipt(deps);
    return null;
  }
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<Probe />);
  });
  return {
    get: () => captured.current as ReturnType<typeof usePostReceipt>,
    unmount: () => {
      ReactTestRenderer.act(() => tree?.unmount());
    },
  };
}

describe('🔒 không Post trước khi người dùng xác nhận', () => {
  it('ask() chỉ mở hộp xác nhận, KHÔNG gửi gì', async () => {
    let calls = 0;
    const hook = renderHook({
      post: async () => {
        calls += 1;
        return {};
      },
    });

    await ReactTestRenderer.act(async () => {
      hook.get().ask(READY);
    });

    expect(hook.get().confirming?.id).toBe(READY.id);
    expect(calls).toBe(0);
    hook.unmount();
  });

  it('cancel() đóng hộp và vẫn KHÔNG gửi gì', async () => {
    let calls = 0;
    const hook = renderHook({
      post: async () => {
        calls += 1;
        return {};
      },
    });

    await ReactTestRenderer.act(async () => {
      hook.get().ask(READY);
    });
    await ReactTestRenderer.act(async () => {
      hook.get().cancel();
    });

    expect(hook.get().confirming).toBeUndefined();
    expect(calls).toBe(0);
    hook.unmount();
  });

  it('confirm() gửi ĐÚNG mã phiếu và ĐÚNG version', async () => {
    const sent: { id?: string; version?: unknown; key?: string }[] = [];
    const hook = renderHook({
      post: async (input, key) => {
        sent.push({ id: input.documentId, version: input.version, key });
        return {};
      },
    });

    await ReactTestRenderer.act(async () => {
      hook.get().ask(READY);
    });
    await ReactTestRenderer.act(async () => {
      await hook.get().confirm();
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.id).toBe(READY.id);
    expect(sent[0]?.version).toBe(7);
    hook.unmount();
  });

  it('confirm() khi chưa ask() thì không gửi gì', async () => {
    let calls = 0;
    const hook = renderHook({
      post: async () => {
        calls += 1;
        return {};
      },
    });
    await ReactTestRenderer.act(async () => {
      await hook.get().confirm();
    });
    expect(calls).toBe(0);
    hook.unmount();
  });

  it('nạp lại danh sách sau khi Post — phiếu đã POSTED không còn chờ duyệt', async () => {
    const reloaded: string[] = [];
    const hook = renderHook({
      post: async () => ({}),
      onPosted: id => reloaded.push(id),
    });

    await ReactTestRenderer.act(async () => {
      hook.get().ask(READY);
    });
    await ReactTestRenderer.act(async () => {
      await hook.get().confirm();
    });

    expect(reloaded).toEqual([READY.id]);
    hook.unmount();
  });

  it('lỗi được giữ lại để hiện, KHÔNG đánh dấu là đã Post', async () => {
    const hook = renderHook({
      post: async () => {
        throw new Error('máy chủ từ chối');
      },
    });

    await ReactTestRenderer.act(async () => {
      hook.get().ask(READY);
    });
    await ReactTestRenderer.act(async () => {
      await hook.get().confirm();
    });

    expect(hook.get().error?.message).toContain('máy chủ từ chối');
    expect(hook.get().posted).toEqual([]);
    hook.unmount();
  });
});

describe('🔒 khoá idempotency ổn định theo phiếu', () => {
  it('cùng phiếu ⇒ cùng khoá, mãi mãi', () => {
    // Người dùng chốt 2026-09-05: "Khi retry phải dùng lại đúng Idempotency-Key
    // cũ." Khoá suy thẳng từ mã phiếu nên đúng cả sau khi khởi động lại app.
    const a = postReceiptIdempotencyKey(READY.id);
    const b = postReceiptIdempotencyKey(READY.id);
    expect(a).toBe(b);
    expect(a.startsWith(POST_RECEIPT_KEY_PREFIX)).toBe(true);
  });

  it('phiếu khác ⇒ khoá khác', () => {
    expect(postReceiptIdempotencyKey('a')).not.toBe(
      postReceiptIdempotencyKey('b'),
    );
  });

  it('không vượt 100 ký tự dù mã phiếu dài bất thường', () => {
    expect(postReceiptIdempotencyKey('x'.repeat(500)).length).toBe(100);
  });

  it('bấm lại sau khi lỗi vẫn dùng ĐÚNG khoá cũ', async () => {
    const keys: string[] = [];
    const hook = renderHook({
      post: async (_input, key) => {
        keys.push(key);
        throw new Error('lỗi mạng');
      },
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await ReactTestRenderer.act(async () => {
        hook.get().ask(READY);
      });
      await ReactTestRenderer.act(async () => {
        await hook.get().confirm();
      });
    }

    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
    hook.unmount();
  });
});

// ---------------------------------------------------------------------------
// 4. Màn hình
// ---------------------------------------------------------------------------

describe('màn Duyệt phiếu', () => {
  async function render(documents: readonly InboundDocument[]) {
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <ApprovalsScreen
            fetchInbound={async () => ({ items: documents })}
            fetchOutbound={async () => ({ items: [] })}
          />
        </AppProviders>,
      );
    });
    return {
      text: JSON.stringify(tree?.toJSON()),
      unmount: async () => {
        await ReactTestRenderer.act(() => tree?.unmount());
      },
    };
  }

  it('phiếu sẵn sàng vào hàng đợi duyệt hàng loạt', async () => {
    const view = await render([READY]);
    expect(view.text).toContain('Đủ hàng');
    expect(view.text).toContain('Duyệt phiếu');
    await view.unmount();
  });

  it('phiếu chưa sẵn sàng được lọc vào nhóm cần xử lý', async () => {
    const view = await render([NOT_READY]);
    expect(view.text).toContain('Cần xử lý · 1');
    expect(view.text).toContain('Chưa có phiếu sẵn sàng');
    await view.unmount();
  });

  it('câu cảnh báo tồn kho vẫn nguyên văn', async () => {
    const view = await render([READY]);
    expect(view.text).toContain('Tồn kho cập nhật sau Post');
    await view.unmount();
  });
});
