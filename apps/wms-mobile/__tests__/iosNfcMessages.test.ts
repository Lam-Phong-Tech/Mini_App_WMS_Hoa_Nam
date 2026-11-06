import {AppError} from '../src/errors/AppError';
import {nfcUserMessage} from '../src/features/nfc/nfcUserMessage';
test.each([
 ['NFC_ENTITLEMENT_UNAVAILABLE','Bản ký iPhone chưa có quyền NFC cần thiết. Kiểm tra cấu hình ký rồi thử lại.'],
 ['NFC_CONFIG_UNAVAILABLE','Bản cài chưa có cấu hình NFC cho iPhone.'],
 ['NFC_MULTIPLE_TAGS','Phát hiện nhiều thẻ. Chỉ giữ một thẻ gần iPhone.'],
])('iOS NFC %s explains the actual restriction without exposing raw native detail', (code,expected)=>{expect(nfcUserMessage(new AppError({kind:'unknown',code,message:'PRIVATE NATIVE DETAIL'}))).toBe(expected);});
