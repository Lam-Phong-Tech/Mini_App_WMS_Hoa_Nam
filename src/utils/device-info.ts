interface DeviceInfo {
  deviceLabel: string;
  detailLabel?: string;
}

const ANDROID_MODEL_ALIASES: Record<string, string> = {
  "2211133C": "Xiaomi 13",
  "2211133G": "Xiaomi 13",
  "2210132C": "Xiaomi 13 Pro",
  "2210132G": "Xiaomi 13 Pro",
  "2304FPN6DC": "Xiaomi 13 Ultra",
  "2304FPN6DG": "Xiaomi 13 Ultra",
};

export function getClientDeviceInfo(): DeviceInfo {
  if (typeof navigator === "undefined") {
    return { deviceLabel: "Thiết bị hiện tại" };
  }

  const userAgent = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;

  if (/iPad/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1)) {
    return {
      deviceLabel: "iPad",
      detailLabel: getIosVersion(userAgent),
    };
  }

  if (/iPhone/i.test(userAgent)) {
    return {
      deviceLabel: "iPhone",
      detailLabel: getIosVersion(userAgent),
    };
  }

  if (/Android/i.test(userAgent)) {
    const model = getAndroidModel(userAgent);
    return {
      deviceLabel: model ? mapAndroidModel(model) : "Android",
      detailLabel: getAndroidVersion(userAgent),
    };
  }

  return {
    deviceLabel: /Windows/i.test(userAgent)
      ? "Windows"
      : /Mac/i.test(userAgent)
        ? "Mac"
        : "Thiết bị hiện tại",
  };
}

function getIosVersion(userAgent: string) {
  const match = userAgent.match(/OS ([\d_]+)/i);
  if (!match?.[1]) return undefined;
  return `iOS ${match[1].replace(/_/g, ".")}`;
}

function getAndroidVersion(userAgent: string) {
  const match = userAgent.match(/Android\s+([\d.]+)/i);
  if (!match?.[1]) return undefined;
  return `Android ${match[1]}`;
}

function getAndroidModel(userAgent: string) {
  const buildMatch = userAgent.match(/Android[^;]*;\s*([^;)]+?)\s+Build\//i);
  if (buildMatch?.[1]) return cleanAndroidModel(buildMatch[1]);

  const androidParts = userAgent
    .split(";")
    .map((part) => cleanAndroidModel(part))
    .filter(Boolean);

  return androidParts.find(
    (part) =>
      !/^Android/i.test(part) &&
      !/^wv$/i.test(part) &&
      !/^Mobile/i.test(part),
  );
}

function cleanAndroidModel(value: string) {
  return value
    .replace(/\bwv\b/gi, "")
    .replace(/\bMobile\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mapAndroidModel(model: string) {
  const normalized = model.toUpperCase();
  return ANDROID_MODEL_ALIASES[normalized] || model;
}
