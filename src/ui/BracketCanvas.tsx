import { useEffect, useRef } from "react";

import type { BracketNodeLayout } from "@/engine";

export function BracketCanvas(props: {
  width: number;
  height: number;
  nodes: BracketNodeLayout[];
  edges: Array<{ x1: number; y1: number; x2: number; y2: number }>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, props.width, props.height);
    ctx.strokeStyle = "#8ba4bc";
    ctx.lineWidth = 1.25;
    props.edges.forEach((edge) => {
      ctx.beginPath();
      ctx.moveTo(edge.x1, edge.y1);
      ctx.lineTo(edge.x2, edge.y2);
      ctx.stroke();
    });

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#32475b";
    props.nodes.forEach((node) => {
      ctx.fillRect(node.x, node.y, node.width, node.height);
      ctx.strokeRect(node.x, node.y, node.width, node.height);
    });
  }, [props.edges, props.height, props.nodes, props.width]);

  return <canvas ref={canvasRef} width={props.width} height={props.height} />;
}
