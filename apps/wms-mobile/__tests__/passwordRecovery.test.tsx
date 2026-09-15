import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ForgotPasswordFlow } from '../src/features/auth/ForgotPasswordFlow';
import {
  forgotPassword,
  resetPassword,
  verifyPasswordOtp,
  FORGOT_PASSWORD_PATH,
  VERIFY_OTP_PATH,
  RESET_PASSWORD_PATH,
} from '../src/services/wms/auth';
import { AppProviders } from '../src/app/App';
import { Button } from '../src/ui/Button';
import { Input } from '../src/ui/Input';

function textOf(tree: ReactTestRenderer.ReactTestRenderer | undefined): string {
  return JSON.stringify(tree?.toJSON());
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Authentication password recovery contract', () => {
  it('calls forgot-password with normalized email', async () => {
    const post = jest.fn(async () => ({ success: true, data: {} }));
    await forgotPassword('  User@Example.COM ', { post });
    expect(post).toHaveBeenCalledWith(FORGOT_PASSWORD_PATH, { email: 'user@example.com' });
  });

  it('verifies OTP and requires reset_token', async () => {
    const post = jest.fn(async () => ({ success: true, data: { reset_token: 'reset-1' } }));
    await expect(verifyPasswordOtp('user@example.com', '123456', { post })).resolves.toEqual({ reset_token: 'reset-1' });
    expect(post).toHaveBeenCalledWith(VERIFY_OTP_PATH, { email: 'user@example.com', otp: '123456' });
  });

  it('sends reset payload and validates password confirmation', async () => {
    const post = jest.fn(async () => ({ success: true, data: {} }));
    await resetPassword({
      email: 'user@example.com', resetToken: 'reset-1',
      newPassword: 'new-pass-123', newPasswordConfirmation: 'new-pass-123',
    }, { post });
    expect(post).toHaveBeenCalledWith(RESET_PASSWORD_PATH, expect.objectContaining({
      email: 'user@example.com', reset_token: 'reset-1',
      new_password: 'new-pass-123', new_password_confirmation: 'new-pass-123',
    }));
    await expect(resetPassword({
      email: 'user@example.com', resetToken: 'reset-1',
      newPassword: 'short', newPasswordConfirmation: 'different',
    }, { post })).rejects.toThrow('ít nhất 8 ký tự');
  });
});

describe('ForgotPasswordFlow UI', () => {
  it('renders email → OTP → new password and success states', async () => {
    const post = jest.fn(async (path: string) => {
      if (path === FORGOT_PASSWORD_PATH) return { success: true, data: {} };
      if (path === VERIFY_OTP_PATH) return { success: true, data: { reset_token: 'reset-1' } };
      return { success: true, data: {} };
    });
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders><ForgotPasswordFlow onBack={() => undefined} onDone={() => undefined} deps={{ post }} /></AppProviders>,
      );
    });
    expect(textOf(tree)).toContain('Bước 1/3');
    const email = tree?.root.findByType(Input);
    await ReactTestRenderer.act(() => email?.props.onChangeText('user@example.com'));
    await ReactTestRenderer.act(async () => {
      tree?.root.findAllByType(Button).find(button => button.props.label === 'Gửi mã OTP')?.props.onPress();
    });
    expect(textOf(tree)).toContain('Bước 2/3');
    const otp = tree?.root.findByType(Input);
    await ReactTestRenderer.act(() => otp?.props.onChangeText('123456'));
    await ReactTestRenderer.act(async () => {
      tree?.root.findAllByType(Button).find(button => button.props.label === 'Xác nhận OTP')?.props.onPress();
    });
    expect(textOf(tree)).toContain('Bước 3/3');
    const fields = tree?.root.findAllByType(Input) ?? [];
    await ReactTestRenderer.act(() => fields[0]?.props.onChangeText('new-pass-123'));
    await ReactTestRenderer.act(() => fields[1]?.props.onChangeText('new-pass-123'));
    await ReactTestRenderer.act(async () => {
      tree?.root.findAllByType(Button).find(button => button.props.label === 'Đặt mật khẩu mới')?.props.onPress();
    });
    expect(textOf(tree)).toContain('Đặt lại mật khẩu thành công');
    await ReactTestRenderer.act(() => tree?.unmount());
  });
});
