import { NativeModules } from 'react-native';

export interface P18Preview {
  id: string;
  mime: string;
  pages: number;
  width: number;
  height: number;
  uri?: string;
  bytes: number;
  getText?: (page: number) => Promise<string>;
}

export interface P18Page {
  uri: string;
  width: number;
  height: number;
}

// Contract stubs for the initial iOS RED run; no fabricated preview readiness.
export async function openP18Preview(
  _blob: Blob,
  _mime: string,
  _signal?: AbortSignal,
): Promise<P18Preview> {
  throw new Error('Bộ xem trong app chưa sẵn sàng trên thiết bị này.');
}

export async function renderP18Page(
  _preview: P18Preview,
  _page: number,
  _width: number,
): Promise<P18Page> {
  throw new Error('Bộ xem trong app chưa sẵn sàng trên thiết bị này.');
}

export const closeP18Preview = (id: string) => NativeModules.P18Preview?.close(id);
