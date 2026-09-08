/**
 * Duyệt phiếu xuất hàng loạt — `GATE_WMS §2h`.
 *
 * Mỗi lần Post là một lệnh **giảm tồn kho**, nên bộ test này canh bốn tính chất
 * theo thứ tự nguy hiểm giảm dần:
 *
 * 1. Không Post khi máy chủ chưa nói phiếu sẵn sàng.
 * 2. Không Post trước khi người dùng xác nhận.
 * 3. Đọc lại `version` **trước mỗi** lần Post, và chạy **tuần tự**.
 * 4. Kết quả một phần được giữ đúng: phiếu xong là xong, phiếu lỗi ở lại.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { ApprovalsScreen } from '../src/features/approvals/ApprovalsScreen';
import {
  POST_ISSUE_KEY_PREFIX,
  canPostIssue,
  issueBlockedReason,
  postIssueIdempotencyKey,
  summariseOutcomes,
  usePostIssue,
} from '../src/features/approvals/usePostIssue';
import { resetTierCheckForTesting } from '../src/services/wms/tierCheck';
import type { OutboundDocument } from '../src/services/wms/types';

const READY: OutboundDocument = {
  id: 'doc-ready-1',
  doc_no: 'PX-COV-001',
  version: 3,
  ready_for_issue: true,
  expected_total_qty: 5,
  scanned_total_qty: 5,
};

const READY_2: OutboundDocument = {
  ...READY,
  id: 'doc-ready-2',
  doc_no: 'PX-COV-002',
  version: 9,
};

const NOT_READY: OutboundDocument = {
  ...READY,
  id: 'doc-pending',
  ready_for_issue: false,
  scanned_total_qty: 2,
};

afterEach(() => {
  resetTierCheckForTesting();
});

// ---------------------------------------------------------------------------

describe('🔒 chỉ Post khi MÁY CHỦ nói phiếu sẵn sàng', () => {
  it('ready_for_issue = true thì cho', () => {
    expect(canPostIssue(READY)).toBe(true);
    expect(issueBlockedReason(READY)).toBeUndefined();
  });

  it('thiếu hẳn trường ready_for_issue thì KHÔNG cho', () => {
    // Điều kiện đủ để xuất còn phụ thuộc những thứ client không thấy: giữ chỗ
    // tồn, quyền, trạng thái từng item.
    const withoutFlag: OutboundDocument = { ...READY };
    delete (withoutFlag as { ready_for_issue?: boolean }).ready_for_issue;
    expect(canPostIssue(withoutFlag)).toBe(false);
    expect(issueBlockedReason(withoutFlag)).toBeDefined();
  });

  it('lý do nêu ĐÚNG số mã còn thiếu', () => {
    expect(issueBlockedReason(NOT_READY)).toContain('3 mã');
  });

  it('quét đủ nhưng WMS chưa duyệt thì nói đúng lý do đó', () => {
    expect(
      issueBlockedReason({ ...READY, ready_for_issue: false }),
    ).toContain('WMS chưa đánh dấu');
  });
});

// ---------------------------------------------------------------------------

function renderHook(deps: Parameters<typeof usePostIssue>[0]) {
  const captured: { current?: ReturnType<typeof usePostIssue> } = {};
  function Probe(): null {
    captured.current = usePostIssue(deps);
    return null;
  }
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<Probe />);
  });
  return {
    get: () => captured.current as ReturnType<typeof usePostIssue>,
    unmount: () => {
      ReactTestRenderer.act(() => tree?.unmount());
    },
  };
}

/** Bộ đôi đọc + post mặc định thành công, ghi lại thứ tự gọi. */
function spyDeps(failFor: readonly string[] = []) {
  const calls: string[] = [];
  const versions: (string | number)[] = [];
  const keys: string[] = [];
  return {
    calls,
    versions,
    keys,
    deps: {
      fetchDocument: async (id: string) => {
        calls.push('read:' + id);
        return { ...READY, id, version: id === READY_2.id ? 9 : 3 };
      },
      post: async (
        input: { documentId: string; version: string | number },
        key: string,
      ) => {
        calls.push('post:' + input.documentId);
        versions.push(input.version);
        keys.push(key);
        if (failFor.includes(input.documentId)) {
          throw new Error('WMS từ chối ' + input.documentId);
        }
        return { doc_no: 'PX-' + input.documentId };
      },
    },
  };
}

