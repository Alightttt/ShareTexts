import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { FileTypeIcon } from './FileTypeIcon';

interface FlyingFile {
  id: string;
  file: File;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

interface AttachmentFlightProps {
  files: File[];
  fromRect: DOMRect | null;
  toRect: DOMRect | null;
  onComplete: () => void;
}

/**
 * Animates files flying from the attachment panel to the composer strip.
 */
export function AttachmentFlight({ files, fromRect, toRect, onComplete }: AttachmentFlightProps) {
  const [flyingFiles, setFlyingFiles] = useState<FlyingFile[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  
  useEffect(() => {
    if (files.length > 0 && fromRect && toRect) {
      const newFlyingFiles = files.map((file, index) => ({
        id: `flight-${Date.now()}-${index}`,
        file,
        fromX: fromRect.left + fromRect.width / 2,
        fromY: fromRect.top + fromRect.height / 2,
        toX: toRect.left + (index * 100),
        toY: toRect.top + toRect.height / 2,
      }));
      
      setFlyingFiles(newFlyingFiles);
      setIsAnimating(true);
    }
  }, [files, fromRect, toRect]);
  
  const handleFlightComplete = useCallback(() => {
    setIsAnimating(false);
    setFlyingFiles([]);
    onComplete();
  }, [onComplete]);
  
  if (!isAnimating || flyingFiles.length === 0) return null;
  
  return (
    <div>
      {flyingFiles.map((flight, index) => (
        <FlyingFileCard
          key={flight.id}
          file={flight.file}
          fromX={flight.fromX}
          fromY={flight.fromY}
          toX={flight.toX}
          toY={flight.toY}
          delay={index * 0.08}
          onComplete={index === flyingFiles.length - 1 ? handleFlightComplete : undefined}
        />
      ))}
    </div>
  );
}

interface FlyingFileCardProps {
  file: File;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  delay?: number;
  onComplete?: () => void;
}

const FlyingFileCard: React.FC<FlyingFileCardProps> = ({ file, fromX, fromY, toX, toY, delay = 0, onComplete }) => {
  const isImage = file.type.startsWith('image/');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  useEffect(() => {
    if (isImage) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file, isImage]);
  
  return (
    <motion.div
      initial={{
        x: fromX - 40,
        y: fromY - 40,
        scale: 1,
        opacity: 1,
      }}
      animate={{
        x: toX - 40,
        y: toY - 40,
        scale: 0.6,
        opacity: [1, 1, 0.8, 0],
      }}
      exit={{ opacity: 0 }}
      transition={{
        duration: 0.5,
        delay,
        ease: [0.32, 0.72, 0, 1],
      }}
      onAnimationComplete={onComplete}
      className="fixed z-[100] pointer-events-none"
      style={{ left: 0, top: 0 }}
    >
      <div className={cn(
        "w-20 h-20 rounded-xl overflow-hidden shadow-2xl",
        "border border-white/20",
        isImage ? "bg-black" : "bg-white dark:bg-[#1a1a22]"
      )}>
        {isImage && previewUrl ? (
          <img
            src={previewUrl}
            alt={file.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-1">
            <FileTypeIcon name={file.name} mimeType={file.type} size={24} />
            <span className="text-[8px] text-apple-ink-muted mt-1 truncate max-w-full px-1">
              {file.name}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
};
