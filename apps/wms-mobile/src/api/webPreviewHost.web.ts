/** GitHub Pages serves static files only; it cannot run the fixed DEV proxy. */
export function webPreviewHostProblem(): string | undefined {
  const browser = globalThis as unknown as {
    location?: { origin?: string; href?: string };
    window?: { location?: { origin?: string; href?: string } };
  };
  const current = browser.location ?? browser.window?.location;
  let hostname: string;
  try {
    hostname = new URL(current?.origin ?? current?.href ?? '').hostname;
  } catch {
    return undefined;
  }
  if (hostname === 'github.io' || hostname.endsWith('.github.io')) {
    return (
      'GitHub Pages chỉ chứa giao diện, không có proxy /wms-api. ' +
      'Không nhập mật khẩu ở link này. Hãy dùng preview local đang chạy ' +
      'hoặc bản preview cùng origin backend DEV đã được triển khai.'
    );
  }
  return undefined;
}
