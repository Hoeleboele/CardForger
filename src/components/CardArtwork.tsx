import { memo, useEffect, useRef, useState } from "react";
import type { Card, Project } from "../model";
import { renderCardCanvas } from "../render";

type Props = { card: Card; project: Project; className?: string; scale?: number };

function CardArtworkView({ card, project, className = "", scale = 1 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const template = project.templates.find((item) => item.id === card.templateId) ?? project.templates[0];
  const set = project.sets.find((item) => item.id === card.setId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let current = true;
    const ratio = Math.min(2, scale * (window.devicePixelRatio || 1));
    void renderCardCanvas(card, project, ratio).then((rendered) => {
      const canvas = canvasRef.current;
      if (!current || !canvas) return;
      canvas.width = rendered.width;
      canvas.height = rendered.height;
      canvas.getContext("2d")!.drawImage(rendered, 0, 0);
    });
    return () => {
      current = false;
    };
    // Only redraw when data that affects this card changes, not on every workspace edit.
  }, [visible, card, template, set, project.assets, scale]);

  return (
    <canvas
      ref={canvasRef}
      width={420}
      height={588}
      className={`card-artwork ${className}`}
      role="img"
      aria-label={`${card.name} card preview`}
    />
  );
}

export const CardArtwork = memo(
  CardArtworkView,
  (previous, next) =>
    previous.card === next.card &&
    previous.className === next.className &&
    previous.scale === next.scale &&
    previous.project.assets === next.project.assets &&
    previous.project.templates.find((item) => item.id === previous.card.templateId) ===
      next.project.templates.find((item) => item.id === next.card.templateId) &&
    previous.project.sets.find((item) => item.id === previous.card.setId) ===
      next.project.sets.find((item) => item.id === next.card.setId),
);
