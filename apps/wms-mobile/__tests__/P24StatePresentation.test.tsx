import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { ScrollView, Text, TextInput } from 'react-native';
import {
  P24QuantityPresentation,
  P24RejectedCodePresentation,
  P24ClosedCasePresentation,
  P24_PANEL_IDS,
  type P24QuantityProps,
  type P24RejectedCodeProps,
  type P24ClosedCaseProps,
} from '../src/features/scan/P24StatePresentation';

jest.mock('../src/features/inbound/P04Icon', () => ({ P04Icon: () => null }));
// S03 is an unchanged re-export. Its separate owner tests cover the real component.
jest.mock('../src/features/inbound/InboundResultScreen', () => ({
  InboundResultScreen: () => null,
}));
const mockScrollTo = jest.fn();
jest.mock('react-native/Libraries/Components/ScrollView/ScrollView', () => {
  const ReactForMock = require('react');
  return {
    __esModule: true,
    default: ReactForMock.forwardRef(
      (props: { children?: React.ReactNode }, ref: React.Ref<unknown>) => {
        ReactForMock.useImperativeHandle(ref, () => ({
          scrollTo: mockScrollTo,
        }));
        return ReactForMock.createElement(
          'CaptureScrollView',
          props,
          props.children,
        );
      },
    ),
  };
});
let tree: Renderer.ReactTestRenderer;
jest.setTimeout(30000);
beforeEach(() => mockScrollTo.mockClear());
const render = async (element: React.ReactElement) => {
  await act(async () => {
    tree = Renderer.create(element);
  });
};
const text = () => JSON.stringify(tree.toJSON());
const action = (label: string) =>
  tree.root
    .findAllByProps({ accessibilityLabel: label })
    .find(n => typeof n.props.onPress === 'function')!;
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
});

function quantity(patch: Partial<P24QuantityProps> = {}): P24QuantityProps {
  return {
    box: { skuCode: 'LK-TEST', name: 'Linh kiện TEST', rawCode: 'BOX-TEST' },
    caseLabel: 'BH-TEST',
    availability: { status: 'VERIFIED', quantity: 12, selectableLimit: 12 },
    value: '13',
    validationMessage: 'Vượt phần còn có thể chọn.',
    canConfirm: false,
    canIncrease: false,
    canDecrease: true,
    onChangeText: jest.fn(),
    onDecrease: jest.fn(),
    onIncrease: jest.fn(),
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
    ...patch,
  };
}
function rejected(
  patch: Partial<P24RejectedCodeProps> = {},
): P24RejectedCodeProps {
  return {
    context: {
      caseId: 'case-test',
      caseLabel: 'BH-TEST',
      productName: 'Thiết bị TEST',
      statusLabel: 'Đang kiểm tra',
    },
    itemKind: 'BOX',
    rawCode: '  BOX-TEST-ß漢字\nEND  ',
    reason: 'Hộp chưa được ghi nhận nhập kho.',
    warehouseName: 'Kho TEST',
    draftLabel: 'draft-test',
    acceptedCodeCount: 1,
    onBack: jest.fn(),
    onScanAnother: jest.fn(),
    onEditRaw: jest.fn(),
    onReadFull: jest.fn(),
    ...patch,
  };
}
function closed(patch: Partial<P24ClosedCaseProps> = {}): P24ClosedCaseProps {
  return {
    context: {
      caseId: 'case-test',
      caseLabel: 'BH-TEST',
      productName: 'Thiết bị TEST',
      status: 'RETURNED',
      serial: 'SER-TEST',
      customerName: 'Khách TEST',
    },
    loadedDocumentCount: 1,
    onBack: jest.fn(),
    onOpenCase: jest.fn(),
    onTimeline: jest.fn(),
    onReadFull: jest.fn(),
    children: <Text>POSTED từ owner P20</Text>,
    ...patch,
  };
}

