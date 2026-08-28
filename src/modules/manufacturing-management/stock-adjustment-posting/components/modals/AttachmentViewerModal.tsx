"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Minimize2,
  Maximize2,
  GripHorizontal,
  Move,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface AttachmentViewerModalProps {
  open: boolean;
  fileUrl: string;
  filename?: string;
  isImage?: boolean;
  onClose: () => void;
}

const MIN_ZOOM = 25;
const MAX_ZOOM = 500;
const ZOOM_STEP = 25;

export function AttachmentViewerModal({
  open,
  fileUrl,
  filename,
  isImage = false,
  onClose,
}: AttachmentViewerModalProps) {
  const [mounted, setMounted] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Modal dialog dragging (moving the window around)
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDraggingWindow, setIsDraggingWindow] = useState(false);
  const windowDragStartRef = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0 });

  // Image pan dragging (click & hold drag on image to pan around on spot)
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });

  const [prevOpenFile, setPrevOpenFile] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Determine if attachment is an image (fallback to true unless explicitly a document)
  const computedIsImage = Boolean(
    isImage ||
    (filename && /\.(png|jpe?g|webp|gif|svg|avif|bmp)$/i.test(filename)) ||
    (fileUrl && /\.(png|jpe?g|webp|gif|svg|avif|bmp)($|\?)/i.test(fileUrl)) ||
    !(filename && /\.(pdf|docx?|xlsx?|csv|txt)$/i.test(filename))
  );

  useEffect(() => {
    queueMicrotask(() => {
      setMounted(true);
    });
  }, []);

  // Reset zoom, rotation, position, pan when a new file opens
  if (open && fileUrl !== prevOpenFile) {
    setPrevOpenFile(fileUrl);
    setZoom(100);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    setPan({ x: 0, y: 0 });
    setIsFullscreen(false);
    setIsMinimized(false);
  }
  if (!open && prevOpenFile !== "") {
    setPrevOpenFile("");
  }

  // Esc to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, handleKeyDown]);

  // Non-passive wheel zoom listener attached to the image viewport container
  useEffect(() => {
    const el = imageContainerRef.current;
    if (!el || !open) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const zoomDelta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      setZoom((prev) => {
        const nextZoom = Math.min(Math.max(prev + zoomDelta, MIN_ZOOM), MAX_ZOOM);
        console.log(`[AttachmentViewer] 🔍 Wheel Zoom: deltaY=${e.deltaY} -> zoom ${prev}% => ${nextZoom}%`);
        return nextZoom;
      });
    };

    el.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleNativeWheel);
    };
  }, [open, mounted, isFullscreen, isMinimized]);

  // React wheel event handler as a secondary fallback
  const handleReactWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const zoomDelta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    setZoom((prev) => {
      const nextZoom = Math.min(Math.max(prev + zoomDelta, MIN_ZOOM), MAX_ZOOM);
      console.log(`[AttachmentViewer] 🔍 React Wheel Zoom: zoom ${prev}% => ${nextZoom}%`);
      return nextZoom;
    });
  };

  // Window Drag Handler (using pointer capture for 100% reliable tracking)
  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, a, input, select")) return;
    if (e.button !== 0 || isFullscreen) return;
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setIsDraggingWindow(true);
    windowDragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: position.x,
      posY: position.y,
    };
    console.log(`[AttachmentViewer] 🪟 Window Drag Start at [${e.clientX}, ${e.clientY}]`);
  };

  const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingWindow) return;
    e.stopPropagation();
    const dx = e.clientX - windowDragStartRef.current.mouseX;
    const dy = e.clientY - windowDragStartRef.current.mouseY;
    const nextX = windowDragStartRef.current.posX + dx;
    const nextY = windowDragStartRef.current.posY + dy;
    setPosition({ x: nextX, y: nextY });
  };

  const handleHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingWindow) return;
    e.stopPropagation();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setIsDraggingWindow(false);
    console.log(`[AttachmentViewer] 🪟 Window Drag End at [${position.x}, ${position.y}]`);
  };

  // Image Pan Drag Handler (using pointer capture to pan image on spot)
  const handleImagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!computedIsImage || e.button !== 0) return;
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setIsPanning(true);
    panStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    console.log(`[AttachmentViewer] 🖱️ Image Pan Start at [${e.clientX}, ${e.clientY}], current pan:`, pan);
  };

  const handleImagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    e.stopPropagation();
    const dx = e.clientX - panStartRef.current.mouseX;
    const dy = e.clientY - panStartRef.current.mouseY;
    const nextX = panStartRef.current.panX + dx;
    const nextY = panStartRef.current.panY + dy;
    setPan({ x: nextX, y: nextY });
  };

  const handleImagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    e.stopPropagation();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setIsPanning(false);
    console.log(`[AttachmentViewer] 🛑 Image Pan End at [${pan.x}, ${pan.y}]`);
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  };

  const zoomIn = () => {
    setZoom((z) => {
      const next = Math.min(z + ZOOM_STEP, MAX_ZOOM);
      console.log(`[AttachmentViewer] 🔍 Zoom In button: ${next}%`);
      return next;
    });
  };

  const zoomOut = () => {
    setZoom((z) => {
      const next = Math.max(z - ZOOM_STEP, MIN_ZOOM);
      console.log(`[AttachmentViewer] 🔍 Zoom Out button: ${next}%`);
      return next;
    });
  };

  const rotateLeft = () => setRotation((r) => r - 90);
  const rotateRight = () => setRotation((r) => r + 90);

  /** Open in a new tab with the image centered on a dark background */
  const openInNewTab = () => {
    if (computedIsImage) {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${filename ?? "Attachment"}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%; height: 100%;
      background: #18181b;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    img {
      max-width: 95vw;
      max-height: 95vh;
      object-fit: contain;
      border-radius: 8px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.6);
    }
  </style>
