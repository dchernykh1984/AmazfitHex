// A stand-in for @zos/device. The app builds for round screens only, so the
// double reports the smaller of the two the app targets.
export function getDeviceInfo() {
  return { width: 466, height: 466 };
}
