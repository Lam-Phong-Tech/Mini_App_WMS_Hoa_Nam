import { sheetKeyboardSpace } from '../src/ui/sheetKeyboard';
test('full-height modal reserves only the area actually covered by the keyboard', () => {
  expect(sheetKeyboardSpace(24, 876, 580)).toEqual({
    bottomInset: 320,
    availableHeight: 556,
  });
});
test('already resized Android modal does not subtract keyboard height a second time', () => {
  expect(sheetKeyboardSpace(24, 556, 580)).toEqual({
    bottomInset: 0,
    availableHeight: 556,
  });
});
test('hidden keyboard restores the full modal viewport; a floating keyboard below it does not shrink it', () => {
  expect(sheetKeyboardSpace(24, 876, undefined)).toEqual({
    bottomInset: 0,
    availableHeight: 876,
  });
  expect(sheetKeyboardSpace(24, 500, 580)).toEqual({
    bottomInset: 0,
    availableHeight: 500,
  });
});
test('very small visible viewport remains finite without negative panel size', () => {
  expect(sheetKeyboardSpace(24, 876, 20)).toEqual({
    bottomInset: 876,
    availableHeight: 0,
  });
});
