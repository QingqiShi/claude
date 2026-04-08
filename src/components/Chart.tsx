'use client';

import { useRef, useEffect } from 'react';

interface DataPoint {
  label: string;
  value: number;
}

interface ChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  color?: string;
}

export function Chart({ data, width = 400, height = 200, color = '#3b82f6' }: ChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    const maxValue = Math.max(...data.map((d) => d.value));
    const barWidth = (width - 40) / data.length;
    const chartHeight = height - 40;

    data.forEach((point, index) => {
      const barHeight = (point.value / maxValue) * chartHeight;
      const x = 20 + index * barWidth;
      const y = height - 20 - barHeight;

      ctx.fillStyle = color;
      ctx.fillRect(x + 2, y, barWidth - 4, barHeight);

      ctx.fillStyle = '#666';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(point.label, x + barWidth / 2, height - 5);
    });
  }, [data, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      role="img"
      aria-label={`Bar chart with ${data.length} data points`}
    />
  );
}
