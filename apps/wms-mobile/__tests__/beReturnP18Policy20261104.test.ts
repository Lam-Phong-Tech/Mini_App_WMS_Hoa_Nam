import { parseComponentLocation } from '../src/services/wms/p18ComponentLocation';
import {
  locationBody,
  locationScope,
  target,
} from './fixtures/p18ComponentLocation20261103';
test('optional r2 master INACTIVE is readable but cannot confer placement/write/issue authority', () => {
  const b = locationBody('BOX', 'REDACTED_PERMISSION') as any;
  Object.assign(b.meta, { policy_revision: 'p18-component-location-read-r2' });
  Object.assign(b.data, {
    sku_status: 'INACTIVE',
    sku_status_availability: 'CURRENT_DIRECTORY',
    master_read_policy: 'INACTIVE_READ_ALLOWED_NOT_ISSUE_ELIGIBILITY',
  });
  const d = parseComponentLocation(b, locationScope(), target);
  expect(d.skuStatus).toEqual({ supplied: true, value: 'INACTIVE' });
  expect(d.location.supplied).toBe(false);
  expect(d).not.toHaveProperty('eligible_for_issue');
});
test('r1 without master-status extension stays compatible and malformed advertised r2 fails', () => {
  const b = locationBody() as any;
  expect(
    parseComponentLocation(b, locationScope(), target).skuStatus,
  ).toBeUndefined();
  b.meta.policy_revision = 'p18-component-location-read-r2';
  b.data.master_read_policy = 'ALLOW_ISSUE';
  expect(() => parseComponentLocation(b, locationScope(), target)).toThrow();
});
