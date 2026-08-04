import { getDeviceInfo } from "@zos/device";

const info = getDeviceInfo();

export const DEVICE_WIDTH = info.width;
export const DEVICE_HEIGHT = info.height;

// The app targets round watches only, so the screen is a circle: one diameter
// drives the board geometry and every chord calculation. Taking the smaller side
// keeps that true even if a device reports a pixel of slop between width and
// height.
export const SCREEN_SIZE = Math.min(DEVICE_WIDTH, DEVICE_HEIGHT);
