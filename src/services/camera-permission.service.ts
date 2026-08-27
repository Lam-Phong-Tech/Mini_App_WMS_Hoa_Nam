type FacingMode = "environment" | "user";

export function getCameraConstraints(
  facingMode: FacingMode = "environment",
): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      // Không đặt min: một số camera trong Zalo WebView không đáp ứng được
      // độ phân giải tối thiểu dù vẫn quay được ở độ phân giải khác.
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
    },
  };
}

export async function getMainBackCameraConstraints(): Promise<MediaStreamConstraints> {
  const fallback = getCameraConstraints("environment");

  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.enumerateDevices !== "function"
  ) {
    return fallback;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((device) => device.kind === "videoinput");

    const backCameras = videoInputs.filter((device) => {
      const label = device.label.toLowerCase();

      return (
        label.includes("back") ||
        label.includes("rear") ||
        label.includes("environment")
      );
    });

    const mainBackCamera =
      backCameras.find((device) => {
        const label = device.label.toLowerCase();

        return (
          !label.includes("front") &&
          !label.includes("user") &&
          !label.includes("selfie") &&
          !label.includes("ultra") &&
          !label.includes("wide") &&
          !label.includes("macro") &&
          !label.includes("tele")
        );
      }) ||
      backCameras.find((device) => {
        const label = device.label.toLowerCase();

        return (
          !label.includes("front") &&
          !label.includes("user") &&
          !label.includes("selfie")
        );
      });

    if (!mainBackCamera?.deviceId) return fallback;

    return {
      audio: false,
      video: {
        deviceId: { exact: mainBackCamera.deviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
    };
  } catch {
    return fallback;
  }
}

export async function requestCameraPermissionWarmup() {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    return false;
  }

  const stream = await navigator.mediaDevices.getUserMedia(
    getCameraConstraints("environment"),
  );

  stream.getTracks().forEach((track) => track.stop());
  return true;
}

export function releasePrewarmedCameraStream() {
  // Không giữ stream nền trong Zalo WebView vì dễ khóa camera và làm màn quét treo.
}
