// Which machine's picture the card carries, and where it comes from.
//
// A machine with its own local desktop (V's own host) is grabbed on the host
// with ffmpeg. A machine reached over its own handoff service (Tianyi's Mac)
// has no local display at all: the same service that drives Screen Sharing
// grabs the frame (GET /v1/capture). Either way a failure degrades to V's
// cover picture, so a card is never lost because a screen grab failed.
export function targetCaptureFromService(target = {}) {
  if (target.capture === "service") {
    return true;
  }
  if (target.capture === "cover" || target.capture === "local") {
    return false;
  }
  return !target.desktopDisplay;
}
