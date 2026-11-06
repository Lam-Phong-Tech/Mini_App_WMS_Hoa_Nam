/// <reference lib="dom" />
import { bindingMatches } from '../features/notifications/delivery/pushPolicy';
import type {
  DeliveryBinding,
  InstallationIdentity,
  PushPayload,
} from '../features/notifications/delivery/types';
const DB = 'hn-notification-delivery-v1',
  STORE = 'delivery';
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(STORE);
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(Error('Notification storage unavailable'));
  });
}
async function transaction<T>(
  mutate: (s: IDBObjectStore, result: (v: T) => void) => void,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    let value: T;
    tx.oncomplete = () => {
      db.close();
      resolve(value);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(Error('Notification storage failed'));
    };
    try {
      mutate(tx.objectStore(STORE), v => (value = v));
    } catch {
      tx.abort();
    }
  });
}
export async function readPushBinding(): Promise<DeliveryBinding | null> {
  return transaction((s, r) => {
    const q = s.get('binding');
    q.onsuccess = () => r(q.result ?? null);
  });
}
export async function storePushBinding(b: DeliveryBinding): Promise<void> {
  return transaction((s, r) => {
    const q = s.get('binding');
    q.onsuccess = () => {
      const old = q.result as DeliveryBinding | undefined;
      const fence = s.get('cleared-version');
      fence.onsuccess = () => {
        if (
          b.bindingVersion > (fence.result ?? 0) &&
          (!old ||
            old.bindingVersion < b.bindingVersion ||
            bindingMatches(old, b))
        )
          s.put(
            {
              registrationId: b.registrationId,
              bindingVersion: b.bindingVersion,
            },
            'binding',
          );
        r(undefined);
      };
    };
  });
}
export async function clearPushBinding(
  expected: DeliveryBinding,
): Promise<boolean> {
  return transaction((s, r) => {
    const q = s.get('binding');
    q.onsuccess = () => {
      const matches = bindingMatches(q.result ?? null, expected);
      if (matches) {
        s.delete('binding');
        s.put(expected.bindingVersion, 'cleared-version');
      }
      r(matches);
    };
  });
}
export async function installationIdentity(): Promise<InstallationIdentity> {
  return transaction((s, r) => {
    const q = s.get('identity');
    q.onsuccess = () => {
      if (q.result) {
        r(q.result);
        return;
      }
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const proof = btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      const i = { installationId: crypto.randomUUID(), proof };
      s.add(i, 'identity');
      r(i);
    };
  });
}
/** One transaction arbitrates foreground/worker/multiple tabs. No auth token. */
export async function claimPush(p: PushPayload): Promise<boolean> {
  return transaction((s, r) => {
    const q = s.get('binding');
    q.onsuccess = () => {
      if (
        !bindingMatches(q.result ?? null, p) ||
        Date.parse(p.expiresAt) <= Date.now()
      ) {
        r(false);
        return;
      }
      const key = 'seen:' + p.deliveryId;
      const seen = s.get(key);
      seen.onsuccess = () => {
        if (seen.result) {
          r(false);
          return;
        }
        s.put(p.expiresAt, key);
        const cursor = s.openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (c) {
            if (
              String(c.key).startsWith('seen:') &&
              Date.parse(String(c.value)) <= Date.now()
            )
              c.delete();
            c.continue();
          }
        };
        r(true);
      };
    };
  });
}
export async function storePushClick(data: unknown): Promise<void> {
  return transaction((s, r) => {
    s.put(data, 'click');
    r(undefined);
  });
}
export async function consumePushClick(): Promise<unknown> {
  return transaction((s, r) => {
    const q = s.get('click');
    q.onsuccess = () => {
      s.delete('click');
      r(q.result);
    };
  });
}
export async function readPushTestIntent(): Promise<{
  requestKey: string;
  binding: DeliveryBinding;
} | null> {
  return transaction((s, r) => {
    const q = s.get('test-intent');
    q.onsuccess = () => r(q.result ?? null);
  });
}
export async function storePushTestIntent(value: {
  requestKey: string;
  binding: DeliveryBinding;
}): Promise<void> {
  return transaction((s, r) => {
    s.put(value, 'test-intent');
    r(undefined);
  });
}