</head>
<body>
  <img src="${fileUrl}" alt="${filename ?? "Attachment"}" />
</body>
</html>`;
      const newTab = window.open("", "_blank");
      if (newTab) {
        newTab.document.write(html);
        newTab.document.close();
      }
    } else {
      window.open(fileUrl, "_blank", "noopener,noreferrer");
    }
  };

  if (!open || !mounted) return null;

  const isRotated90 = Math.abs(rotation % 180) === 90;

  // Floating Corner PiP Mode
  if (isMinimized) {
    return createPortal(
      <div
        className="fixed bottom-6 right-6 z-[99999] w-80 sm:w-96 shadow-2xl rounded-2xl border border-border bg-background flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200 pointer-events-auto"
        style={{ pointerEvents: "auto" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="false"
        aria-label="Attachment Floating Viewer"
      >
        {/* Floating Header */}
        <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-muted/40 border-b border-border select-none">
          <div className="flex items-center gap-1.5 min-w-0 pointer-events-none">
            <div className="h-6 w-6 shrink-0 bg-primary/10 rounded-md flex items-center justify-center text-primary">
              {computedIsImage ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
            </div>
            <span className="text-xs font-semibold text-foreground truncate" title={filename}>
              {filename || "Attachment"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              title="Expand Viewer"
              className="h-6 w-6 shrink-0 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close (Esc)"
              className="h-6 w-6 shrink-0 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Floating Preview Body */}
        <div className="p-3 bg-muted/20 flex items-center justify-center max-h-56 overflow-hidden">
          {computedIsImage ? (
            <Image
              src={fileUrl}
              alt={filename || "Attachment"}
              width={400}
              height={300}
              unoptimized
              className="rounded-lg object-contain max-h-48 select-none"
              draggable={false}
            />
          ) : (
            <iframe
              src={fileUrl}
              title={filename || "Attachment"}
              className="w-full rounded-lg bg-white h-48 border-none"
            />
          )}
        </div>

        {/* Floating Footer */}
        <div className="px-3 py-2 bg-background border-t border-border flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground font-medium">Corner Preview</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={openInNewTab}
            className="h-7 px-2.5 text-xs gap-1 text-primary hover:text-primary/90 cursor-pointer"
          >
            <ExternalLink className="h-3 w-3" />
            Open Tab
          </Button>
        </div>
      </div>,
      document.body
    );
  }

  // Fullscreen or Floating Draggable Modal
  return createPortal(
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className={`fixed inset-0 z-[99999] flex items-center justify-center pointer-events-auto ${
        isFullscreen ? "bg-black/85" : "bg-black/25"
      } p-4 animate-in fade-in duration-200`}
      style={{ pointerEvents: "auto" }}
      role="dialog"
      aria-modal="true"
      aria-label="Attachment Viewer"
    >
      {/* ── Draggable Card ── */}
      <div
        className={`bg-background rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-border pointer-events-auto ${
          isFullscreen
            ? "fixed inset-2 w-[calc(100vw-1rem)] h-[calc(100vh-1rem)] max-w-none max-h-none rounded-xl"
            : "relative"
        }`}
        style={
          isFullscreen
            ? { transform: "none", pointerEvents: "auto" }
            : {
                width: "min(840px, 95vw)",
                maxHeight: "88vh",
                transform: `translate(${position.x}px, ${position.y}px)`,
                transition: isDraggingWindow ? "none" : "transform 0.1s ease-out",
                pointerEvents: "auto",
              }
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* Draggable Header (Window drag) */}
        <div
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={handleHeaderPointerUp}
          className={`flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border select-none bg-card ${
            !isFullscreen ? (isDraggingWindow ? "cursor-grabbing" : "cursor-grab") : ""
          }`}
        >
          <div className="flex items-center gap-2 min-w-0 pointer-events-none">
            {!isFullscreen && <GripHorizontal className="h-4 w-4 text-muted-foreground/60 shrink-0" />}
            <div className="h-8 w-8 shrink-0 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
              {computedIsImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-foreground truncate" title={filename}>
                {filename || "Attachment"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                Scroll to zoom • Click & hold drag to pan
              </span>
            </div>
          </div>

          <div
            className="flex items-center gap-1.5"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsFullscreen((prev) => !prev);
                setPosition({ x: 0, y: 0 });
                setPan({ x: 0, y: 0 });
              }}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen View"}
              className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>

            {/* Minimize to PiP */}
            {!isFullscreen && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMinimized(true);
                }}
                title="Minimize to Corner (PiP)"
                className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              title="Close (Esc)"
              className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body — interactive zoom & pan viewport (Image drag on spot) */}
        <div
          ref={imageContainerRef}
          onWheel={handleReactWheel}
          onPointerDown={handleImagePointerDown}
          onPointerMove={handleImagePointerMove}
          onPointerUp={handleImagePointerUp}
          className={`flex-1 overflow-hidden flex items-center justify-center p-4 bg-muted/25 select-none relative pointer-events-auto touch-none ${
            computedIsImage ? (isPanning ? "cursor-grabbing" : "cursor-grab") : ""
          } ${isFullscreen ? "h-[calc(100vh-140px)]" : "h-[58vh] min-h-[360px]"}`}
          style={{ pointerEvents: "auto", userSelect: "none" }}
        >
          {computedIsImage ? (
            <div
              className="origin-center select-none"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom / 100})`,
                transition: isPanning ? "none" : "transform 0.12s ease-out",
                maxWidth: isRotated90 ? (isFullscreen ? "85vw" : "70vh") : "100%",
                maxHeight: isRotated90 ? "100%" : isFullscreen ? "80vh" : "55vh",
                userSelect: "none",
                pointerEvents: "none",
              }}
            >
              <Image
                src={fileUrl}
                alt={filename || "Attachment"}
                width={1200}
                height={900}
                unoptimized
                className="rounded-xl shadow-lg object-contain select-none block pointer-events-none"
                style={{
                  maxWidth: isRotated90 ? (isFullscreen ? "85vw" : "70vh") : "100%",
                  maxHeight: isRotated90 ? "100%" : isFullscreen ? "80vh" : "55vh",
                  width: "auto",
                  height: "auto",
                  userSelect: "none",
                }}
                draggable={false}
              />
            </div>
          ) : (
            <div
              className="transition-transform duration-200 ease-out origin-center w-full h-full pointer-events-auto"
              style={{ transform: `scale(${zoom / 100})` }}
            >
              <iframe
                src={fileUrl}
                title={filename || "Attachment"}
                className="w-full h-full rounded-xl shadow-lg bg-white min-h-[400px]"
                style={{ border: "none" }}
              />
            </div>
          )}

          {/* Pan indicator badge if panned */}
          {(pan.x !== 0 || pan.y !== 0) && (
            <div className="absolute top-3 left-3 bg-background/80 backdrop-blur-xs text-[10px] font-mono text-muted-foreground px-2 py-0.5 rounded border border-border flex items-center gap-1 pointer-events-none">
              <Move className="w-3 h-3 text-primary" />
              Pan: {Math.round(pan.x)}px, {Math.round(pan.y)}px
            </div>
          )}
        </div>

        {/* Footer Toolbar */}
        <div
          className="border-t border-border px-5 py-3 flex flex-wrap items-center justify-between gap-3 bg-background shrink-0 select-none pointer-events-auto"
          style={{ pointerEvents: "auto" }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Zoom + Rotate controls */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={rotateLeft}
              title="Rotate Left"
              className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={rotateRight}
              title="Rotate Right"
              className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>

            <div className="w-px h-4 bg-border mx-1" />

            <button
              type="button"
              onClick={zoomOut}
              disabled={zoom <= MIN_ZOOM}
              title="Zoom Out (or scroll wheel down)"
              className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-semibold text-muted-foreground w-12 text-center tabular-nums select-none">
              {zoom}%
            </span>
            <button
              type="button"
              onClick={zoomIn}
              disabled={zoom >= MAX_ZOOM}
              title="Zoom In (or scroll wheel up)"
              className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                setZoom(100);
                setRotation(0);
                setPosition({ x: 0, y: 0 });
                setPan({ x: 0, y: 0 });
                console.log(`[AttachmentViewer] 🔄 Reset zoom & pan to default`);
              }}
              title="Reset Zoom & Pan"
              className="h-8 px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors ml-1 cursor-pointer"
            >
              Reset
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-9 px-5 rounded-lg font-semibold text-sm cursor-pointer"
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={openInNewTab}
              className="h-9 px-5 rounded-lg font-semibold text-sm gap-2 bg-primary hover:bg-primary/90 cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in New Tab
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
