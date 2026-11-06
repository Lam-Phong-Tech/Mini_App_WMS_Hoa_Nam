import {
  P07_RELEASE,
  assertP07Connected,
  P07_SOURCE_COMMIT,
} from '../src/config/p07Release';
describe('P07 user-authorized DEV connection only', () => {
  it('enables P07 DEV for the deployed source approved by the user', () => {
    expect(P07_SOURCE_COMMIT).toBe('416c59b5fbde719bda071e40b3b63cdd8fdaccde');
    expect(P07_RELEASE.productionEnabled).toBe(true);
    expect(() => assertP07Connected()).not.toThrow();
  });
  it('customer build stays blocked before HTTP/hardware despite DEV approval', () => {
    jest.isolateModules(() => {
      jest.doMock('../src/config/buildProfile', () => ({
        BUILD_PROFILE: 'customer-production',
      }));
      const gate = require('../src/config/p07Release');
      expect(gate.P07_RELEASE.productionEnabled).toBe(false);
      expect(() => gate.assertP07Connected()).toThrow(
        expect.objectContaining({ code: 'P07_PENDING_RELEASE' }),
      );
    });
    jest.dontMock('../src/config/buildProfile');
  });
});
