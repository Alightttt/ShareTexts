import React, { useCallback, useRef, useState } from 'react';

/**
 * DraggableImage — a received image you can DRAG OUT of the browser.
 *
 * Uses the DataTransferItem-based native file drag (Chromium + Safari):
 * on dragstart we stash the File in dataTransfer.items at position 0 and
 * remove the fallback text/data entries, so the drop target receives a real
 * file with its original name — drop it into a file manager, chat app, or
 * Photoshop. The ref carries the blob across the dragstart event's async
 * boundary (dataTransfer.items is unreadable after the handler returns,
 * but the item's own Promise callback can still access it).
 */
export function DraggableImage({
  src,
  name,
  className,
  style,
  onLoad,
  onError,
}: {
  src: string;
  name: string;
  className?: string;
  style?: React.CSSProperties;
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  onError?: () => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [dragState, setDragState] = useState<'idle' | 'dragging'>('idle');

  const onDragStart = useCallback((e: React.DragEvent<HTMLImageElement>) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    const img = imgRef.current;
    if (img) {
      // Normal fetch path: we already hold the decoded bytes.
      img.crossOrigin = 'anonymous';
      fetch(img.src)
        .then((res) => res.blob())
        .then((blob) => {
          const file = blob.type ? blob : new Blob([blob], { type: 'application/octet-stream' });
          const ext = (blob.type.split('/')[1] || 'bin').split('+')[0];
          const fileName = /\.[a-z0-9]{2,5}$/i.test(name) ? name : `${name}.${ext}`;
          const f = 'name' in file ? (file as File) : new File([file], fileName, { type: file.type || 'application/octet-stream' });
          try {
            dt.items.add(f);
            // Remove the auto-added text/plain / text/uri-list entries so
            // drop targets see exactly ONE file payload.
            for (let i = dt.items.length - 1; i >= 1; i--) {
              if (dt.items[i].kind === 'string') dt.items.remove(i);
            }
          } catch { /* Firefox: items.add during dragstart throws — falls back to text drag */ }
          dt.effectAllowed = 'copy';
        })
        .catch(() => { /* offline/dead blob — nothing to drag */ });
    }
    // Keep the URL-string payload too: drop targets that don't support file
    // drags (or Firefox) still get something meaningful.
    dt.setData('text/plain', name);
    dt.setData('text/uri-list', src);
    dt.effectAllowed = 'copy';
    setDragState('dragging');
    e.currentTarget.addEventListener('dragend', () => setDragState('idle'), { once: true });
  }, [src, name]);

  return (
    <img
      ref={imgRef}
      src={src}
      alt={name}
      draggable
      className={className}
      style={style}
      onLoad={onLoad}
      onError={onError}
      onDragStart={onDragStart}
      data-drag-state={dragState}
    />
  );
}
