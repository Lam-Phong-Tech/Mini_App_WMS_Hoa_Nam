/**
 * Zalo Device mode injects Vite modules into an already-created H5 document,
 * so Vite cannot add its usual React Refresh preamble to that document.
 * Define the two preamble hooks before React modules are evaluated. They are
 * replaced by the real runtime when it is available; the no-op fallback keeps
 * a native test session from remaining on the Device loader.
 */
const deviceWindow = window as typeof window & {
  $RefreshReg$?: (type: unknown, id: string) => void;
  $RefreshSig$?: () => <T>(type: T) => T;
};

deviceWindow.$RefreshReg$ ??= () => undefined;
deviceWindow.$RefreshSig$ ??= () => (type) => type;
