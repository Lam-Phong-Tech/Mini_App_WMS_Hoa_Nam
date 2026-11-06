import {foldAdministrativeName,geoUnitMatches} from '../src/services/geo/search';
test.each(['ca','can','CẦN THƠ','can tho','  Can   Tho  ','tho can'])('province Cần Thơ matches %s without altering its source name/code',q=>{
  const unit={code:'92',name:'Thành phố Cần Thơ'};
  expect(geoUnitMatches(unit,q)).toBe(true);expect(unit).toEqual({code:'92',name:'Thành phố Cần Thơ'});
});
test.each(['dai','đại','ĐẠI','an binh','phuong an','  '])('ward search handles accent, đ and spaces: %s',q=>{
  const unit={code:'WARD-TEST',name:'Phường Đại An Bình'};
  expect(geoUnitMatches(unit,q)).toBe(true);
});
test('decomposed Vietnamese and false matches',()=>{
  expect(foldAdministrativeName('Đắk Lắk')).toBe('dak lak');
  expect(geoUnitMatches({code:'TEST',name:'Thành phố Cần Thơ'.normalize('NFD')},'can tho')).toBe(true);
  expect(geoUnitMatches({code:'TEST',name:'Tỉnh Lào Cai'},'can tho')).toBe(false);
});