describe('🔒 không Post trước khi người dùng xác nhận', () => {
  it('chọn phiếu KHÔNG gửi gì', async () => {
    const spy = spyDeps();
    const hook = renderHook(spy.deps);
    await ReactTestRenderer.act(async () => {
      hook.get().toggle(READY.id);
    });
    expect(hook.get().selected).toEqual([READY.id]);
    expect(spy.calls).toEqual([]);
    hook.unmount();
  });

  it('ask() chỉ mở hộp xác nhận', async () => {
    const spy = spyDeps();
    const hook = renderHook(spy.deps);
    await ReactTestRenderer.act(async () => {
      hook.get().toggle(READY.id);
    });
    await ReactTestRenderer.act(async () => {
      hook.get().ask();
    });
    expect(hook.get().confirming).toBe(true);
    expect(spy.calls).toEqual([]);
    hook.unmount();
  });

  it('không chọn gì thì ask() không mở hộp', async () => {
    const hook = renderHook(spyDeps().deps);
    await ReactTestRenderer.act(async () => {
      hook.get().ask();
    });
    expect(hook.get().confirming).toBe(false);
    hook.unmount();
  });

  it('confirm() khi chưa chọn gì thì không gửi gì', async () => {
    const spy = spyDeps();
    const hook = renderHook(spy.deps);
    await ReactTestRenderer.act(async () => {
      await hook.get().confirm();
    });
    expect(spy.calls).toEqual([]);
    hook.unmount();
  });

  it('"chọn tất cả" chỉ lấy phiếu SẴN SÀNG', async () => {
    const hook = renderHook(spyDeps().deps);
    await ReactTestRenderer.act(async () => {
      hook.get().selectAllReady([READY, NOT_READY, READY_2]);
    });
    expect(hook.get().selected).toEqual([READY.id, READY_2.id]);
    hook.unmount();
  });

  it('bấm "chọn tất cả" lần hai thì bỏ chọn hết', async () => {
    const hook = renderHook(spyDeps().deps);
    await ReactTestRenderer.act(async () => {
      hook.get().selectAllReady([READY, READY_2]);
    });
    await ReactTestRenderer.act(async () => {
      hook.get().selectAllReady([READY, READY_2]);
    });
    expect(hook.get().selected).toEqual([]);
    hook.unmount();
  });
});

// ---------------------------------------------------------------------------

describe('🔒 đọc lại version trước MỖI lần Post, chạy TUẦN TỰ', () => {
  async function runBatch(spy: ReturnType<typeof spyDeps>) {
    const hook = renderHook(spy.deps);
    await ReactTestRenderer.act(async () => {
      hook.get().selectAllReady([READY, READY_2]);
    });
    await ReactTestRenderer.act(async () => {
      hook.get().ask();
    });
    await ReactTestRenderer.act(async () => {
      await hook.get().confirm();
    });
    return hook;
  }

  it('mỗi phiếu: đọc rồi mới post, xen kẽ đúng thứ tự', async () => {
    // Song song thì khi hỏng giữa chừng không ai nói được cái nào đã đi.
    const spy = spyDeps();
    const hook = await runBatch(spy);
    expect(spy.calls).toEqual([
      'read:doc-ready-1',
      'post:doc-ready-1',
      'read:doc-ready-2',
      'post:doc-ready-2',
    ]);
    hook.unmount();
  });

  it('dùng version VỪA ĐỌC, không phải version trong danh sách', async () => {
    // Danh sách là ảnh chụp lúc tải; giữa lúc đó và lúc bấm có thể ai đó đã sửa
    // phiếu. Gửi version cũ thì ăn 412, hoặc tệ hơn là ghi đè mất thay đổi.
    const spy = spyDeps();
    const hook = await runBatch(spy);
    expect(spy.versions).toEqual([3, 9]);
    hook.unmount();
  });

  it('🔒 khoá idempotency suy từ mã phiếu, ổn định qua mọi lần thử lại', async () => {
    const spy = spyDeps();
    const hook = await runBatch(spy);
    expect(spy.keys).toEqual([
      postIssueIdempotencyKey(READY.id),
      postIssueIdempotencyKey(READY_2.id),
    ]);
    expect(spy.keys[0]?.startsWith(POST_ISSUE_KEY_PREFIX)).toBe(true);
    hook.unmount();
  });
});

