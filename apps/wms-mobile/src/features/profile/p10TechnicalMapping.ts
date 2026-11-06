import source from '../../../assets/contracts/p10-feature-permissions-v1.json';
/** A static source reference, deliberately without any per-user permission evaluator. */
export function p10TechnicalMapping() {
  if (
    source.contract !== 'p10-feature-permissions-v1' ||
    source.revision !== 'p10-feature-permissions-r1' ||
    source.status !== 'TECHNICAL_SOURCE_MAPPING' ||
    source.ba_approval !== 'BA_MAPPING_REQUIRED' ||
    source.authorization_snapshot !== false ||
    source.role_name_inference !== false
  )
    throw Error('P10_TECHNICAL_MAPPING_INVALID');
  const groups = Object.entries(source.groups).map(([key, group]) => ({
    key,
    label: group.label,
    actionCount: Object.keys(group.actions).length,
  }));
  return {
    contract: source.contract,
    revision: source.revision,
    baApproval: source.ba_approval,
    authorizationSnapshot: false as const,
    groups,
    actionCount: groups.reduce((n, g) => n + g.actionCount, 0),
  };
}
export function p10LegacyPermissionDescription(
  permissions: readonly string[] | undefined,
) {
  return permissions === undefined
    ? 'Chưa nhận được danh sách quyền chi tiết.'
    : `WMS cung cấp ${permissions.length} mã quyền chi tiết; quyền theo nhóm chờ xác nhận.`;
}
export function p10TechnicalMappingNote() {
  const m = p10TechnicalMapping();
  return `Đã có mô tả kỹ thuật ${m.groups.length} nhóm và ${m.actionCount} thao tác. Mapping nghiệp vụ chờ BA duyệt. Danh sách quyền hiện tại chưa xác nhận quyền hiệu lực cho từng nghiệp vụ; hệ thống kiểm tra lại khi thao tác.`;
}
