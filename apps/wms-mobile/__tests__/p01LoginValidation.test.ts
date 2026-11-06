/** TC_UI_03 copy contract; no network, credentials or layout mutation. */
import {
  MESSAGE_EMAIL_INVALID,
  MESSAGE_EMAIL_REQUIRED,
  MESSAGE_LOGIN_IDENTIFIER,
  MESSAGE_PASSWORD_REQUIRED,
  initialLoginForm,
  setEmail,
  setPassword,
  validateLogin,
} from '../src/features/auth/loginForm';

test('TC_UI_03 empty identifier names email only per BE contract', () => {
  const errors = validateLogin(initialLoginForm);
  expect(errors.email).toBe('Vui lòng nhập email.');
  expect(errors.password).toBe(MESSAGE_PASSWORD_REQUIRED);
  expect(MESSAGE_EMAIL_REQUIRED).toBe(MESSAGE_LOGIN_IDENTIFIER);
});

test('TC_UI_03 invalid identifier uses the same complete copy', () => {
  const errors = validateLogin(
    setPassword(setEmail(initialLoginForm, 'minhanh'), 'preview'),
  );
  expect(errors.email).toBe('Vui lòng nhập email hợp lệ.');
  expect(MESSAGE_EMAIL_INVALID).toBe('Vui lòng nhập email hợp lệ.');
});
