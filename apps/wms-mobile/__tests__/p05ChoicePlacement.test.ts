import { p05ChoicePlacement } from '../src/features/outbound/p05ChoicePlacement';

test('IME-covered P05 choice anchor stays mounted and opens above the keyboard', () => {
  const result = p05ChoicePlacement(
    { x: 20, y: 620, width: 370, height: 48 },
    { width: 411, height: 833, top: 0, bottom: 395 },
    300,
  );
  expect(result).toMatchObject({ side: 'above', left: 20, width: 370 });
  expect(result?.height).toBeGreaterThan(80);
  expect((result?.top ?? 0) + (result?.height ?? 0)).toBeLessThanOrEqual(438);
});

test('P05 choice remains below an in-viewport anchor when the keyboard is hidden', () => {
  const result = p05ChoicePlacement(
    { x: 20, y: 300, width: 370, height: 48 },
    { width: 411, height: 833, top: 0, bottom: 0 },
    300,
  );
  expect(result).toMatchObject({ side: 'below', top: 354, width: 370 });
});
