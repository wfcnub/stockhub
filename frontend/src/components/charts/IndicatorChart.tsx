'use client';

import { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, LineData } from 'lightweight-charts';
import { useTheme } from 'next-themes';
import { getChartThemeColors } from '@/lib/chartTheme';

interface IndicatorChartProps {
  data: LineData[];
  color?: string;
  height?: number;
  title?: string;
}

export default function IndicatorChart({
  data,
  color,
  height = 150,
  title
}: IndicatorChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const themeColors = getChartThemeColors();

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: themeColors.background },
        textColor: themeColors.textColor,
      },
      grid: {
        vertLines: { color: themeColors.gridColor },
        horzLines: { color: themeColors.gridColor },
      },
      width: chartContainerRef.current.clientWidth,
      height,
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
      },
    });

    const series = chart.addLineSeries({
      color: color || themeColors.accentBlue,
      lineWidth: 2,
    });

    series.setData(data);
    chart.timeScale().fitContent();

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, color, height, resolvedTheme]);

  return (
    <div className="w-full">
      {title && (
        <div className="mb-1 text-sm text-gemini-text-secondary">{title}</div>
      )}
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}