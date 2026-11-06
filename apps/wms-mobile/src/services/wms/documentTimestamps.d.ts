export const DOCUMENT_TIMESTAMP_CONTRACT: 'document-timestamps-v1';
export const DOCUMENT_DISPLAY_TIMEZONE: 'Asia/Ho_Chi_Minh';
export type DocumentTimestamp = Readonly<
 {status:'RECORDED';raw:string;epochMs:number;epochSecond:number;microsecond:number;fractionalDigits:number} |
 {status:'MISSING';raw:undefined} | {status:'NOT_RECORDED';raw:null} | {status:'INVALID';raw:unknown}>;
export function parseDocumentTimestamp(raw:unknown):DocumentTimestamp;
export function compareDocumentTimestamps(a:DocumentTimestamp,b:DocumentTimestamp):number;
export function documentTimestampParts(parsed:DocumentTimestamp):Record<string,string>|null;
export function formatDocumentTimestamp(parsed:DocumentTimestamp,options?:{seconds?:boolean;timeFirst?:boolean;missing?:string}):string;
export function isDocumentTimestampMetadata(meta:unknown):boolean;
