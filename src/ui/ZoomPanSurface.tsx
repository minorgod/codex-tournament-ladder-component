import { useEffect, useMemo, useRef, useState } from "react";
import type { PropsWithChildren } from "react";

import type { Viewport } from "@/engine";

interface SurfaceRenderArgs {
  scale: number;
  offsetX: number;
  offsetY: number;
  viewport: Viewport;
}

export function ZoomPanSurface(
  props: PropsWithChildren<{
    width: number;
    height: number;
    reducedMotion?: boolean;
    onViewportChange?(viewport: Viewport): void;
    children: React.ReactNode | ((args: SurfaceRenderArgs) => React.ReactNode);
  }>,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);

  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(16);
  const [offsetY, setOffsetY] = useState(16);

  const viewport = useMemo<Viewport>(
    () => ({
      x: -offsetX / scale,
      y: -offsetY / scale,
      width: props.width / scale,
      height: props.height / scale,
    }),
    [offsetX, offsetY, props.height, props.width, scale],
  );

  useEffect(() => {
    props.onViewportChange?.(viewport);
  }, [props, viewport]);

  return (
    <div
      ref={hostRef}
      className={`tlc-surface ${props.reducedMotion ? "tlc-reduce-motion" : ""}`}
      style={{ width: "100%", height: props.height, overflow: "hidden", touchAction: "none" }}
      onWheel={(event) => {
        event.preventDefault();
        const next = Math.min(2.2, Math.max(0.45, scale + (event.deltaY > 0 ? -0.08 : 0.08)));
        setScale(next);
      }}
      onPointerDown={(event) => {
        dragRef.current = {
          startX: event.clientX,
          startY: event.clientY,
          offsetX,
          offsetY,
        };
      }}
      onPointerMove={(event) => {
        if (!dragRef.current) {
          return;
        }
        const dx = event.clientX - dragRef.current.startX;
        const dy = event.clientY - dragRef.current.startY;
        setOffsetX(dragRef.current.offsetX + dx);
        setOffsetY(dragRef.current.offsetY + dy);
      }}
      onPointerUp={() => {
        dragRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
    >
      <div
        style={{
          width: props.width,
          height: props.height,
          transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
          transformOrigin: "top left",
          transition: props.reducedMotion ? "none" : "transform 120ms linear",
          position: "relative",
        }}
      >
        {typeof props.children === "function"
          ? props.children({
              scale,
              offsetX,
              offsetY,
              viewport,
            })
          : props.children}
      </div>
    </div>
  );
}
