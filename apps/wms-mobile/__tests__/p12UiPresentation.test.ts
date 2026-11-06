import {documentFileMetadata, documentListState} from '../src/features/documents/p12/uiPresentation';
import { initialFilters, type State } from '../src/features/documents/p12/controller';

test.each([
  ['application/pdf', 24576, 'PDF · 24.0 KB'],
  ['image/png', 2 * 1024 * 1024, 'PNG · 2.0 MB'],
  ['image/jpeg', 0, 'JPEG · 0 B'],
  ['image/webp', null, 'WebP · Chưa rõ dung lượng'],
  ['application/pdf', undefined, 'PDF · Chưa rõ dung lượng'],
  ['application/pdf', NaN, 'PDF · Chưa rõ dung lượng'],
  ['application/pdf', -1, 'PDF · Chưa rõ dung lượng'],
])('file metadata preserves source size/null without synthetic page count: %s/%s', (mime, bytes, expected) => {
  const value = documentFileMetadata(mime as string, bytes as number | null | undefined);
  expect(value).toBe(expected);
  expect(value).not.toContain('trang');
});

test.each([
  ['pending', undefined, {}, undefined, 'loading'],
  ['loading', {items:[],paging:{total:0}}, {}, undefined, 'loading'],
  ['error', undefined, {}, undefined, 'error'],
  ['ready', {items:[],paging:{total:0}}, {}, undefined, 'empty'],
  ['ready', {items:[],paging:{total:0}}, {q:'không có'}, undefined, 'no-results'],
  ['ready', {items:[],paging:{total:0}}, {status:'SCANNING'}, undefined, 'no-results'],
  ['ready', {items:[],paging:{total:0}}, {from:'2026-10-29',to:'2026-10-29'}, undefined, 'no-results'],
  ['ready', {items:[],paging:{total:0}}, {source:'inbound'}, 'inbound', 'no-results'],
  ['ready', {items:[],paging:{total:0}}, {source:'inbound'}, undefined, 'empty'],
  ['ready', {items:[],paging:{total:null}}, {}, undefined, null],
  ['ready', undefined, {}, undefined, null],
  ['ready', {items:[{id:'loaded'}],paging:{total:null}}, {}, undefined, null],
])('P12 list classification keeps verified count/filter/queue ownership: %s/%j/%j/%s', (status,data,filters,stockQueue,expected)=>{
  expect(documentListState({list:{status,data},filters:{...initialFilters(),...filters},stockQueue} as Pick<State,'list'|'filters'|'stockQueue'>)).toBe(expected);
});
