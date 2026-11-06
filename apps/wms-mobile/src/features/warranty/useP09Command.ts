import { useEffect, useReducer } from 'react';
import { p09CommandOwner } from './p09Controller';
import type { P09Service } from '../../services/wms/p09Warranty';

export function useP09Command(service: P09Service) {
  const owner = p09CommandOwner(service),
    [, refresh] = useReducer(n => n + 1, 0);
  useEffect(() => owner.subscribe(refresh), [owner]);
  return { owner, ...owner.snapshot(), busy: owner.busy };
}
