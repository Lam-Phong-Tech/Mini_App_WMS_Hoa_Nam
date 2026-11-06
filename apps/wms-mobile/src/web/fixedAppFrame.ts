export const APP_FRAME_WIDTH = 494;
export const APP_FRAME_HEIGHT = 950;

export interface FixedFrameMetrics {
  scale: number;
  renderedWidth: number;
  renderedHeight: number;
}

type FixedFrameStyle = Partial<
  Record<
    | 'border'
    | 'display'
    | 'flex'
    | 'height'
    | 'inset'
    | 'overflow'
    | 'position'
    | 'transform'
    | 'transformOrigin'
    | 'width',
    string
  >
>;

export interface FixedFrameElement {
  src: string;
  title: string;
  style: FixedFrameStyle;
  setAttribute(name: string, value: string): void;
}

export interface FixedFrameHost<TFrame extends FixedFrameElement> {
  style: FixedFrameStyle;
  replaceChildren(frame: TFrame): void;
}

export function fixedAppFrameMetrics(
  viewportWidth: number,
  viewportHeight: number,
): FixedFrameMetrics {
  const safeWidth = Math.max(0, viewportWidth),
    safeHeight = Math.max(0, viewportHeight),
    scale = Math.min(
      1,
      safeWidth / APP_FRAME_WIDTH,
      safeHeight / APP_FRAME_HEIGHT,
    );
  return {
    scale,
    renderedWidth: APP_FRAME_WIDTH * scale,
    renderedHeight: APP_FRAME_HEIGHT * scale,
  };
}

export function innerAppUrl(value: string, buildId?: string): string {
  const url = new URL(value);
  url.searchParams.set('hn-frame', '1');
  if (buildId) url.searchParams.set('hn-build', buildId);
  return url.toString();
}

export function mountFixedAppFrame<TFrame extends FixedFrameElement>(
  host: FixedFrameHost<TFrame>,
  createFrame: () => TFrame,
  url: string,
  viewportWidth: number,
  viewportHeight: number,
  buildId?: string,
): { frame: TFrame; update(width: number, height: number): void } {
  const frame = createFrame();
  frame.src = innerAppUrl(url, buildId);
  frame.title = 'Hoa Nam Scanner';
  frame.setAttribute('aria-label', 'Ứng dụng quản lý kho Hoa Nam');
  Object.assign(frame.style, {
    border: '0',
    display: 'block',
    height: `${APP_FRAME_HEIGHT}px`,
    inset: '0',
    position: 'absolute',
    transformOrigin: 'top left',
    width: `${APP_FRAME_WIDTH}px`,
  });
  Object.assign(host.style, {
    flex: '0 0 auto',
    overflow: 'hidden',
    position: 'relative',
  });
  const update = (width: number, height: number) => {
    const metrics = fixedAppFrameMetrics(width, height);
    host.style.width = `${metrics.renderedWidth}px`;
    host.style.height = `${metrics.renderedHeight}px`;
    frame.style.transform = `scale(${metrics.scale})`;
  };
  update(viewportWidth, viewportHeight);
  host.replaceChildren(frame);
  return { frame, update };
}
