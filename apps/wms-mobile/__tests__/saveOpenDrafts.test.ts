import {
  createOpenDraftSaver,
  type DraftSaveJob,
} from '../src/shift/saveOpenDrafts';
function fixture() {
  let rev = 1,
    current = true;
  const states = { P05: 'DIRTY', P19: 'DIRTY' } as Record<string, string>;
  const local = () =>
    ({
      revision: String(rev),
      state: Object.values(states).includes('UNKNOWN')
        ? 'UNKNOWN'
        : Object.values(states).includes('DIRTY')
        ? 'DIRTY'
        : 'CLEAN',
      coverageComplete: true,
      busy: false,
      pendingRequestIds: [],
    } as any);
  const status = () =>
    Object.entries(states).map(([owner, state]) => ({
      owner,
      state,
      coverageComplete: true,
    })) as any;
  const calls: string[] = [];
  const make = jest.fn(
    async (owners: string[]) =>
      owners.map(owner => ({
        owner,
        save: async () => {
          calls.push(owner);
          states[owner] = 'CLEAN';
          rev++;
        },
      })) as DraftSaveJob[],
  );
  const saver = createOpenDraftSaver(make, {
    local,
    status,
    capture: () => ({} as any),
    current: () => current,
  });
  return {
    saver,
    states,
    calls,
    make,
    bump: () => rev++,
    expire: () => {
      current = false;
    },
  };
}
test('only explicit save runs jobs, success requires every owner CLEAN', async () => {
  const f = fixture(),
    p = f.saver.plan();
  expect(f.calls).toEqual([]);
  await f.saver.save(p);
  expect(f.calls).toEqual(['P05', 'P19']);
});
test('stale revision and replaced session fail before creating jobs', async () => {
  for (const mode of ['rev', 'scope']) {
    const f = fixture(),
      p = f.saver.plan();
    mode === 'rev' ? f.bump() : f.expire();
    await expect(f.saver.save(p)).rejects.toThrow();
    expect(f.make).not.toHaveBeenCalled();
  }
});
test('UNKNOWN never becomes SAVE intent', () => {
  const f = fixture();
  f.states.P19 = 'UNKNOWN';
  expect(() => f.saver.plan()).toThrow();
  expect(f.calls).toEqual([]);
});
test('partial failure retains first SAVE but does not acknowledge all saved', async () => {
  const f = fixture();
  f.make.mockImplementation(async () => [
    {
      owner: 'P05',
      save: async () => {
        f.states.P05 = 'CLEAN';
        f.bump();
      },
    },
    {
      owner: 'P19',
      save: async () => {
        throw Error('UNKNOWN');
      },
    },
  ]);
  await expect(f.saver.save(f.saver.plan())).rejects.toThrow('UNKNOWN');
  expect(f.states).toEqual({ P05: 'CLEAN', P19: 'DIRTY' });
});
test('job returning without CLEAN evidence and unsupported job set fail closed', async () => {
  const f = fixture();
  f.make.mockImplementation(async () => []);
  await expect(f.saver.save(f.saver.plan())).rejects.toThrow();
  const g = fixture();
  g.make.mockImplementation(async () => [
    { owner: 'P05', save: async () => {} },
    { owner: 'P19', save: async () => {} },
  ]);
  await expect(g.saver.save(g.saver.plan())).rejects.toThrow('SAVE');
});
