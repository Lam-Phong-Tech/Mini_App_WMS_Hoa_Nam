import React, { useState } from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TextInput } from 'react-native';
import { P11PasswordField } from '../src/features/profile/P11Presentation';

test.each([false, true])('eye restores focused selection; cancelled after unmount=%s', async leave => {
  jest.useFakeTimers();
  const focus = jest.fn(), setNativeProps = jest.fn();
  const inputRef = React.createRef<React.ComponentRef<typeof TextInput>>();
  function Field() {
    const [visible, setVisible] = useState(false);
    return <P11PasswordField label="Mật khẩu mới" value="TEST-ONLY" editable
      inputRef={inputRef} secureTextEntry={!visible}
      onToggleVisible={() => setVisible(value => !value)} onChangeText={() => {}} />;
  }
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    await ReactTestRenderer.act(async () => { tree = ReactTestRenderer.create(<Field />); });
    inputRef.current = { focus, setNativeProps } as unknown as React.ComponentRef<typeof TextInput>;
    const input = tree!.root.findByType(TextInput);
    await ReactTestRenderer.act(async () => {
      input.props.onFocus();
      input.props.onSelectionChange({ nativeEvent: { selection: { start: 2, end: 5 } } });
    });
    await ReactTestRenderer.act(async () => {
      tree!.root.findByProps({ accessibilityLabel: 'Hiện mật khẩu mới' }).props.onPress();
    });
    expect(tree!.root.findByType(TextInput)).toBe(input);
    expect(input.props.value).toBe('TEST-ONLY');
    expect(input.props.secureTextEntry).toBe(false);
    expect(input.props.maxLength).toBeUndefined();
    expect(input.props.autoComplete).toBe('off');
    if (leave) {
      await ReactTestRenderer.act(async () => tree!.unmount());
      tree = undefined;
    }
    await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(20); });
    expect(focus).toHaveBeenCalledTimes(leave ? 0 : 1);
    if (!leave) expect(setNativeProps).toHaveBeenCalledWith({ selection: { start: 2, end: 5 } });
  } finally {
    if (tree) await ReactTestRenderer.act(async () => tree!.unmount());
    jest.useRealTimers();
  }
});
