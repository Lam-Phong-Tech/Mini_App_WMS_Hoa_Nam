import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ForgotPasswordFlow } from '../src/features/auth/ForgotPasswordFlow';
import { SixDigitOtpInput } from '../src/features/auth/SixDigitOtpInput';
import { P11PasswordField } from '../src/features/profile/P11Presentation';
import { P11Button } from '../src/features/profile/P11Frame';
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
import { Text as UiText } from '../src/ui/Text';
import { AppIcon } from '../src/ui/AppIcon';
import { StyleSheet, TextInput } from 'react-native';
import {clearSession,getSession,setSession} from '../src/auth/session';
import { AppError } from '../src/errors/AppError';

function textOf(tree: ReactTestRenderer.ReactTestRenderer | undefined): string {
  return JSON.stringify(tree?.toJSON());
}

beforeEach(() => {
  jest.clearAllMocks();
  clearSession();
});
afterEach(()=>clearSession());

describe('Authentication password recovery contract', () => {
  it('does not clear a newer login when an older public reset completes',async()=>{
    const clearLocalSession=jest.fn(async()=>undefined);
    const post=jest.fn(async()=>{
      setSession({accessToken:'newer-test-access',userId:'newer-test-user',authSessionId:'newer-test-family'});
      return {success:true,data:null};
    });
    await resetPassword({email:'test@example.invalid',resetToken:'test-only-reset',newPassword:'New-test-pass!',newPasswordConfirmation:'New-test-pass!'},{post,clearLocalSession});
    expect(clearLocalSession).not.toHaveBeenCalled();
    expect(getSession()?.userId).toBe('newer-test-user');
  });
  it('calls forgot-password with normalized email', async () => {
    const post = jest.fn(async () => ({ success: true, data: {} }));
    await forgotPassword('  User@Example.COM ', { post });
    expect(post).toHaveBeenCalledWith(FORGOT_PASSWORD_PATH, {
      email: 'user@example.com',
    });
  });

  it('verifies OTP and requires reset_token', async () => {
    const post = jest.fn(async () => ({
      success: true,
      data: { reset_token: 'reset-1', expires_in: 600 },
    }));
    await expect(
      verifyPasswordOtp('user@example.com', '123456', { post }),
    ).resolves.toEqual({ reset_token: 'reset-1', expires_in: 600 });
    expect(post).toHaveBeenCalledWith(VERIFY_OTP_PATH, {
      email: 'user@example.com',
      otp: '123456',
    });
  });

  it('rejects OTP that is not exactly six digits without a request', async () => {
    const post = jest.fn();
    await expect(
      verifyPasswordOtp('user@example.com', '12345', { post }),
    ).rejects.toThrow('đúng 6 chữ số');
    await expect(
      verifyPasswordOtp('user@example.com', '12345A', { post }),
    ).rejects.toThrow('đúng 6 chữ số');
    expect(post).not.toHaveBeenCalled();
  });

  it('sends reset payload and validates password confirmation', async () => {
    const post = jest.fn(async () => ({ success: true, data: {} }));
    const clearLocalSession = jest.fn(async () => undefined);
    await resetPassword(
      {
        email: 'user@example.com',
        resetToken: 'reset-1',
        newPassword: 'New-pass-123!',
        newPasswordConfirmation: 'New-pass-123!',
      },
      { post, clearLocalSession },
    );
    expect(post).toHaveBeenCalledWith(
      RESET_PASSWORD_PATH,
      expect.objectContaining({
        email: 'user@example.com',
        reset_token: 'reset-1',
        new_password: 'New-pass-123!',
        new_password_confirmation: 'New-pass-123!',
      }),
    );
    expect(clearLocalSession).toHaveBeenCalledTimes(1);
    await expect(
      resetPassword(
        {
          email: 'user@example.com',
          resetToken: 'reset-1',
          newPassword: 'short',
          newPasswordConfirmation: 'different',
        },
        { post, clearLocalSession },
      ),
    ).rejects.toThrow('8 đến 128 ký tự');
  });

  it.each([
    ['alllowercase!', 'chữ thường và chữ hoa'],
    ['ALLUPPERCASE!', 'chữ thường và chữ hoa'],
    ['NoSpecial123', 'ký tự đặc biệt'],
    [' Leading@123', 'khoảng trắng'],
    ['Trailing@123 ', 'khoảng trắng'],
  ])('rejects weak password %s before POST', async (password, message) => {
    const post = jest.fn();
    await expect(
      resetPassword(
        {
          email: 'user@example.com',
          resetToken: 'reset-1',
          newPassword: password,
          newPasswordConfirmation: password,
        },
        { post, clearLocalSession: jest.fn(async () => undefined) },
      ),
    ).rejects.toThrow(message);
    expect(post).not.toHaveBeenCalled();
  });
});

