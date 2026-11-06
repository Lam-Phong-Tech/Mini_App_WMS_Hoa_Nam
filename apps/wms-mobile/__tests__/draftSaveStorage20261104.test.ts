import { draftSaveStorage } from '../src/shift/draftSaveStorage';
import { createMemoryBackend, createStorage } from '../src/storage/storage';
test('another writer between async read and SAVE is preserved instead of overwritten', () => {
  const store = createStorage(createMemoryBackend());
  store.setObject('draft', { version: 1, note: 'original' });
  const lease = draftSaveStorage(store, ['draft']);
  expect(lease.getObject('draft')).toEqual({ version: 1, note: 'original' });
  store.setObject('draft', { version: 1, note: 'new user edit' });
  expect(() =>
    lease.setObject('draft', { version: 2, note: 'old snapshot' }),
  ).toThrow('màn khác');
  expect(store.getObject('draft')).toEqual({
    version: 1,
    note: 'new user edit',
  });
});
test('only its own verified writes advance the lease, unknown keys/deletion fail closed', () => {
  const store = createStorage(createMemoryBackend());
  store.setString('draft', '1');
  const lease = draftSaveStorage(store, ['draft']);
  lease.setString('draft', '2');
  lease.setString('draft', '3');
  expect(store.getString('draft')).toBe('3');
  expect(() => lease.setString('other', 'new')).toThrow();
  expect(() => lease.remove('draft')).toThrow();
  expect(store.getString('draft')).toBe('3');
});
