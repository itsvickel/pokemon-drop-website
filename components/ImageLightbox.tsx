import { useCallback, useEffect, useRef, useState } from "react";
import styles from "../styles/ImageLightbox.module.css";

type Props = {
  src: string;
  alt: string;
  onClose: () => void;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

/**
 * Full-screen image viewer: click the image (or +/−, scroll wheel) to zoom,
 * drag to pan while zoomed, Esc / backdrop / ✕ to close.
 */
export default function ImageLightbox({ src, alt, onClose }: Props) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const movedRef = useRef(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") zoomBy(ZOOM_STEP);
      if (e.key === "-") zoomBy(-ZOOM_STEP);
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const zoomBy = useCallback((delta: number) => {
    setZoom((prev) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta));
      if (next === MIN_ZOOM) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  function handleWheel(e: React.WheelEvent) {
    zoomBy(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (zoom === 1) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    movedRef.current = false;
    dragState.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y };
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragState.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) movedRef.current = true;
    setOffset({ x: drag.baseX + dx, y: drag.baseY + dy });
  }

  function handlePointerUp() {
    dragState.current = null;
  }

  function handleImageClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (movedRef.current) {
      movedRef.current = false;
      return; // was a drag, not a click
    }
    // Click toggles between fit and 2× (and back from any zoom level)
    if (zoom > 1) {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    } else {
      setZoom(2);
    }
  }

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      onWheel={handleWheel}
      role="dialog"
      aria-modal="true"
      aria-label={`Image viewer: ${alt}`}
    >
      <div className={styles.toolbar} onClick={(e) => e.stopPropagation()}>
        <button className={styles.toolBtn} onClick={() => zoomBy(-ZOOM_STEP)} aria-label="Zoom out" type="button">−</button>
        <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
        <button className={styles.toolBtn} onClick={() => zoomBy(ZOOM_STEP)} aria-label="Zoom in" type="button">+</button>
        <button className={`${styles.toolBtn} ${styles.closeBtn}`} onClick={onClose} aria-label="Close" type="button">✕</button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={`${styles.image} ${zoom > 1 ? styles.imageZoomed : ""}`}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
        onClick={handleImageClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        draggable={false}
      />
      <p className={styles.hint}>Click image to zoom · scroll to zoom · drag to pan · Esc to close</p>
    </div>
  );
}
