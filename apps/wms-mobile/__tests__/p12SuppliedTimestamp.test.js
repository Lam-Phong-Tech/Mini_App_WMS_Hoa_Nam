import fs from 'node:fs';
import path from 'node:path';
import {parseStockDetail} from '../src/features/documents/p12/contract';
import {parseMixed} from '../src/features/documents/p12/mixed';
import {formatDocumentTimestamp,compareDocumentTimestamps} from '../src/services/wms/documentTimestamps';
import * as m from './fixtures/p12Protocol';
const base=path.resolve(__dirname,'../handoff/P12/TIMESTAMP_PAGING_V3_20261013/supplied-http/P02_P12_TIMESTAMP_LIVE_2026-10-13');
const load=name=>{const text=fs.readFileSync(path.join(base,name),'utf8');return JSON.parse(text.slice(text.indexOf('{')));};
const pairs=load('live-pairs.json').pairs;
test.each(pairs)('supplied pair $uuid raw fields match and current parser/display agrees (OFFLINE)',pair=>{
 const n=String(pairs.indexOf(pair)+1).padStart(2,'0'),aggregate=load(n+'-aggregate.http.txt'),canonical=load(n+'-canonical.http.txt');
 const a=aggregate.data.find(r=>r.id===pair.uuid);expect(a.created_at).toBe(pair.expected_utc);expect(canonical.data.created_at).toBe(pair.expected_utc);
 // Supplied sanitizer replaces partner object and policy metadata wholesale.
 // Restore synthetic neutral shapes ONLY in this test clone; not raw evidence
 // and not a claim to have parsed an unredacted live HTTP body.
 aggregate.data[0].partner={display_name:null,redacted:false,availability:'NOT_RECORDED'};
 aggregate.meta.warranty_customer_search='NOT_SUPPORTED';
 const scope={...m.context(),warehouseId:aggregate.meta.warehouse_id};
 const q={source:'OUTBOUND',q:pair.document_no,per_page:aggregate.meta.per_page,cursor:'start'};
 const list=parseMixed(aggregate,q,scope,'https://p12.invalid'),detail=parseStockDetail(canonical,'outbound',pair.uuid,scope.warehouseId,{origin:'https://p12.invalid'});
 expect(list.items[0].createdAt).toBe(pair.expected_utc);expect(detail.createdAt).toBe(pair.expected_utc);
 expect(compareDocumentTimestamps(list.items[0].createdTimestamp,detail.createdTimestamp)).toBe(0);
 expect(formatDocumentTimestamp(detail.createdTimestamp,{seconds:true})).toBe(pair.expected_utc==='2026-10-09T08:11:50.000000Z'?'09/10/2026 15:11:50':pair.expected_utc==='2026-10-11T04:02:58.000000Z'?'11/10/2026 11:02:58':'11/10/2026 21:40:07');
 expect(canonical.data.status_history[0].created_at).toEqual(detail.source.status_history[0].created_at);
});
