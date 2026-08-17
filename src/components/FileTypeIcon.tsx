import React from 'react';
import {
  File, FileText, FileArchive, FileSpreadsheet, Presentation,
  FileCode, FileJson, FileImage, FileAudio, FileVideo, FileType,
  AppWindow, FilePen,
} from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * One coherent file-icon language for every type ShareText can move.
 * Unknown extensions still get a real icon (generic file) — a transfer is
 * never rejected just because the extension is unfamiliar.
 *
 * Each bucket has its own accent color so cards scan by color + glyph at a
 * glance, staying legible at 16px in the attach strip and 20px on cards.
 */

type Bucket =
  | 'image' | 'video' | 'audio' | 'pdf' | 'doc' | 'sheet' | 'slides'
  | 'archive' | 'code' | 'text' | 'data' | 'font' | 'exec' | 'generic';

interface BucketDef {
  icon: React.ElementType;
  color: string;          // icon color
  bg: string;             // tile background (light)
  bgDark: string;         // tile background (dark)
}

const BUCKETS: Record<Bucket, BucketDef> = {
  image:  { icon: FileImage,      color: 'text-[#0a7d33]',      bg: 'bg-[#e8f6ee]',      bgDark: 'dark:bg-[#10261a]' },
  video:  { icon: FileVideo,      color: 'text-[#7b2dd3]',      bg: 'bg-[#f3ecfd]',      bgDark: 'dark:bg-[#1e1430]' },
  audio:  { icon: FileAudio,      color: 'text-[#c2185b]',      bg: 'bg-[#fdeef4]',      bgDark: 'dark:bg-[#2a1220]' },
  pdf:    { icon: FileText,       color: 'text-[#c62828]',      bg: 'bg-[#fdeeee]',      bgDark: 'dark:bg-[#2b1212]' },
  doc:    { icon: FilePen,        color: 'text-[#1565c0]',      bg: 'bg-[#e8f1fc]',      bgDark: 'dark:bg-[#0f1d30]' },
  sheet:  { icon: FileSpreadsheet,color: 'text-[#1b7a3d]',      bg: 'bg-[#e7f6ec]',      bgDark: 'dark:bg-[#0f2417]' },
  slides: { icon: Presentation,   color: 'text-[#e65100]',      bg: 'bg-[#fdf0e6]',      bgDark: 'dark:bg-[#2b1a0c]' },
  archive:{ icon: FileArchive,    color: 'text-[#8d6e00]',      bg: 'bg-[#faf3dd]',      bgDark: 'dark:bg-[#231d0c]' },
  code:   { icon: FileCode,       color: 'text-[#00695c]',      bg: 'bg-[#e4f4f1]',      bgDark: 'dark:bg-[#0d211d]' },
  text:   { icon: FileType,       color: 'text-[#455a64]',      bg: 'bg-[#ecf0f2]',      bgDark: 'dark:bg-[#141b1e]' },
  data:   { icon: FileJson,       color: 'text-[#6a1b9a]',      bg: 'bg-[#f4ecfa]',      bgDark: 'dark:bg-[#201230]' },
  font:   { icon: FileType,       color: 'text-[#37474f]',      bg: 'bg-[#eaeff1]',      bgDark: 'dark:bg-[#131a1c]' },
  exec:   { icon: AppWindow,      color: 'text-[#283593]',      bg: 'bg-[#e8eaf6]',      bgDark: 'dark:bg-[#141735]' },
  generic:{ icon: File,           color: 'text-[#546e7a]',      bg: 'bg-[#e9eff1]',      bgDark: 'dark:bg-[#141b1e]' },
};

const EXT_MAP: Record<string, Bucket> = {
  // images
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
  svg: 'image', heic: 'image', heif: 'image', bmp: 'image', avif: 'image', tiff: 'image', ico: 'image',
  // video
  mp4: 'video', mov: 'video', webm: 'video', mkv: 'video', avi: 'video', m4v: 'video',
  mpg: 'video', mpeg: 'video', wmv: 'video', flv: 'video', '3gp': 'video',
  // audio
  mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio', flac: 'audio', aac: 'audio',
  wma: 'audio', opus: 'audio', mid: 'audio', midi: 'audio', aiff: 'audio',
  // docs
  pdf: 'pdf',
  doc: 'doc', docx: 'doc', rtf: 'doc', odt: 'doc', pages: 'doc',
  // sheets
  xls: 'sheet', xlsx: 'sheet', csv: 'sheet', ods: 'sheet', numbers: 'sheet', tsv: 'data',
  // slides
  ppt: 'slides', pptx: 'slides', key: 'slides', odp: 'slides',
  // archives
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
  bz2: 'archive', xz: 'archive', dmg: 'archive', iso: 'archive', tgz: 'archive',
  // code
  js: 'code', jsx: 'code', ts: 'code', tsx: 'code', py: 'code', rb: 'code', go: 'code',
  rs: 'code', java: 'code', c: 'code', cpp: 'code', h: 'code', hpp: 'code', cs: 'code',
  php: 'code', sh: 'code', bash: 'code', zsh: 'code', swift: 'code', kt: 'code', dart: 'code',
  html: 'code', css: 'code', scss: 'code', sass: 'code', xml: 'code', yaml: 'code',
  yml: 'code', toml: 'code', ini: 'code', sql: 'code', graphql: 'code', lock: 'code',
  // text
  txt: 'text', md: 'text', markdown: 'text', log: 'text', tex: 'text',
  // data
  json: 'data', geojson: 'data', parquet: 'data', db: 'data', sqlite: 'data',
  // fonts
  ttf: 'font', otf: 'font', woff: 'font', woff2: 'font', eot: 'font',
  // executables
  exe: 'exec', msi: 'exec', apk: 'exec', deb: 'exec', rpm: 'exec', bat: 'exec',
  cmd: 'exec', com: 'exec', appimage: 'exec', ipa: 'exec',
};

/** Pick a bucket from a filename (extension wins) then MIME type. */
export function fileBucket(name: string, mimeType?: string): Bucket {
  const dot = name.lastIndexOf('.');
  if (dot !== -1 && dot < name.length - 1) {
    const ext = name.slice(dot + 1).toLowerCase();
    const bucket = EXT_MAP[ext];
    if (bucket) return bucket;
  }
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('zip') || mime.includes('tar') || mime.includes('compressed') || mime.includes('archive')) return 'archive';
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return 'sheet';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'slides';
  if (mime.includes('word') || mime.includes('document')) return 'doc';
  if (mime.includes('json')) return 'data';
  if (mime.startsWith('text/')) return 'text';
  if (mime.includes('javascript') || mime.includes('typescript') || mime.includes('python')) return 'code';
  return 'generic';
}

/** A small colored tile + type icon — the same language in the composer
 *  strip, message cards, and anywhere a file is shown. */
export function FileTypeIcon({ name, mimeType, size = 20, className }: {
  name: string;
  mimeType?: string;
  size?: number;
  className?: string;
}) {
  const bucket = fileBucket(name, mimeType);
  const def = BUCKETS[bucket];
  const Icon = def.icon;
  return (
    <span
      className={cn(
        'flex items-center justify-center rounded-[10px] shrink-0',
        def.bg, def.bgDark, className
      )}
      style={{ width: size * 1.9, height: size * 1.9 }}
      aria-hidden
    >
      <Icon className={def.color} style={{ width: size, height: size }} strokeWidth={2} />
    </span>
  );
}

export { BUCKETS };
