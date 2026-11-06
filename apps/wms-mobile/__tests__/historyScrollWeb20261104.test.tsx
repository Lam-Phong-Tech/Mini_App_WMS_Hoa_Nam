import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {ScrollView,StyleSheet,View} from 'react-native';
import {AppProviders} from '../src/app/App';
import {Page} from '../src/ui/Page';

test('history keeps the native ScrollView overflow rather than clipping the scroll axis',async()=>{
  let tree!:Renderer.ReactTestRenderer;
  await act(async()=>{tree=Renderer.create(<AppProviders><Page title="Lịch sử" headerVariant="history" scroll><View style={{height:2700}}/></Page></AppProviders>);});
  const scroll=tree.root.findByType(ScrollView);
  expect(StyleSheet.flatten(scroll.props.style)?.overflow).not.toBe('hidden');
  expect(scroll.props.onScroll).toEqual(expect.any(Function));
  await act(async()=>tree.unmount());
});
