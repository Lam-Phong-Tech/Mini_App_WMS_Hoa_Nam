/** Source guard for the user-confirmed LOCKED navigation restoration. */
export {};
declare const __dirname: string;
const fs = require('fs');
const path = require('path');
test('AppShell has no unapproved technical shift page or Home clock navigation', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'app', 'AppShell.tsx'),
    'utf8',
  );
  expect(source).not.toContain('ShiftLifecycleScreen');
  expect(source).not.toContain('shift-lifecycle');
  expect(source).not.toContain('onManageShift');
});
test('LOCKED route restoration retains shared ShiftState and P01 confirmation', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'app', 'AppShell.tsx'),
    'utf8',
  );
  expect(source).toContain('subscribeShiftState');
  expect(source).toContain('confirmedShift: readyShift');
  expect(source).toContain("flow === 'session-confirmation'");
  expect(source).toContain('onContinue={handleWorkShiftReady}');
});