describe('ForgotPasswordFlow UI', () => {
  it('keeps header Back disabled while the reset response is pending',async()=>{
    let finish!:()=>void;
    const back=jest.fn();
    const post=jest.fn(async(path:string)=>{
      if(path===FORGOT_PASSWORD_PATH)return {success:true,data:null};
      if(path===VERIFY_OTP_PATH)return {success:true,data:{reset_token:'test-only-reset',expires_in:600}};
      return new Promise(resolve=>{finish=()=>resolve({success:true,data:null});});
    });
    let tree!:ReactTestRenderer.ReactTestRenderer;
    try {
      await ReactTestRenderer.act(()=>{tree=ReactTestRenderer.create(<AppProviders><ForgotPasswordFlow onBack={back} onDone={jest.fn()} deps={{post,clearLocalSession:jest.fn(async()=>undefined)}}/></AppProviders>);});
      await ReactTestRenderer.act(()=>tree.root.findByType(Input).props.onChangeText('test@example.invalid'));
      await ReactTestRenderer.act(async()=>tree.root.findAllByType(Button).find(b=>b.props.label==='Gửi mã OTP')!.props.onPress());
      await ReactTestRenderer.act(()=>tree.root.findByType(SixDigitOtpInput).props.onChangeText('123456'));
      await ReactTestRenderer.act(async()=>tree.root.findAllByType(Button).find(b=>b.props.label==='Xác nhận OTP')!.props.onPress());
      await ReactTestRenderer.act(()=>tree.root.findAllByType(P11PasswordField).forEach(f=>f.props.onChangeText('New-test-pass!')));
      await ReactTestRenderer.act(async()=>{tree.root.findAllByType(P11Button).find(b=>b.props.label==='Lưu mật khẩu')!.props.onPress();await Promise.resolve();});
      const backButton=tree.root.findByProps({accessibilityLabel:'Quay lại'});
      expect(backButton.props.disabled??backButton.props.accessibilityState?.disabled).toBe(true);
      expect(back).not.toHaveBeenCalled();
      await ReactTestRenderer.act(async()=>finish());
    }finally{if(tree)await ReactTestRenderer.act(()=>tree.unmount());}
  });
  it('uses the reference password form after OTP with two new-password fields and local mismatch feedback', async () => {
    const post=jest.fn(async(path:string)=>path===VERIFY_OTP_PATH?{success:true,data:{reset_token:'test-only-reset',expires_in:600}}:{success:true,data:null});
    let tree!:ReactTestRenderer.ReactTestRenderer;
    try {
      await ReactTestRenderer.act(()=>{tree=ReactTestRenderer.create(<AppProviders><ForgotPasswordFlow onBack={jest.fn()} onDone={jest.fn()} deps={{post}}/></AppProviders>);});
      await ReactTestRenderer.act(()=>tree.root.findByType(Input).props.onChangeText('test@example.invalid'));
      await ReactTestRenderer.act(async()=>tree.root.findAllByType(Button).find(b=>b.props.label==='Gửi mã OTP')!.props.onPress());
      await ReactTestRenderer.act(()=>tree.root.findByType(SixDigitOtpInput).props.onChangeText('123456'));
      await ReactTestRenderer.act(async()=>tree.root.findAllByType(Button).find(b=>b.props.label==='Xác nhận OTP')!.props.onPress());
      const fields=tree.root.findAllByType(P11PasswordField);
      expect(fields).toHaveLength(2);
      expect(fields.map(f=>f.props.label)).toEqual(['Mật khẩu mới','Xác nhận mật khẩu mới']);
      await ReactTestRenderer.act(()=>{fields[0].props.onChangeText('New-test-pass!');fields[1].props.onChangeText('Different-test-pass!');});
      expect(tree.root.findAllByType(P11PasswordField)[1].props.errorText).toBe('Mật khẩu xác nhận chưa khớp.');
      await ReactTestRenderer.act(async()=>tree.root.findAllByType(P11Button).find(b=>b.props.label==='Lưu mật khẩu')!.props.onPress());
      expect(post.mock.calls.filter(([path])=>path===RESET_PASSWORD_PATH)).toHaveLength(0);
    }finally{if(tree)await ReactTestRenderer.act(()=>tree.unmount());}
  });
  it('renders six separate OTP cells and spreads a pasted code without auto-verifying', async () => {
    const post=jest.fn(async(path:string)=>{if(path!==FORGOT_PASSWORD_PATH)throw new Error('Unexpected auth request');return {success:true,data:null};});
    let tree!:ReactTestRenderer.ReactTestRenderer;
    try {
      await ReactTestRenderer.act(()=>{tree=ReactTestRenderer.create(<AppProviders><ForgotPasswordFlow onBack={jest.fn()} onDone={jest.fn()} deps={{post}}/></AppProviders>);});
      await ReactTestRenderer.act(()=>tree.root.findByType(Input).props.onChangeText('test@example.invalid'));
      await ReactTestRenderer.act(async()=>tree.root.findAllByType(Button).find(b=>b.props.label==='Gửi mã OTP')!.props.onPress());
      const cells=()=>tree.root.findAllByType(TextInput).filter(n=>String(n.props.accessibilityLabel).startsWith('Chữ số OTP '));
      expect(cells()).toHaveLength(6);
      const formatted='123 456';
      await ReactTestRenderer.act(()=>cells()[0].props.onChangeText(formatted.slice(0,cells()[0].props.maxLength)));
      expect(cells().map(n=>n.props.value)).toEqual(['1','2','3','4','5','6']);
      await ReactTestRenderer.act(()=>cells()[0].props.onChangeText('00a0123456789'));
      expect(cells().map(n=>n.props.value)).toEqual(['0','0','0','1','2','3']);
      expect(post.mock.calls.filter(([path])=>path===VERIFY_OTP_PATH)).toHaveLength(0);
      await ReactTestRenderer.act(()=>cells()[5].props.onChangeText(''));
      await ReactTestRenderer.act(()=>cells()[5].props.onKeyPress({nativeEvent:{key:'Backspace'}}));
      expect(cells()[4].props.value).toBe('');
      expect(tree.root.findAllByType(Button).find(b=>b.props.label==='Xác nhận OTP')!.props.disabled).toBe(true);
    } finally {if(tree)await ReactTestRenderer.act(()=>tree.unmount());}
  });
  it('keeps OTP input to six digits, preserving leading zeroes and never auto-submitting', async () => {
    const post=jest.fn(async(path:string)=>{if(path!==FORGOT_PASSWORD_PATH)throw new Error('Unexpected auth request');return {success:true,data:null};});
    let tree!:ReactTestRenderer.ReactTestRenderer;
    try {
      await ReactTestRenderer.act(()=>{tree=ReactTestRenderer.create(<AppProviders><ForgotPasswordFlow onBack={jest.fn()} onDone={jest.fn()} deps={{post}}/></AppProviders>);});
      await ReactTestRenderer.act(()=>tree.root.findByType(Input).props.onChangeText('test@example.invalid'));
      await ReactTestRenderer.act(async()=>tree.root.findAllByType(Button).find(b=>b.props.label==='Gửi mã OTP')!.props.onPress());
      await ReactTestRenderer.act(()=>tree.root.findByType(SixDigitOtpInput).props.onChangeText('00a0123456789'));
      expect(tree.root.findByType(SixDigitOtpInput).props.value).toBe('000123');
      expect(post.mock.calls.filter(([path])=>path===VERIFY_OTP_PATH)).toHaveLength(0);
      await ReactTestRenderer.act(()=>tree.root.findByType(SixDigitOtpInput).props.onChangeText('abc'));
      expect(tree.root.findByType(SixDigitOtpInput).props.value).toBe('');
      expect(tree.root.findAllByType(Button).find(b=>b.props.label==='Xác nhận OTP')!.props.disabled).toBe(true);
    } finally {if(tree)await ReactTestRenderer.act(()=>tree.unmount());}
  });
  it('keeps the new-password step and shows the server field rejection without clearing session', async () => {
    const clearLocalSession=jest.fn(async()=>undefined);
    const post=jest.fn(async(path:string)=>{
      if(path===FORGOT_PASSWORD_PATH)return {success:true,data:null};
      if(path===VERIFY_OTP_PATH)return {success:true,data:{reset_token:'test-only-reset',expires_in:600}};
      throw new AppError({kind:'http',status:422,route:RESET_PASSWORD_PATH,
        message:'Dữ liệu không hợp lệ.',fieldErrors:{new_password:['Mật khẩu mới không đáp ứng chính sách máy chủ.']},requestId:'field-error-test-only'});
    });
    let tree!:ReactTestRenderer.ReactTestRenderer;
    try {
      await ReactTestRenderer.act(async()=>{tree=ReactTestRenderer.create(<AppProviders><ForgotPasswordFlow onBack={jest.fn()} onDone={jest.fn()} deps={{post,clearLocalSession}}/></AppProviders>);});
      await ReactTestRenderer.act(()=>tree.root.findByType(Input).props.onChangeText('test@example.invalid'));
      const press=async(label:string)=>ReactTestRenderer.act(async()=>{
        if(label==='Đặt mật khẩu mới')tree.root.findAllByType(P11Button).find(b=>b.props.accessibilityLabel===label)!.props.onPress();
        else tree.root.findAllByType(Button).find(b=>b.props.label===label)!.props.onPress();
      });
      await press('Gửi mã OTP');
      await ReactTestRenderer.act(()=>tree.root.findByType(SixDigitOtpInput).props.onChangeText('123456'));
      await press('Xác nhận OTP');
      const fields=tree.root.findAllByType(P11PasswordField);
      await ReactTestRenderer.act(()=>{fields[0].props.onChangeText('Test-only-pass!');fields[1].props.onChangeText('Test-only-pass!');});
      await press('Đặt mật khẩu mới');
      expect(textOf(tree)).toContain('Mật khẩu mới không đáp ứng chính sách máy chủ.');
      expect(textOf(tree)).toContain('Bước 3/3');
      expect(textOf(tree)).not.toContain('Đặt lại mật khẩu thành công');
      expect(clearLocalSession).not.toHaveBeenCalled();
      expect(post.mock.calls.filter(([path])=>path===RESET_PASSWORD_PATH)).toHaveLength(1);
    } finally { if(tree)await ReactTestRenderer.act(()=>tree.unmount()); }
  });
  it('locks OTP request on 429 and shows Retry-After with Request-ID', async () => {
    const post = jest.fn(async () => {
      throw new AppError({
        kind: 'http',
        status: 429,
        route: FORGOT_PASSWORD_PATH,
        requestId: 'req-otp-429',
        retryAfterSeconds: 17,
        message: 'Too many attempts',
      });
    });
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <ForgotPasswordFlow
            onBack={() => undefined}
            onDone={() => undefined}
            deps={{ post }}
          />
        </AppProviders>,
      );
    });
    await ReactTestRenderer.act(() =>
      tree.root.findByType(Input).props.onChangeText('user@example.com'),
    );
    await ReactTestRenderer.act(async () => {
      tree.root
        .findAllByType(Button)
        .find(button => button.props.label === 'Gửi mã OTP')
        ?.props.onPress();
    });
    const retry = tree.root
      .findAllByType(Button)
      .find(button => String(button.props.label).startsWith('Thử lại sau'));
    expect(retry?.props.disabled).toBe(true);
    expect(textOf(tree)).toContain('req-otp-429');
    await ReactTestRenderer.act(async () => tree.unmount());
  });

  it('TC_UAT_01 keeps the heading bold and the header/email icons in separate positions', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <ForgotPasswordFlow
            onBack={() => undefined}
            onDone={() => undefined}
            deps={{ post: jest.fn() }}
          />
        </AppProviders>,
      );
    });

    const heading = tree.root
      .findAllByType(UiText)
      .find(node => node.props.children === 'Nhập email tài khoản');
    expect(heading?.props).toMatchObject({
      variant: 'cardTitle',
      tone: 'strong',
    });

    const email = tree.root.findByType(Input);
    expect(email.props.leftAdornment.type).toBe(AppIcon);
    expect(email.props.leftAdornment.props.name).toBe('profile');
    expect(email.props.leftAdornment.props.size).toBe(24);

    const headerIcon = tree.root
      .findAllByType(AppIcon)
      .find(icon => icon.props.name === 'shield-check');
    expect(headerIcon?.props.size).toBe(24);
    expect(headerIcon).not.toBe(email.props.leftAdornment);

    await ReactTestRenderer.act(async () => tree.unmount());
  });

  it('TC_UAT_02 uses the requested title and separates content from header without sending OTP on open', async () => {
    const post = jest.fn();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <ForgotPasswordFlow
            onBack={() => undefined}
            onDone={() => undefined}
            deps={{ post }}
          />
        </AppProviders>,
      );
    });
    const header = tree.root.findByProps({ testID: 'P14.recovery.header' });
    expect(header.findAllByType(UiText).some(node => node.props.children === 'Quên mật khẩu')).toBe(true);
    const content = tree.root.findByProps({ testID: 'P14.recovery.content' });
    expect(StyleSheet.flatten(content.props.style)).toMatchObject({
      gap: 28,
    });
    const actions = tree.root.findByProps({ testID: 'P14.recovery.actions' });
    expect(actions.findAllByType(Button).some(node => node.props.label === 'Gửi mã OTP')).toBe(true);
    expect(post).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => tree.unmount());
  });
  it('renders email → OTP → new password and success states', async () => {
    const post = jest.fn(async (path: string) => {
      if (path === FORGOT_PASSWORD_PATH) return { success: true, data: {} };
      if (path === VERIFY_OTP_PATH)
        return {
          success: true,
          data: { reset_token: 'reset-1', expires_in: 600 },
        };
      return { success: true, data: {} };
    });
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <ForgotPasswordFlow
            onBack={() => undefined}
            onDone={() => undefined}
            deps={{ post, clearLocalSession: jest.fn(async () => undefined) }}
          />
        </AppProviders>,
      );
    });
    expect(textOf(tree)).toContain('Bước 1/3');
    const email = tree?.root.findByType(Input);
    await ReactTestRenderer.act(() =>
      email?.props.onChangeText('user@example.com'),
    );
    await ReactTestRenderer.act(async () => {
      tree?.root
        .findAllByType(Button)
        .find(button => button.props.label === 'Gửi mã OTP')
        ?.props.onPress();
    });
    expect(textOf(tree)).toContain('Bước 2/3');
    const otp = tree?.root.findByType(SixDigitOtpInput);
    await ReactTestRenderer.act(() => otp?.props.onChangeText('123456'));
    await ReactTestRenderer.act(async () => {
      tree?.root
        .findAllByType(Button)
        .find(button => button.props.label === 'Xác nhận OTP')
        ?.props.onPress();
    });
    expect(textOf(tree)).toContain('Bước 3/3');
    const fields = tree?.root.findAllByType(P11PasswordField) ?? [];
    await ReactTestRenderer.act(() =>
      fields[0]?.props.onChangeText('New-pass-123!'),
    );
    await ReactTestRenderer.act(() =>
      fields[1]?.props.onChangeText('New-pass-123!'),
    );
    await ReactTestRenderer.act(async () => {
      tree?.root
        .findAllByType(P11Button)
        .find(button => button.props.accessibilityLabel === 'Đặt mật khẩu mới')
        ?.props.onPress();
    });
    expect(textOf(tree)).toContain('Đặt lại mật khẩu thành công');
    await ReactTestRenderer.act(() => tree?.unmount());
  });
});
