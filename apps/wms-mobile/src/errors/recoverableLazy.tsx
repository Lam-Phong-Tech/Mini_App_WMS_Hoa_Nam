import React, {createContext, lazy, useContext, type ComponentType} from 'react';

/** Changed only by an explicit boundary retry; no automatic import/request loop. */
export const ScreenRetryContext = createContext(0);

/** React.lazy retains a rejected loader. Create a fresh lazy instance after the
 * user retries, keeping the surrounding AppShell/caller mounted. No business
 * request, storage cleanup or whole-page reload is performed here. */
export function recoverableLazy<T extends ComponentType<any>>(
  load: () => Promise<{default:T}>,
): ComponentType<React.ComponentProps<T>> {
  let failed = false;
  let attemptEpoch = 0;
  const create = () => lazy(async () => {
    try {const value=await load();failed=false;return value;}
    catch(error){failed=true;throw error;}
  });
  let current = create();
  function RecoverableScreen(props:React.ComponentProps<T>) {
    const epoch=useContext(ScreenRetryContext);
    if(failed&&epoch!==attemptEpoch){attemptEpoch=epoch;failed=false;current=create();}
    const Screen=current as unknown as ComponentType<React.ComponentProps<T>>;
    return React.createElement(Screen,props);
  }
  return RecoverableScreen;
}
