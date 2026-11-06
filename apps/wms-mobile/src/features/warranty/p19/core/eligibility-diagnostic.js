/** Owner diagnostic only; the existing eligibility/case/quantity checks still decide. */
export function p19EligibilityDiagnostic(d) {
  if (!Object.hasOwn(d, 'eligibility_reason_contract')) return undefined;
  const invalid = () => {
    throw Error('P19_ELIGIBILITY_DIAGNOSTIC_INVALID');
  };
  if (
    d.eligibility_reason_contract !== 'p19-eligibility-reasons-v1' ||
    !(
      d.sku_status === null ||
      (typeof d.sku_status === 'string' &&
        /^[A-Z][A-Z0-9_]*$/.test(d.sku_status))
    )
  )
    invalid();
  const code = d.eligibility_reason_code,
    message = d.eligibility_reason_message;
  if (code === null) {
    if (message !== null) invalid();
    return null;
  }
  if (
    typeof code !== 'string' ||
    !code ||
    !/^[A-Z][A-Z0-9_]*$/.test(code) ||
    typeof message !== 'string' ||
    !message.trim() ||
    message.length > 1000
  )
    invalid();
  const master = [
    'COMPONENT_SKU_NOT_FOUND',
    'COMPONENT_SKU_NOT_COMPONENT',
    'COMPONENT_SKU_INACTIVE',
  ].includes(code);
  if (
    master &&
    (d.eligible_for_issue !== false ||
      (Object.hasOwn(d, 'eligible_for_component_issue') &&
        d.eligible_for_component_issue !== false))
  )
    invalid();
  if (code === 'COMPONENT_SKU_NOT_FOUND' && d.sku_status !== null) invalid();
  if (code === 'COMPONENT_SKU_INACTIVE' && d.sku_status === 'ACTIVE') invalid();
  if (code === 'COMPONENT_SKU_NOT_COMPONENT' && d.sku_type === 'COMPONENT')
    invalid();
  if (
    code === 'COMPONENT_SKU_INACTIVE' &&
    d.sku_type !== undefined &&
    d.sku_type !== 'COMPONENT'
  )
    invalid();
  if (
    d.eligible_for_issue === true &&
    d.case_allows_issue === true &&
    d.eligible_for_component_issue !== false
  )
    invalid();
  return { code, message, skuStatus: d.sku_status };
}
