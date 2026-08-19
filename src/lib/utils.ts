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

/**
 * Sanitize a URL for safe rendering. Only allows http/https schemes.
 * Blocks javascript:, data:, vbscript:, and custom schemes.
 * Returns null for invalid or dangerous URLs.
 */
export function sanitizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.href;
    }
  } catch {
    // Not a valid URL — treat as plain text
  }
  return null;
}

/**
 * Sanitize a filename for safe display and download.
 * Strips path separators, null bytes, and control characters.
 * Returns a safe basename.
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[\x00-\x1F\x7F]/g, '') // control chars
    .replace(/[/\\]/g, '') // path separators
    .replace(/^\./, '') // leading dots (hidden files)
    .slice(0, 255) // max filename length
    || 'unnamed';
}

/**
 * Sanitize a device name for safe display.
 * Strips control characters and limits length.
 */
export function sanitizeDeviceName(name: string): string {
  return name
    .replace(/[\x00-\x1F\x7F]/g, '') // control chars
    .trim()
    .replace(/\s+/g, ' ') // collapse whitespace
    .slice(0, 32)
    || 'Unnamed device';
}
