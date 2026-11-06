// Stores scoped business drafts only. ACCESS/password never enters this object.
export function createP05Journal(
  storage,
  scope,
  origin,
  namespace = 'hn-p05-linked-v1:',
) {
  const key =
    namespace +
    JSON.stringify([
      origin,
      scope.actorId,
      scope.authSessionId,
      scope.warehouseId,
    ]);
  const forbidden = new Set([
    'password',
    'token',
    'accessToken',
    'authorization',
    'Authorization',
  ]);
  function safe(value) {
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (
          forbidden.has(k) ||
          /^(access_?token|refresh_?token|password|authorization)$/i.test(k)
        )
          throw Error('Credential không được lưu trong draft.');
        safe(v);
      }
    }
  }
  return {
    read() {
      const text = storage.getItem(key);
      if (!text) return null;
      const data = JSON.parse(text);
      safe(data);
      if (JSON.stringify(data.scope) !== JSON.stringify(scope))
        throw Error('Journal scope mismatch');
      return data.state;
    },
    write(state) {
      safe(state);
      storage.setItem(key, JSON.stringify({ scope, state }));
    },
    remove() {
      storage.removeItem(key);
    },
  };
}
