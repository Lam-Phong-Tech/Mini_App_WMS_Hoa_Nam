jest.mock('react-native',()=>({Platform:{OS:'ios'}}));
import {USER_AGENT} from '../src/api/userAgent';
test('iPhone requests identify as the admitted iOS client rather than Android',()=>{expect(USER_AGENT).toBe('WMSHoaNam-iOS/1.0');});
