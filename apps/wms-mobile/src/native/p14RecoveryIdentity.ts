import { NativeModules } from 'react-native';
export interface RecoveryIdentity {
  operationId: string;
  proof: string;
}
/** Android CSPRNG bridge. The read capability is returned only to caller memory. */
export async function createRecoveryIdentity(): Promise<RecoveryIdentity> {
  const port = NativeModules.P14RecoveryEntropy as
    | { createIdentity(): Promise<RecoveryIdentity> }
    | undefined;
  if (!port)
    throw new Error('Bản cài chưa có nguồn mã bảo vệ yêu cầu khôi phục.');
  return port.createIdentity();
}
