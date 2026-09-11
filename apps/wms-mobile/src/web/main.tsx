import { AppRegistry } from 'react-native';
import App from '../app/App';
import './global.css';

const appName = 'WmsMobile';
const rootTag = document.getElementById('root')!;
const root = document.documentElement;
root.style.height = '100%';
document.body.style.height = '100%';
document.body.style.margin = '0';
document.body.style.background = '#f3f8fb';
rootTag.style.height = '100%';
rootTag.style.display = 'flex';

AppRegistry.registerComponent(appName, () => App);
AppRegistry.runApplication(appName, {
  rootTag,
  initialProps: {},
});
