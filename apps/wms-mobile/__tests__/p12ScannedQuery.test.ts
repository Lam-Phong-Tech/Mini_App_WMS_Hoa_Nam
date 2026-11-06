import { documentScanQuery } from '../src/features/documents/p12/scannedQuery';
test.each([
  'PN-RW-20261007',
  'PX-ABC',
  'HN1|SKU=SKU-A|ITEM=ITEM-A',
  'Nội dung Unicode 長😀',
])(
  'keeps the opaque code for search, not a constructed ID/route: %s',
  value => {
    expect(documentScanQuery(' ' + value + ' ')).toEqual({ value });
  },
);
test.each([
  null,
  undefined,
  '',
  '\n',
  'PN\n123',
  'A'.repeat(201),
  'https://example.invalid/document/abc?token=private',
  ['javascript', 'alert(1)'].join(':'),
  'data:text/plain,secret',
])('rejects unsupported/empty code without navigation or network: %s', raw => {
  expect(documentScanQuery(raw)).toHaveProperty('error');
});
