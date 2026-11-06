import fs from 'node:fs';
import {parseStockDetail,parseWarranty} from '../src/features/documents/p12/contract';
import {futureMilestones,warrantyIntakeSource} from '../src/features/documents/p12/futureEventEvidence';

// Optional operator-supplied, already-redacted TEST capture. Never calls HTTP.
const file=process.env.TC26_CAPTURE_FILE;
const suite=file?describe:describe.skip;
suite('TC26 captured real DEV owner response adapters (not UI acceptance)',()=>{
  const capture=file?JSON.parse(fs.readFileSync(file,'utf8')):null;
  const response=(label:string)=>capture.evidence.find((r:{label:string})=>r.label===label);
  test('actual canonical detail preserves all three persisted milestones',()=>{
    const r=response('tc04-detail'), b=r.body;
    expect(r.status).toBe(200);
    const d=parseStockDetail(b,'outbound',b.data.id,b.data.src_warehouse_id,{
      origin:'https://khohoanamdev.lptech.info.vn',rights:['outbound.view','outbound.scan'],
    });
    const events=futureMilestones(d);
    expect(events?.created.actor?.job_title_snapshot).toBe('Nhân viên kho TEST');
    expect(events?.checked.availability).toBe('RECORDED');
    expect(events?.sent_to_web.availability).toBe('RECORDED');
  });
  test('actual warranty detail consumes its intake snapshot, not current catalog',()=>{
    const r=response('tc12-detail'),b=r.body;
    expect(r.status).toBe(200);
    const c={warehouseId:b.data.warehouse_id} as Parameters<typeof parseWarranty>[3];
    const d=parseWarranty(b,'detail',b.data.warranty_case_id,c,{origin:'https://khohoanamdev.lptech.info.vn'});
    const source=warrantyIntakeSource(d);
    expect(source?.availability).toBe('RECORDED');
    expect(source?.sku_code).toBe('TC26-PRODUCT');
    expect(source?.serial_number).toBe('TC26-WARRANTY');
  });
});
