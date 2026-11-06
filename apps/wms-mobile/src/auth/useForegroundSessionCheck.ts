/** No push/instant-idle guarantee. Foreground checks are GET-only, never refresh polling. */
import {useEffect} from 'react';
import {AppState} from 'react-native';
import {getSession} from './session';
import {apiClient} from '../api/client';
const checkCurrentSession=()=>apiClient.get('/api/v1/auth/me');

export function useForegroundSessionCheck(enabled:boolean,check:()=>Promise<unknown>=checkCurrentSession):void {
  useEffect(()=>{
    if(!enabled)return;
    let previous=AppState.currentState,live=true,pending=false;
    const listener=AppState.addEventListener('change',state=>{
      const returned=state==='active'&&previous!=='active';previous=state;
      if(!live||!returned||pending||!getSession())return;
      pending=true;
      // API client invalidates only a terminal response from the same generation.
      check().catch(()=>undefined).finally(()=>{
        if(live)pending=false;
      });
    });
    return()=>{live=false;listener.remove();};
  },[enabled,check]);
}
