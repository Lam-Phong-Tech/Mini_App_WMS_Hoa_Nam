/**
 * Smoke test: cây provider + navigator dựng được và render màn đầu tiên.
 *
 * 🔧 **Cập nhật 2026-09-06 (Prompt 4 đợt 1).** Trước đây app khởi động vào màn
 * *Chẩn đoán nền móng* vì chưa có màn nghiệp vụ nào. Nay route gốc là `Shell`,
 * và khi **chưa có phiên** thì `Shell` hiện màn **Đăng nhập** — đúng hành vi
 * mong đợi của app thật.
 *
 * Màn Chẩn đoán vẫn còn trong navigator (hữu ích khi hỗ trợ từ xa), chỉ không
 * còn là màn đầu tiên.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../src/app/App';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import {
  resetTierCheckForTesting,
  setTierCheckForTesting,
} from '../src/services/wms/tierCheck';

beforeEach(() => {
  // Storage trống ⇒ chưa có phiên ⇒ phải ra màn Đăng nhập.
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  // Smoke test chỉ kiểm tra cây UI. Không được phát sinh HTTP thật khi AppShell
  // làm preflight tier, vì kết nối nền làm Jest treo sau khi assertion đã xong.
  setTierCheckForTesting({
    status: 'matched',
    expected: 'dev-test',
    reported: 'dev-test',
  });
});

afterEach(() => {
  resetTierCheckForTesting();
});

test('chưa đăng nhập thì App dựng được và render màn Đăng nhập', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<App />);
  });

  const rendered = JSON.stringify(tree?.toJSON());
  expect(rendered).toContain('WMS HOA NAM');
  expect(rendered).toContain('Sử dụng tài khoản được cấp để tiếp tục.');
  // Không được lọt vào khung nghiệp vụ khi chưa đăng nhập.
  expect(rendered).not.toContain('Ca làm việc hiện tại');

  await ReactTestRenderer.act(() => {
    tree?.unmount();
  });
});
