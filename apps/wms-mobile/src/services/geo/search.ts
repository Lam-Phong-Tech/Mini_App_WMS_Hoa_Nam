import type {GeoUnit} from './provinces';

/** Search text only. Persisted administrative names and codes stay unchanged. */
export function foldAdministrativeName(value:string):string {
  return value.normalize('NFD').replace(/\p{M}/gu,'').replace(/[đĐ]/g,'d')
    .toLocaleLowerCase('vi').trim().replace(/\s+/gu,' ');
}
export function geoUnitMatches(unit:GeoUnit,query:string):boolean {
  const name=foldAdministrativeName(unit.name);
  return foldAdministrativeName(query).split(' ').every(part=>name.includes(part));
}
