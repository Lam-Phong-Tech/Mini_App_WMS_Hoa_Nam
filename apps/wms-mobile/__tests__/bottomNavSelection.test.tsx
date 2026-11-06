import {HN_UI} from '../src/theme/uiKitV3';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { AppProviders } from '../src/app/App';
import { BottomNav } from '../src/ui/BottomNav';

test.each([true, false])(
  'P12 footer may remove only the active fill (%s), not selection/navigation',
  async highlightActive => {
    const select = jest.fn();
    let tree!: Renderer.ReactTestRenderer;
    await act(async () => {
      tree = Renderer.create(
        <AppProviders>
          <BottomNav
            activeKey="documents"
            highlightActive={highlightActive}
            onSelect={select}
          />
        </AppProviders>,
      );
    });
    const tab = tree.root
      .findAllByProps({ accessibilityLabel: 'Chứng từ' })
      .find(v => typeof v.props.onPress === 'function')!;
    expect(tab.props.accessibilityState.selected).toBe(true);
    const style = StyleSheet.flatten(tab.props.style({ pressed: false }));
    expect(style.backgroundColor).toBe(
      highlightActive ? HN_UI.selected : 'transparent',
    );
    await act(async () => tab.props.onPress());
    expect(select).toHaveBeenCalledWith('documents');
    await act(async () => tree.unmount());
  },
);
