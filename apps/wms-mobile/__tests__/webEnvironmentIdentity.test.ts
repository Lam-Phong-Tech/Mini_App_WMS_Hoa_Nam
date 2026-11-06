import * as env from '../src/config/env';
import {p02DevReadEnabled} from '../src/config/p02Release';
import {p12DevEnabled} from '../src/config/p12Release';
import {wmsWebRequestUrl} from '../src/api/wmsFetch.web';

afterEach(()=>jest.restoreAllMocks());
test('Web and native retain the same logical DEV identity; only transport uses /wms-api',()=>{
  const origin=env.ENVIRONMENTS['dev-test'].apiBaseUrl;
  expect(origin).toBe(env.ENVIRONMENTS['dev-test'].apiBaseUrl);
  expect(origin).toBe('https://khohoanamdev.lptech.info.vn');
  const environment={...env.ENVIRONMENTS['dev-test'],apiBaseUrl:origin};
  jest.spyOn(env,'getCurrentEnvironment').mockReturnValue(environment);
  expect(p02DevReadEnabled()).toBe(true);
  expect(p12DevEnabled(environment)).toBe(true);
  expect(wmsWebRequestUrl(origin+'/api/v1/health')).toBe('/wms-api/api/v1/health');
  expect(environment.wmsGateApproved).toBe(false);
});
test('fix does not whitelist arbitrary relative paths, foreign origins or production',()=>{
  const e=env.ENVIRONMENTS['dev-test'];
  expect(p12DevEnabled({...e,apiBaseUrl:'/wms-api'})).toBe(false);
  expect(p12DevEnabled({...e,apiBaseUrl:'https://other.invalid'})).toBe(false);
  expect(p12DevEnabled({...e,apiBaseUrl:'https://khohoanamdev.lptech.info.vn'},'customer-production')).toBe(false);
});
