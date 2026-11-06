import { captureSessionScope, getActiveSession } from '../../../auth/session';
export function captureDeliveryOwner() {
  const { generation, userId, authSessionId } = captureSessionScope();
  return { generation, userId, authSessionId };
}
export function isDeliveryOwnerCurrent(
  owner: ReturnType<typeof captureDeliveryOwner>,
) {
  const current = captureDeliveryOwner();
  return (
    !!getActiveSession() &&
    !!owner.userId &&
    !!owner.authSessionId &&
    current.generation === owner.generation &&
    current.userId === owner.userId &&
    current.authSessionId === owner.authSessionId
  );
}
