// Native port of approved P19 pure JSON owner. See CORE_PROVENANCE.json.
import {P19_LINKED_GATE,P19_LINKED_MODE,LinkedIssueError,clone} from './linked-contract.js';
import {createP19LinkedAdapter} from './linked-adapter.js';
import {createLinkedIssueOwner} from './linked-owner.js';

// Product wiring seam only. OFF means no auth/context/resolve/save/stock calls.
export function prepareP19Linked(){return {gate:P19_LINKED_GATE,mode:P19_LINKED_MODE,activated:false,
 createOfflineOwner({offlineRequest,...options}){return createLinkedIssueOwner({...options,adapter:createP19LinkedAdapter({offlineRequest})});},
};}
// Data-only P09/P20/P21 bridge. Canonical/fixture objects never enter this owner.
export function linkedPanelProjection(s){if(s.mode!==P19_LINKED_MODE)throw new LinkedIssueError('P19_MODE_UNSUPPORTED');const r=s.result;return clone({mode:s.mode,caseId:s.caseRow?.warranty_case_id||null,draftId:s.draftId,scanSessionId:s.scanSessionId,businessId:r?.business_document_id||s.current?.document.id||null,documentNo:r?.document_no||s.current?.document.component_issue_no||null,draftVersion:s.draftVersion,businessVersion:r?.document_version||s.current?.document.version||null,panel:r?'P19.S04':s.unknown?'P19.S03':s.pendingQuantity?'P19.S02':'P19.S01',codes:s.counts.codes,quantity:s.counts.quantity,postedQuantity:r?.quantity_total??null,postedAt:r?.posted_at??null,available:s.pendingQuantity?.resolved.available_qty??null,editable:s.phase==='DRAFT'&&!s.unknown&&!s.busy,canPost:s.phase==='DRAFT'&&!s.resumeBlocked&&!s.resolving&&!s.pendingQuantity&&!s.dirty&&!s.busy&&!s.unknown&&!s.pending&&!!s.savedSnapshot&&s.counts.codes>0&&s.counts.codes<=500,logoutAllowed:true,result:r||null,current:s.current||null});}
