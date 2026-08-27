export function getBasePath() {
  if (
    window.BASE_PATH &&
    window.BASE_PATH !== "/" &&
    window.location.pathname.startsWith(window.BASE_PATH)
  ) {
    return window.BASE_PATH;
  }

  const zappsVersionMatch = window.location.pathname.match(
    /^\/zapps\/[^/]+\/[^/]+/,
  );

  if (zappsVersionMatch) {
    return zappsVersionMatch[0];
  }

  const zappsMatch = window.location.pathname.match(/^\/zapps\/[^/]+/);

  if (zappsMatch) {
    return zappsMatch[0];
  }

  return "";
}
