import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { HistoryFilterBar } from '../src/features/history/HistoryFilterBar';
import { Input } from '../src/ui/Input';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import {ScannerIcon} from '../src/ui/ScannerIcon';

test('history filter uses the locked funnel glyph and retains the filter action',async()=>{
  const open=jest.fn();
  let tree!:Renderer.ReactTestRenderer;
  await act(()=>{tree=Renderer.create(<ThemeProvider><HistoryFilterBar keyword="" placeholder="Tìm hoạt động" onKeywordChange={()=>{}} onFilter={open} onDates={()=>{}} dateLabel="Tất cả ngày" total={7692}/></ThemeProvider>);});
  try {
    const button=tree.root.findAll(n=>n.props.accessibilityLabel==='Bộ lọc ngày và trạng thái'&&typeof n.props.onPress==='function')[0];
    expect(button.findAllByType(ScannerIcon).map(n=>n.props.name)).toContain('funnel');
    await act(()=>button.props.onPress());
    expect(open).toHaveBeenCalledTimes(1);
  } finally {await act(()=>tree.unmount());}
});

test('shared search edits the owner draft and submits only on its own action', async () => {
  const change = jest.fn(),
    submit = jest.fn(),
    open = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <ThemeProvider>
        <HistoryFilterBar
          keyword=""
          placeholder="Tìm hồ sơ"
          onKeywordChange={change}
          onSubmit={submit}
          onFilter={open}
          onDates={open}
          dateLabel="Tất cả ngày"
          total={12}
        />
      </ThemeProvider>,
    );
  });
  await act(async () =>
    tree.root.findByType(Input).props.onChangeText('BH-001'),
  );
  expect(change).toHaveBeenCalledWith('BH-001');
  expect(submit).not.toHaveBeenCalled();
  await act(async () => tree.root.findByType(Input).props.onSubmitEditing());
  expect(submit).toHaveBeenCalledTimes(1);
  expect(open).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});

test('missing totals after a terminal read do not become a fake zero or loading count', async () => {
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <ThemeProvider>
        <HistoryFilterBar
          keyword=""
          placeholder="Tìm UID"
          onKeywordChange={() => {}}
          onFilter={() => {}}
          onDates={() => {}}
          dateLabel="Tất cả ngày"
          total={null}
          loading={false}
        />
      </ThemeProvider>,
    );
  });
  const rendered = JSON.stringify(tree.toJSON());
  expect(rendered).not.toContain('0 kết quả');
  expect(rendered).not.toContain('Đang tải');
  await act(async () => tree.unmount());
});
