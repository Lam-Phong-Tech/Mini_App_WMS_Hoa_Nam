import React, {Suspense, useState} from 'react';
import {Text, Pressable} from 'react-native';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {Button} from '../src/ui/Button';
import {ErrorBoundary} from '../src/errors/ErrorBoundary';
import {recoverableLazy} from '../src/errors/recoverableLazy';

describe('screen recovery preserves the caller and requires explicit retry',()=>{
  let consoleError:jest.SpyInstance;
  beforeEach(()=>{consoleError=jest.spyOn(console,'error').mockImplementation(()=>{});});
  afterEach(()=>{consoleError.mockRestore();});
  const hasText=(screen:ReactTestRenderer,value:string)=>screen.root.findAll(node=>node.type===Text&&node.props.children===value).length>0;
  const mount=async(node:React.ReactElement)=>{let screen!:ReactTestRenderer;await act(async()=>{screen=create(node);await Promise.resolve();});return screen;};
  const retry=async(screen:ReactTestRenderer)=>{await act(async()=>{screen.root.findByType(Button).props.onPress();await Promise.resolve();});};

  test('retry clears a transient render error instead of merging an empty state',async()=>{
    let broken=true;
    function Child(){if(broken)throw Error('temporary render fault');return <Text>Recovered render</Text>;}
    const screen=await mount(<ErrorBoundary><Child/></ErrorBoundary>);
    expect(hasText(screen,'Ứng dụng gặp sự cố')).toBe(true);
    broken=false;await retry(screen);
    expect(hasText(screen,'Recovered render')).toBe(true);
  });

  test('a rejected lazy factory can retry while its parent state remains mounted',async()=>{
    let attempts=0;
    const Loader=recoverableLazy(async()=>{
      attempts++;
      if(attempts===1)throw Error('temporary chunk read failure');
      return {default:()=> <Text>Recovered route</Text>};
    });
    function Caller(){const [value,setValue]=useState(7);return <><Pressable testID="retained-increment" accessibilityRole="button" onPress={()=>setValue(v=>v+1)}><Text>{'Retained '+value}</Text></Pressable><ErrorBoundary><Suspense fallback={<Text>Loading</Text>}><Loader/></Suspense></ErrorBoundary></>;}
    const screen=await mount(<Caller/>);
    await act(async()=>{screen.root.findByProps({testID:'retained-increment'}).props.onPress();});
    expect(hasText(screen,'Ứng dụng gặp sự cố')).toBe(true);
    expect(attempts).toBe(1);
    await retry(screen);
    expect(hasText(screen,'Recovered route')).toBe(true);
    expect(hasText(screen,'Retained 8')).toBe(true);
    expect(attempts).toBe(2);
  });

  test('an explicit route key change removes the prior route error',async()=>{
    function Broken():never{throw Error('broken route');}
    const screen=await mount(<ErrorBoundary resetKey="first"><Broken/></ErrorBoundary>);
    expect(hasText(screen,'Ứng dụng gặp sự cố')).toBe(true);
    await act(async()=>{screen.update(<ErrorBoundary resetKey="second"><Text>Another route</Text></ErrorBoundary>);});
    expect(hasText(screen,'Another route')).toBe(true);
  });
});
