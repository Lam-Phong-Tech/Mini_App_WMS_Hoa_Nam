/** TC_UI_01 layout regression only; no API/session/shift mutations. */
import React from 'react';
import Renderer from 'react-test-renderer';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text as NativeText,
} from 'react-native';
import { AppProviders } from '../src/app/App';
import { LoginScreen } from '../src/features/auth/LoginScreen';
import { Input } from '../src/ui/Input';
import { Button } from '../src/ui/Button';
import { P01Icon } from '../src/features/auth/P01Icon';

let tree: Renderer.ReactTestRenderer;
beforeEach(async () => {
  await Renderer.act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <LoginScreen
          loginFn={async () => {
            throw new Error('Offline layout must not login');
          }}
        />
      </AppProviders>,
    );
  });
});
afterEach(async () => {
  await Renderer.act(async () => tree.unmount());
});
const text = (value: string) =>
  tree.root.findAllByType(NativeText).find(n => n.props.children === value)!;
const flat = (node: Renderer.ReactTestInstance) =>
  StyleSheet.flatten(node.props.style);

test('TC_UI_01 hero does not add 100% width to horizontal margins (motto clipping)', () => {
  const hero = tree.root.findByProps({ testID: 'P01.login.hero' });
  expect(flat(hero).width).not.toBe('100%');
  expect(flat(hero).alignSelf).toBe('stretch');
});
test('TC_UI_01 both footer rules have a nonzero scaled width, not zero-basis flex', () => {
  const caption = text('KẾT NỐI CON NGƯỜI - VẬN HÀNH HIỆU QUẢ');
  const row = caption.parent!.parent!;
  const rules = row.children.filter(
    n => typeof n !== 'string' && n !== caption.parent,
  ) as Renderer.ReactTestInstance[];
  expect(rules).toHaveLength(2);
  for (const rule of rules) {
    expect(flat(rule).width).toBeGreaterThan(0);
    expect(flat(rule).height).toBe(1);
    expect(flat(rule).flexShrink).toBe(0);
  }
});
test('parity29/10 keeps hero top-aligned and footer rules at the bottom of available height', () => {
  const footer = text('HOA NAM SCANNER').parent!; // brand text appears twice
  const group = tree.root.findByProps({ testID: 'P01.login.footer' });
  expect(footer).toBeDefined();
  expect(flat(group).flexGrow).toBeUndefined();
  expect(flat(group).justifyContent).toBeUndefined();
  expect(flat(group).paddingTop).toBeGreaterThan(0);
  expect(flat(group).marginTop).toBe('auto');
  expect(
    StyleSheet.flatten(
      tree.root.findByType(ScrollView).props.contentContainerStyle,
    ).flexGrow,
  ).toBe(1);
  expect(
    StyleSheet.flatten(
      tree.root.findByType(ScrollView).props.contentContainerStyle,
    ).justifyContent,
  ).not.toBe('center');
});

test('TC_UAT_01 motto is a separate flow column above the subtitle, never an absolute overlay', () => {
  const lead = tree.root.findByProps({ testID: 'P01.login.heroLead' });
  const motto = tree.root.findByProps({ testID: 'P01.login.motto' });
  expect(flat(lead).flexDirection).toBe('row');
  expect(flat(motto).position).not.toBe('absolute');
  expect(flat(motto).width).toBeGreaterThan(50);
  expect(motto.findAllByType(NativeText).map(n => n.props.children)).toEqual([
    'CHÍNH XÁC',
    'HIỆU QUẢ',
    'VẬN HÀNH',
    'BỀN VỮNG',
  ]);
});
test('TC_UI_01 existing reference field/button/icon sizes remain on the same width scale', () => {
  const scale = flat(tree.root.findByType(Image)).height / 405;
  expect(tree.root.findAllByType(Input).map(n => n.props.fieldHeight)).toEqual([
    56 * scale,
    56 * scale,
  ]);
  expect(flat(tree.root.findByType(Button)).minHeight).toBe(66 * scale);
  for (const name of ['user', 'lock', 'arrow']) {
    const icon = tree.root
      .findAllByType(P01Icon)
      .find(n => n.props.name === name)!;
    expect(icon.props.size).toBe(24 * scale);
  }
});
test('TC_UI_01 focus keeps WebKit-safe input size and uses the outer field ring', () => {
  const inputs = tree.root.findAllByType(Input);
  expect(inputs).toHaveLength(2);
  for (const input of inputs) {
    expect(input.props.quietFocus).not.toBe(true);
    expect(StyleSheet.flatten(input.props.focusStyle).outlineWidth).toBe(2);
    expect(input.props.inputStyle.fontSize).toBeGreaterThanOrEqual(16);
    expect(input.props.inputStyle.outlineWidth).toBe(0);
  }
});
