import { p19EligibilityDiagnostic } from '../src/features/warranty/p19/core/eligibility-diagnostic';
const reason = (patch: Record<string, unknown> = {}) => ({
  eligibility_reason_contract: 'p19-eligibility-reasons-v1',
  eligibility_reason_code: 'COMPONENT_SKU_INACTIVE',
  eligibility_reason_message: 'Linh kiện đã ngừng hoạt động.',
  sku_status: 'INACTIVE',
  eligible_for_issue: false,
  eligible_for_component_issue: false,
  case_allows_issue: true,
  ...patch,
});
test('guard-narrowed legacy code retains precise Vietnamese master diagnostic', () =>
  expect(
    p19EligibilityDiagnostic(
      reason({ eligibility_code: 'COMPONENT_NOT_ELIGIBLE' }),
    ),
  ).toEqual({
    code: 'COMPONENT_SKU_INACTIVE',
    message: 'Linh kiện đã ngừng hoạt động.',
    skuStatus: 'INACTIVE',
  }));
test('null reason does not authorize a denied case; absent legacy diagnostics are optional', () => {
  expect(
    p19EligibilityDiagnostic(
      reason({
        eligibility_reason_code: null,
        eligibility_reason_message: null,
        sku_status: 'ACTIVE',
        eligible_for_issue: true,
        eligible_for_component_issue: true,
        case_allows_issue: false,
      }),
    ),
  ).toBeNull();
  expect(
    p19EligibilityDiagnostic({ eligible_for_issue: false }),
  ).toBeUndefined();
});
test.each([
  { eligible_for_issue: true },
  { sku_status: 'ACTIVE' },
  { eligibility_reason_code: 'COMPONENT_SKU_NOT_FOUND', sku_status: 'ACTIVE' },
  { eligibility_reason_contract: 'wrong' },
  { eligibility_reason_message: null },
  { sku_status: 123 },
])('malformed diagnostic cannot broaden final eligibility: %j', patch =>
  expect(() => p19EligibilityDiagnostic(reason(patch))).toThrow(),
);
