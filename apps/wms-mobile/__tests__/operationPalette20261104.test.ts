import { HN_OPERATIONS } from '../src/ui/hnHomeTokens';
import { UI_KIT_COLORS } from '../src/theme/uiKitV3';
test('operation identities retain original public-demo colors independently of action/UI Kit tokens', () => {
  expect(
    Object.fromEntries(
      Object.entries(HN_OPERATIONS).map(([k, v]) => [
        k,
        [v.ink, v.soft, v.line],
      ]),
    ),
  ).toEqual({
    inbound: ['#0d6b60', '#eaf7f2', '#c7e8df'],
    outbound: ['#225fa2', '#edf4ff', '#ccdef7'],
    warranty: ['#95601a', '#fff5e6', '#eedbbb'],
    nfc: ['#7550a2', '#f3effb', '#dfd2f0'],
    documents: ['#466279', '#eef3f7', '#d2dfe8'],
    lookup: ['#466279', '#eef3f7', '#d2dfe8'],
    sessions: ['#4e5da8', '#eff1fd', '#d4daf7'],
  });
  expect(UI_KIT_COLORS['action.primary.bg']).toBe('#0C6286');
});
