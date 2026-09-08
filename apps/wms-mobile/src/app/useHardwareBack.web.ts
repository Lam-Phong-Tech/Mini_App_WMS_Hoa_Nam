/** Browser has its own history controls; flows use their visible Quay lại button. */
export function useHardwareBack(_action: () => boolean): void {
  // Deliberately no Android BackHandler subscription on the web target.
}

export function resetHardwareBackForTest(): void {
  // Kept for the same test-only surface as the Android implementation.
}
