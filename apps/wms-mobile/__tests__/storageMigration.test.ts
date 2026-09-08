/**
 * Kiểm chứng §C của Prompt 3: schema version, migration, repository.
 */

import {
  createMemoryBackend,
  createStorage,
  type KeyValueStorage,
} from '../src/storage/storage';
import {
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  SCHEMA_VERSION_KEY,
  readSchemaVersion,
  runMigrations,
  type Migration,
} from '../src/storage/schema';
import { createRepository } from '../src/storage/repository';
import { createLogger } from '../src/logging/logger';

function freshStorage(seed: Record<string, string> = {}): KeyValueStorage {
  return createStorage(createMemoryBackend(seed));
}

/** Logger im lặng để test không đổ rác ra console. */
function silentLogger() {
  const lines: Array<{ level: string; message: string }> = [];
  const log = createLogger({
    minLevel: 'debug',
    sink: (level, message) => lines.push({ level, message }),
  });
  return { log, lines };
}

describe('schema version', () => {
  it('máy mới bắt đầu từ version 0', () => {
    expect(readSchemaVersion(freshStorage())).toBe(0);
  });

  it('giá trị hỏng bị coi như chưa có mốc', () => {
    expect(readSchemaVersion(freshStorage({ [SCHEMA_VERSION_KEY]: 'abc' }))).toBe(0);
    expect(readSchemaVersion(freshStorage({ [SCHEMA_VERSION_KEY]: '-3' }))).toBe(0);
  });

  it('nâng máy mới lên đúng version hiện tại', () => {
    const storage = freshStorage();
    const outcome = runMigrations(storage);

    expect(outcome.from).toBe(0);
    expect(outcome.to).toBe(CURRENT_SCHEMA_VERSION);
    expect(outcome.applied).toBe(MIGRATIONS.length);
    expect(readSchemaVersion(storage)).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('chạy lần hai không làm gì thêm', () => {
    const storage = freshStorage();
    runMigrations(storage);
    const second = runMigrations(storage);

    expect(second.applied).toBe(0);
    expect(second.to).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('giữ nguyên dữ liệu Prompt 2 khi migrate', () => {
    const storage = freshStorage({ 'config.environment': 'wms_dev_unverified' });
    runMigrations(storage);

    expect(storage.getString('config.environment')).toBe('wms_dev_unverified');
  });

  it('chạy migration theo đúng thứ tự tăng dần', () => {
    const order: number[] = [];
    const migrations: Migration[] = [
      { to: 3, description: 'ba', run: () => order.push(3) },
      { to: 1, description: 'một', run: () => order.push(1) },
      { to: 2, description: 'hai', run: () => order.push(2) },
    ];

    const storage = freshStorage();
    runMigrations(storage, migrations);

    expect(order).toEqual([1, 2, 3]);
    expect(readSchemaVersion(storage)).toBe(3);
  });

  it('dừng tại migration lỗi và KHÔNG nâng version qua nó', () => {
    const migrations: Migration[] = [
      { to: 1, description: 'ok', run: () => undefined },
      {
        to: 2,
        description: 'hỏng',
        run: () => {
          throw new Error('lỗi giả lập');
        },
      },
      { to: 3, description: 'không được chạy', run: () => undefined },
    ];

    const storage = freshStorage();
    const { log } = silentLogger();
    const outcome = runMigrations(storage, migrations, log);

    expect(outcome.applied).toBe(1);
    expect(outcome.failedAt).toBe(2);
    // Version dừng ở 1 để lần khởi động sau thử lại migration 2.
    expect(readSchemaVersion(storage)).toBe(1);
  });

  it('không đụng gì khi schema trên máy mới hơn bản app (hạ cấp app)', () => {
    const storage = freshStorage({ [SCHEMA_VERSION_KEY]: '99' });
    const { log } = silentLogger();
    const outcome = runMigrations(storage, MIGRATIONS, log);

    expect(outcome.applied).toBe(0);
    expect(readSchemaVersion(storage)).toBe(99);
  });
});

interface Item {
  id: string;
  name: string;
  qty: number;
}

describe('repository', () => {
  it('CRUD cơ bản', () => {
    const repo = createRepository<Item>(freshStorage(), 'items');

    expect(repo.get('a')).toBeUndefined();
    expect(repo.count()).toBe(0);

    repo.put({ id: 'a', name: 'Thùng', qty: 3 });
    expect(repo.get('a')).toEqual({ id: 'a', name: 'Thùng', qty: 3 });
    expect(repo.count()).toBe(1);

    repo.put({ id: 'b', name: 'Kệ', qty: 1 });
    expect(repo.list()).toHaveLength(2);

    repo.remove('a');
    expect(repo.get('a')).toBeUndefined();
    expect(repo.count()).toBe(1);
  });

  it('update đọc–sửa–ghi và trả về bản mới', () => {
    const repo = createRepository<Item>(freshStorage(), 'items');
    repo.put({ id: 'a', name: 'Thùng', qty: 3 });

    const next = repo.update('a', current => ({ ...current, qty: current.qty + 5 }));

    expect(next?.qty).toBe(8);
    expect(repo.get('a')?.qty).toBe(8);
  });

  it('update trên id không tồn tại trả về undefined, không tạo mới', () => {
    const repo = createRepository<Item>(freshStorage(), 'items');

    expect(repo.update('khong-co', c => c)).toBeUndefined();
    expect(repo.count()).toBe(0);
  });

  it('update không cho đổi id', () => {
    const repo = createRepository<Item>(freshStorage(), 'items');
    repo.put({ id: 'a', name: 'Thùng', qty: 1 });

    expect(() => repo.update('a', c => ({ ...c, id: 'b' }))).toThrow(/không được đổi id/);
  });

  it('hai collection không giẫm lên nhau', () => {
    const storage = freshStorage();
    const items = createRepository<Item>(storage, 'items');
    const others = createRepository<Item>(storage, 'others');

    items.put({ id: 'a', name: 'X', qty: 1 });
    others.put({ id: 'a', name: 'Y', qty: 2 });

    expect(items.get('a')?.name).toBe('X');
    expect(others.get('a')?.name).toBe('Y');
    expect(items.count()).toBe(1);

    items.clear();
    expect(items.count()).toBe(0);
    expect(others.count()).toBe(1);
  });

  it('từ chối id chứa dấu phân tách', () => {
    const repo = createRepository<Item>(freshStorage(), 'items');

    expect(() => repo.put({ id: 'a/b', name: 'X', qty: 1 })).toThrow(/không được chứa/);
    expect(() => repo.get('')).toThrow(/id rỗng/);
  });

  it('bỏ qua bản ghi hỏng JSON thay vì làm sập, và có ghi log', () => {
    const storage = freshStorage({ 'items/broken': '{khong-phai-json' });
    const { log, lines } = silentLogger();
    const repo = createRepository<Item>(storage, 'items', log);
    repo.put({ id: 'ok', name: 'Tốt', qty: 1 });

    expect(repo.list()).toEqual([{ id: 'ok', name: 'Tốt', qty: 1 }]);
    expect(lines.some(line => line.level === 'error')).toBe(true);
  });
});