it('keeps all four canonical IDs without adding a writer route', () => {
  expect(P24_PANEL_IDS).toEqual(['P24.S01', 'P24.S02', 'P24.S03', 'P24.S04']);
});
it('shows owner validation and never confirms invalid or unknown availability', async () => {
  const p = quantity({ canConfirm: true });
  await render(<P24QuantityPresentation {...p} />);
  expect(text()).toContain(p.validationMessage);
  expect(action('Xác nhận số lượng').props.disabled).toBe(true);
  await act(async () => action('Xác nhận số lượng').props.onPress());
  expect(p.onConfirm).not.toHaveBeenCalled();
  await act(async () =>
    tree.update(
      <P24QuantityPresentation
        {...p}
        validationMessage={null}
        availability={{ status: 'UNAVAILABLE' }}
      />,
    ),
  );
  expect(text()).toContain('Chưa xác minh');
  expect(action('Xác nhận số lượng').props.disabled).toBe(true);
  expect(text()).not.toContain('0 linh kiện');
});
it('forwards exact typed input and stepper intent without calculating or committing owner quantity', async () => {
  const p = quantity({
    validationMessage: null,
    value: '2',
    canConfirm: true,
    canIncrease: true,
  });
  await render(<P24QuantityPresentation {...p} />);
  await act(async () => {
    tree.root.findByType(TextInput).props.onChangeText('01.5');
    action('Giảm số lượng').props.onPress();
    action('Tăng số lượng').props.onPress();
  });
  expect(p.onChangeText).toHaveBeenCalledWith('01.5');
  expect(p.onDecrease).toHaveBeenCalledTimes(1);
  expect(p.onIncrease).toHaveBeenCalledTimes(1);
  expect(p.onConfirm).not.toHaveBeenCalled();
  await act(async () => action('Xác nhận số lượng').props.onPress());
  expect(p.onConfirm).toHaveBeenCalledTimes(1);
  await act(async () => action('Hủy').props.onPress());
  expect(p.onCancel).toHaveBeenCalledTimes(1);
});
it('blocks input/step/confirm/cancel callbacks during owner busy', async () => {
  const p = quantity({
    busy: true,
    canConfirm: true,
    canIncrease: true,
    validationMessage: null,
  });
  await render(<P24QuantityPresentation {...p} />);
  await act(async () => {
    tree.root.findByType(TextInput).props.onChangeText('3');
    for (const label of [
      'Giảm số lượng',
      'Tăng số lượng',
      'Xác nhận số lượng',
      'Hủy',
      'Hủy nhập số lượng',
    ])
      action(label).props.onPress();
  });
  for (const fn of [
    p.onChangeText,
    p.onDecrease,
    p.onIncrease,
    p.onConfirm,
    p.onCancel,
  ])
    expect(fn).not.toHaveBeenCalled();
});
it('rejected BOX replaces scanner with preserved owner context and edit raw unchanged', async () => {
  const p = rejected();
  await render(<P24RejectedCodePresentation {...p} />);
  expect(text()).toContain('Mã hộp chưa thể xuất');
  expect(text()).toContain('Đã giữ 1 mã hợp lệ');
  expect(text()).toContain('draft-test');
  expect(text()).not.toContain('Kiểm tra linh kiện →');
  await act(async () => action('Sửa mã vừa nhập').props.onPress());
  expect(p.onEditRaw).toHaveBeenCalledWith(p.rawCode);
  expect(p.onScanAnother).not.toHaveBeenCalled();
});
it('does not label UNIT/unknown as BOX or turn missing counts into zero', async () => {
  await render(
    <P24RejectedCodePresentation
      {...rejected({ itemKind: 'UNIT', acceptedCodeCount: null, reason: null })}
    />,
  );
  expect(text()).toContain('Linh kiện chưa thể xuất');
  expect(text()).not.toContain('Mã hộp chưa thể xuất');
  expect(text()).toContain('Chưa xác minh số mã hợp lệ');
  expect(text()).not.toContain('Đã giữ 0');
  await act(async () =>
    tree.update(
      <P24RejectedCodePresentation {...rejected({ itemKind: 'UNKNOWN' })} />,
    ),
  );
  expect(text()).toContain('Mã chưa thể xuất');
  expect(text()).not.toContain('Mã hộp chưa thể xuất');
});
it('long raw uses owner reader with original Unicode/newline value, without trimming', async () => {
  const p = rejected();
  await render(<P24RejectedCodePresentation {...p} />);
  const measure = tree.root
    .findAllByType(Text)
    .find(
      n =>
        n.props.children === p.rawCode &&
        typeof n.props.onTextLayout === 'function',
    )!;
  await act(async () =>
    measure.props.onTextLayout({ nativeEvent: { lines: [{}, {}, {}] } }),
  );
  await act(async () => action('Xem đầy đủ Mã đã quét').props.onPress());
  expect(p.onReadFull).toHaveBeenCalledWith('Mã đã quét', p.rawCode);
});
it('closed case renders verified owner slot and read links, no new issue and no invented recovery', async () => {
  const p = closed({ loadedDocumentCount: null });
  await render(<P24ClosedCasePresentation {...p} />);
  expect(text()).toContain('Đã trả khách');
  expect(text()).toContain('POSTED từ owner P20');
  expect(text()).toContain('Chưa xác minh số phiếu');
  expect(text()).not.toContain('Xuất linh kiện mới');
  expect(text()).not.toContain('Tiếp tục phiếu linh kiện');
  expect(text()).not.toContain('0 phiếu đã tải');
  await act(async () => {
    action('Xem thông tin hồ sơ').props.onPress();
    action('Xem quá trình bảo hành').props.onPress();
    action('Về lịch sử').props.onPress();
  });
  expect(p.onOpenCase).toHaveBeenCalledTimes(1);
  expect(p.onTimeline).toHaveBeenCalledTimes(1);
  expect(p.onBack).toHaveBeenCalledTimes(1);
});
it('an original UNKNOWN check remains an explicit owner callback, disabled means no callback', async () => {
  const check = jest.fn();
  const p = closed({
    originalRequestCheck: {
      label: 'Kiểm tra yêu cầu đang chờ',
      onPress: check,
      disabled: true,
    },
  });
  await render(<P24ClosedCasePresentation {...p} />);
  await act(async () => action('Kiểm tra yêu cầu đang chờ').props.onPress());
  expect(check).not.toHaveBeenCalled();
  await act(async () =>
    tree.update(
      <P24ClosedCasePresentation
        {...p}
        originalRequestCheck={{
          label: 'Kiểm tra yêu cầu đang chờ',
          onPress: check,
        }}
      />,
    ),
  );
  await act(async () => action('Kiểm tra yêu cầu đang chờ').props.onPress());
  expect(check).toHaveBeenCalledTimes(1);
});
it('restores scroll once after enough content and does not jump back on append', async () => {
  const onScroll = jest.fn();
  await render(
    <P24ClosedCasePresentation
      {...closed({ initialScrollY: 200, onScrollPositionChange: onScroll })}
    />,
  );
  const scroll = tree.root.findByType(ScrollView);
  await act(async () => {
    scroll.props.onLayout({ nativeEvent: { layout: { height: 500 } } });
    scroll.props.onContentSizeChange(494, 600);
    scroll.props.onContentSizeChange(494, 900);
    scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 300 } } });
    scroll.props.onContentSizeChange(494, 1200);
  });
  expect(onScroll).toHaveBeenCalledWith(300);
  expect(mockScrollTo).toHaveBeenCalledTimes(1);
  expect(mockScrollTo).toHaveBeenCalledWith({ y: 200, animated: false });
});
