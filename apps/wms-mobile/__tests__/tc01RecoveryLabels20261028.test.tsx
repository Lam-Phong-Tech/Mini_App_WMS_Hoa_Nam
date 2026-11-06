// TC01 marked text in the UAT screenshots; mock UI progression, no live OTP.
import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {StyleSheet,TextInput} from 'react-native';
import {ForgotPasswordFlow} from '../src/features/auth/ForgotPasswordFlow';
import {AppProviders} from '../src/app/App';
import {Input} from '../src/ui/Input';
import {Text} from '../src/ui/Text';
import {Button} from '../src/ui/Button';

let tree: Renderer.ReactTestRenderer | undefined;
afterEach(async () => { if(tree) await act(() => tree!.unmount()); tree=undefined; });

test('TC01 email/OTP labels and delivery text are bold; opening recovery sends no request', async()=>{
  const post=jest.fn(async()=>({success:true,data:{}}));
  await act(async()=>{
    tree=Renderer.create(<AppProviders><ForgotPasswordFlow onBack={()=>{}} onDone={()=>{}} deps={{post}} /></AppProviders>);
  });
  expect(post).not.toHaveBeenCalled();
  const email=tree!.root.findByType(Input);
  expect(email.props.label).toBe('Email tài khoản*');
  expect(StyleSheet.flatten(email.props.labelStyle)?.fontWeight).toBe('700');
  await act(()=>email.props.onChangeText('test@example.invalid'));
  await act(async()=>tree!.root.findAllByType(Button).find(button=>button.props.label==='Gửi mã OTP')!.props.onPress());
  const otpLabel=tree!.root.findAllByType(Text).find(node=>node.props.children==='Mã OTP*')!;
  expect(otpLabel).toBeDefined();
  expect(StyleSheet.flatten(otpLabel.props.style)?.fontWeight).toBe('700');
  expect(tree!.root.findAllByType(TextInput).filter(node=>String(node.props.accessibilityLabel).startsWith('Chữ số OTP '))).toHaveLength(6);
  const delivery=tree!.root.findAllByType(Text).find(node=>Array.isArray(node.props.children)&&node.props.children.some((part:unknown)=>typeof part==='string'&&part.startsWith('Nếu email hợp lệ, mã đã được gửi tới:')))!;
  expect(delivery).toBeDefined();
  expect(StyleSheet.flatten(delivery.props.style)?.fontWeight).toBe('700');
  expect(post).toHaveBeenCalledTimes(1);
});
