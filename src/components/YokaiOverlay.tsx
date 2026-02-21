import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { usePathname } from 'next/navigation';
import styles from './YokaiOverlay.module.css';

type OverlayFigure = {
  id: string;
  src: string;
  left: number;
  top: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
  driftX: number;
  driftY: number;
  returnX: number;
  returnY: number;
  rotation: number;
  scale: number;
};

type OverlayFigureStyle = CSSProperties & {
  '--yokai-left': string;
  '--yokai-top': string;
  '--yokai-size': string;
  '--yokai-opacity': string;
  '--yokai-duration': string;
  '--yokai-delay': string;
  '--yokai-drift-x': string;
  '--yokai-drift-y': string;
  '--yokai-return-x': string;
  '--yokai-return-y': string;
  '--yokai-rotation': string;
  '--yokai-scale': string;
};

const YOKAI_IMAGES = [
  '/image/yokai/yokai-01.svg',
  '/image/yokai/yokai-02.svg',
  '/image/yokai/yokai-03.svg',
  '/image/yokai/yokai-04.svg',
  '/image/yokai/yokai-05.svg',
  '/image/yokai/yokai-06.svg',
];

function random(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getFigureCount(width: number) {
  if (width < 768) return 3;
  if (width <= 1024) return 5;
  return 6;
}

function pickEdgeValue(
  minEdge: number,
  maxEdge: number,
  edgeStrength = 0.86,
) {
  const edgeWidth = (maxEdge - minEdge) * 0.2;
  const isOuter = Math.random() < edgeStrength;
  if (isOuter) {
    return Math.random() < 0.5
      ? random(minEdge, minEdge + edgeWidth)
      : random(maxEdge - edgeWidth, maxEdge);
  }
  return random(minEdge + edgeWidth, maxEdge - edgeWidth);
}

export default function YokaiOverlay() {
  const [figures, setFigures] = useState<OverlayFigure[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const pathname = usePathname();

  const buildFigures = useCallback((): OverlayFigure[] => {
    if (typeof window === 'undefined') return [];

    const width = window.innerWidth;
    const height = window.innerHeight;
    const density = getFigureCount(width);
    const minDim = Math.min(width, height);

    const figureSize = {
      min: width < 768 ? 52 : width <= 1024 ? 64 : 72,
      max: width < 768 ? 106 : width <= 1024 ? 130 : 140,
    };

    return Array.from({ length: density }, (_, index) => {
      const baseSize = random(figureSize.min, figureSize.max);
      const size = clamp(
        baseSize * (width < 768 ? 0.8 : 1),
        figureSize.min,
        figureSize.max,
      );
      const driftX = random(-12, 12);
      const driftY = random(-18, 18);
      const returnX = driftX * -1;
      const returnY = driftY * -1;
      const opacity = random(0.32, 0.52);
      const duration = random(width < 768 ? 6 : 7, width <= 1024 ? 13 : 16);
      const delay = random(-width * 0.01, 8);
      const rotation = random(-8, 8);
      const scale = random(0.75, 1.08);

      const safeWidth = clamp((100 * 0.96) - (size / minDim * 100), 6, 94);
      const safeHeight = clamp((100 * 0.94) - (size / minDim * 100), 6, 94);
      const left = pickEdgeValue(4, safeWidth, 0.9);
      const top = pickEdgeValue(4, safeHeight, 0.86);

      return {
        id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        src: YOKAI_IMAGES[index % YOKAI_IMAGES.length],
        left,
        top,
        size,
        opacity: Number(opacity.toFixed(2)),
        duration: Number(duration.toFixed(2)),
        delay: Number(delay.toFixed(2)),
        driftX: Number(driftX.toFixed(1)),
        driftY: Number(driftY.toFixed(1)),
        returnX: Number(returnX.toFixed(1)),
        returnY: Number(returnY.toFixed(1)),
        rotation: Number(rotation.toFixed(1)),
        scale: Number(scale.toFixed(2)),
      };
    });
  }, []);

  const triggerFallback = useCallback(() => {
    const hasScrollable = document.documentElement.scrollHeight - window.innerHeight > 8;
    const threshold = window.innerHeight * 0.42;
    setIsActive((prev) => {
      const next = hasScrollable ? window.scrollY > threshold : true;
      return prev === next ? prev : next;
    });
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const refreshMotion = () => setReducedMotion(mediaQuery.matches);
    queueMicrotask(refreshMotion);

    const handleMotion = refreshMotion;

    mediaQuery.addEventListener('change', handleMotion);
    const refreshFigures = () => setFigures(buildFigures());

    refreshFigures();
    window.addEventListener('resize', refreshFigures, { passive: true });

    return () => {
      mediaQuery.removeEventListener('change', handleMotion);
      window.removeEventListener('resize', refreshFigures);
    };
  }, [buildFigures]);

  useEffect(() => {
    const zones = Array.from(document.querySelectorAll<HTMLElement>('[data-yokai-zone]'));

    if (zones.length > 0) {
      const observer = new IntersectionObserver((entries) => {
        const anyVisible = entries.some((entry) => entry.isIntersecting);
        setIsActive((prev) => (prev === anyVisible ? prev : anyVisible));
      }, {
        threshold: [0.1, 0.35, 0.7],
        rootMargin: '0px 0px -35% 0px',
      });

      zones.forEach((node) => observer.observe(node));

      return () => observer.disconnect();
    }

    queueMicrotask(triggerFallback);
    window.addEventListener('scroll', triggerFallback, { passive: true });
    window.addEventListener('resize', triggerFallback, { passive: true });

    return () => {
      window.removeEventListener('scroll', triggerFallback);
      window.removeEventListener('resize', triggerFallback);
    };
  }, [triggerFallback, pathname]);

  const classes = useMemo(() => {
    const list = [styles.overlay];
    if (isActive) list.push(styles.active);
    if (reducedMotion) list.push(styles.reducedMotion);
    return list.join(' ');
  }, [isActive, reducedMotion]);

  if (figures.length === 0) return null;

  return (
    <div className={classes}>
      {figures.map((figure) => (
        <img
          key={figure.id}
          className={styles.figure}
          src={figure.src}
          alt="yokai silhouette"
          loading="lazy"
          style={{
            '--yokai-left': `${figure.left}vw`,
            '--yokai-top': `${figure.top}vh`,
            '--yokai-size': `${figure.size}px`,
            '--yokai-opacity': `${figure.opacity}`,
            '--yokai-duration': `${figure.duration}s`,
            '--yokai-delay': `${figure.delay}s`,
            '--yokai-drift-x': `${figure.driftX}px`,
            '--yokai-drift-y': `${figure.driftY}px`,
            '--yokai-return-x': `${figure.returnX}px`,
            '--yokai-return-y': `${figure.returnY}px`,
            '--yokai-rotation': `${figure.rotation}deg`,
            '--yokai-scale': `${figure.scale}`,
          } as OverlayFigureStyle}
        />
      ))}
    </div>
  );
}
