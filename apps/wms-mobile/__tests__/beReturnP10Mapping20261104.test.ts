import {
  p10TechnicalMapping,
  p10LegacyPermissionDescription,
} from '../src/features/profile/p10TechnicalMapping';
test('six technical groups/50 source mappings do not become per-user authorization or BA approval', () => {
  const m = p10TechnicalMapping();
  expect(m.groups).toHaveLength(6);
  expect(m.actionCount).toBe(50);
  expect(m.authorizationSnapshot).toBe(false);
  expect(m.baApproval).toBe('BA_MAPPING_REQUIRED');
  expect(m.groups.map(g => g.key)).toEqual([
    'inbound',
    'outbound',
    'warranty',
    'nfc',
    'documents',
    'catalog',
  ]);
  expect(m).not.toHaveProperty('authorized');
  expect(m).not.toHaveProperty('canExecute');
});
test('unread, loaded empty and legacy SUPER_ADMIN-expanded keys never claim actual scoped grants', () => {
  expect(p10LegacyPermissionDescription(undefined)).toContain('Chưa nhận');
  expect(p10LegacyPermissionDescription([])).toContain('0 mã quyền');
  expect(p10LegacyPermissionDescription(['outbound.scan'])).toContain(
    '1 mã quyền',
  );
  expect(p10LegacyPermissionDescription(['outbound.scan'])).not.toContain(
    'đã được cấp',
  );
});
