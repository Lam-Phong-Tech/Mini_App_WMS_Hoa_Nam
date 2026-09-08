/**
 * Connectivity abstraction.
 *
 * Dùng cho quy tắc offline thu hẹp (GATE_01 §3): app được phép quét, nhập và
 * lưu draft khi mất mạng, nhưng KHÔNG tự gửi mutation. Tầng UI cần biết trạng
 * thái mạng để hiển thị dữ liệu chưa gửi và khoá nút gửi.
 *
 * Chỉ bọc đúng phần NetInfo mà ứng dụng dùng, không bọc thừa.
 */

import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export interface ConnectivityState {
  /** Thiết bị có kết nối tới một mạng nào đó. */
  readonly isConnected: boolean;
  /**
   * Mạng đó có ra được Internet hay không.
   * `null` = NetInfo chưa xác định được (captive portal, đang dò).
   */
  readonly isInternetReachable: boolean | null;
  /** 'wifi' | 'cellular' | 'none' | ... — nguyên văn từ NetInfo. */
  readonly type: string;
}

export const UNKNOWN_CONNECTIVITY: ConnectivityState = {
  isConnected: false,
  isInternetReachable: null,
  type: 'unknown',
};

/**
 * Chỉ coi là gửi được khi đã kết nối VÀ NetInfo không khẳng định mất Internet.
 * `null` được coi là cho phép: chặn nhầm sẽ khoá thao tác hợp lệ trong kho.
 */
export function canReachNetwork(state: ConnectivityState): boolean {
  return state.isConnected && state.isInternetReachable !== false;
}

export function subscribeConnectivity(
  listener: (state: ConnectivityState) => void,
): () => void {
  return NetInfo.addEventListener(netInfoState => {
    listener({
      isConnected: netInfoState.isConnected === true,
      isInternetReachable: netInfoState.isInternetReachable,
      type: netInfoState.type,
    });
  });
}

export async function fetchConnectivity(): Promise<ConnectivityState> {
  const netInfoState = await NetInfo.fetch();
  return {
    isConnected: netInfoState.isConnected === true,
    isInternetReachable: netInfoState.isInternetReachable,
    type: netInfoState.type,
  };
}

export function useConnectivity(): ConnectivityState {
  const [state, setState] = useState<ConnectivityState>(UNKNOWN_CONNECTIVITY);

  useEffect(() => {
    let active = true;

    fetchConnectivity()
      .then(initial => {
        if (active) {
          setState(initial);
        }
      })
      .catch(() => {
        // Không xác định được thì giữ nguyên trạng thái chưa biết.
      });

    const unsubscribe = subscribeConnectivity(next => {
      if (active) {
        setState(next);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return state;
}
