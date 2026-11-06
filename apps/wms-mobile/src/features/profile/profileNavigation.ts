/** A mounted profile editor owns only user-requested tab exits. Auth teardown bypasses this guard. */
type ExitGuard = (proceed: () => void) => void;
let active: { guard: ExitGuard } | undefined;
const dialogs=new Set<object>();
export function blockProfileNavigation():()=>void {const token={};dialogs.add(token);return()=>{dialogs.delete(token);};}
export function registerProfileExitGuard(guard: ExitGuard): () => void {
  const entry = { guard };
  active = entry;
  return () => {
    if (active === entry) active = undefined;
  };
}
export function requestProfileNavigation(proceed: () => void): void {
  if(dialogs.size)return;
  if (active) active.guard(proceed);
  else proceed();
}