describe('khoá idempotency', () => {
  it('cùng phiếu ⇒ cùng khoá', () => {
    expect(postIssueIdempotencyKey('a')).toBe(postIssueIdempotencyKey('a'));
  });

  it('phiếu khác ⇒ khoá khác', () => {
    expect(postIssueIdempotencyKey('a')).not.toBe(postIssueIdempotencyKey('b'));
  });

  it('không vượt 100 ký tự', () => {
    expect(postIssueIdempotencyKey('x'.repeat(500)).length).toBe(100);
  });
});

// ---------------------------------------------------------------------------

describe('🔒 kết quả một phần', () => {
  it('phiếu lỗi KHÔNG dừng cả mẻ — phiếu sau vẫn chạy', async () => {
    const spy = spyDeps([READY.id]);
    const hook = renderHook(spy.deps);
    await ReactTestRenderer.act(async () => {
      hook.get().selectAllReady([READY, READY_2]);
    });
    await ReactTestRenderer.act(async () => {
      await hook.get().confirm();
    });

    expect(spy.calls).toContain('post:doc-ready-2');
    expect(hook.get().outcomes).toHaveLength(2);
    expect(hook.get().outcomes[0]?.ok).toBe(false);
    expect(hook.get().outcomes[1]?.ok).toBe(true);
    hook.unmount();
  });

  it('giữ lại ĐÚNG phiếu lỗi trong ô chọn, bỏ phiếu đã xong', async () => {
    // Bấm duyệt lần nữa phải thử lại đúng phiếu lỗi, không đụng phiếu đã xuất.
    const spy = spyDeps([READY_2.id]);
    const hook = renderHook(spy.deps);
    await ReactTestRenderer.act(async () => {
      hook.get().selectAllReady([READY, READY_2]);
    });
    await ReactTestRenderer.act(async () => {
      await hook.get().confirm();
    });
    expect(hook.get().selected).toEqual([READY_2.id]);
    hook.unmount();
  });

  it('lý do lỗi giữ nguyên văn máy chủ trả về', async () => {
    const spy = spyDeps([READY.id]);
    const hook = renderHook(spy.deps);
    await ReactTestRenderer.act(async () => {
      hook.get().toggle(READY.id);
    });
    await ReactTestRenderer.act(async () => {
      await hook.get().confirm();
    });
    expect(hook.get().outcomes[0]?.reason).toContain('WMS từ chối');
    hook.unmount();
  });

  it('gọi onFinished một lần với đủ kết quả', async () => {
    let received: readonly { ok: boolean }[] = [];
    const spy = spyDeps([READY.id]);
    const hook = renderHook({
      ...spy.deps,
      onFinished: outcomes => {
        received = outcomes;
      },
    });
    await ReactTestRenderer.act(async () => {
      hook.get().selectAllReady([READY, READY_2]);
    });
    await ReactTestRenderer.act(async () => {
      await hook.get().confirm();
    });
    expect(received).toHaveLength(2);
    hook.unmount();
  });

  it('câu tóm tắt nói RÕ cả hai con số, không gộp thành "có lỗi"', () => {
    // "8 xong, 2 lỗi" khác hẳn "có lỗi xảy ra" — tồn kho của 8 phiếu kia đã
    // giảm thật rồi.
    const mixed = [
      { documentId: 'a', ok: true },
      { documentId: 'b', ok: false },
    ];
    expect(summariseOutcomes(mixed)).toContain('1 phiếu');
    expect(summariseOutcomes(mixed)).toContain('1 phiếu lỗi');

    expect(summariseOutcomes([{ documentId: 'a', ok: true }])).toContain(
      'Đã xuất kho 1 phiếu',
    );
    expect(summariseOutcomes([{ documentId: 'a', ok: false }])).toContain(
      'Không phiếu nào',
    );
  });
});

// ---------------------------------------------------------------------------

describe('màn Duyệt phiếu — tab phiếu xuất', () => {
  async function render(documents: readonly OutboundDocument[]) {
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <ApprovalsScreen
            fetchInbound={async () => ({ items: [] })}
            fetchOutbound={async () => ({ items: documents })}
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

  it('KHÔNG còn câu "Post Issue chưa được đấu nối"', async () => {
    const view = await render([]);
    expect(view.text).not.toContain('chưa được đấu nối');
    await view.unmount();
  });

  it('câu cảnh báo tồn kho vẫn nguyên văn', async () => {
    const view = await render([]);
    expect(view.text).toContain('Tồn kho cập nhật sau Post');
    await view.unmount();
  });
});
