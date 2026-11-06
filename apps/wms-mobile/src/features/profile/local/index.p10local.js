/** Explicit local native entry only. Android normal index.js never imports this file. */
import React from 'react';
import {AppRegistry} from 'react-native';
import {P10LocalHarness} from './P10LocalHarness';
import {name as appName} from '../../../../app.json';
global.fetch = async () => { throw new Error('P10 local entry blocks HTTP'); };
function LocalApp(){return <P10LocalHarness/>;}
AppRegistry.registerComponent(appName,()=>LocalApp);
