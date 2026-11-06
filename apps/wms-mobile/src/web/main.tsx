import { AppRegistry } from 'react-native';
import App from '../app/App';
import { type FixedFrameHost, mountFixedAppFrame } from './fixedAppFrame';
import './global.css';

const appName = 'WmsMobile';
const rootTag = document.getElementById('root')!;
const root = document.documentElement;
const innerFrame =
  new URL(window.location.href).searchParams.get('hn-frame') === '1';

root.style.height = '100%';
document.body.style.height = '100%';
document.body.style.margin = '0';
document.body.style.background = 'var(--hn-bg-canvas)';

if (innerFrame) {
  root.dataset.hnFrame = 'inner';
  document.body.dataset.hnFrame = 'inner';
  rootTag.style.width = '100%';
  rootTag.style.height = '100%';
  rootTag.style.display = 'flex';
  AppRegistry.registerComponent(appName, () => App);
  AppRegistry.runApplication(appName, {
    rootTag,
    initialProps: {},
  });
} else {
  root.dataset.hnFrame = 'host';
  document.body.dataset.hnFrame = 'host';
  const mounted = mountFixedAppFrame(
    rootTag as unknown as FixedFrameHost<HTMLIFrameElement>,
    () => document.createElement('iframe'),
    window.location.href,
    window.innerWidth,
    window.innerHeight,
    new URL(import.meta.url).pathname.split('/').pop(),
  );
  const update = () => mounted.update(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', update, false);
  window.visualViewport?.addEventListener('resize', update, false);
}
