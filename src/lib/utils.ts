import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 1) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Stable short code for share links: the room's UUID with dashes removed,
 * first 8 chars. Stable for the room's whole life, unlike the rotating
 * 6-digit pairing code — so /s/<code> links survive being opened later.
 * Must match shortCodeOf in worker/src/registry.ts and the Node server.
 */
export function shortCodeOf(roomId: string): string {
  return roomId.replace(/-/g, '').slice(0, 8).toLowerCase();
}
