'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi } from 'lightweight-charts';
import { useTheme } from 'next-themes';
import { getChartThemeColors } from '@/lib/chartTheme';

interface PriceData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface PriceChartProps {
  data: PriceData[];
  symbol: string;
}

export default function PriceChart({ data, symbol }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [timeRange, setTimeRange] = useState<'1M' | '3M' | '6M' | '1Y' | 'ALL'>('1Y');
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const themeColors = getChartThemeColors();

    // Clear previous chart
    if (chartRef.current) {
      chartRef.current.remove();
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: themeColors.background },
        textColor: themeColors.textColor,
      },
      grid: {
        vertLines: { color: themeColors.gridColor },
        horzLines: { color: themeColors.gridColor },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
    });

    chartRef.current = chart;

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: themeColors.positive,
      downColor: themeColors.negative,
      borderDownColor: themeColors.negative,
      borderUpColor: themeColors.positive,
      wickDownColor: themeColors.negative,
      wickUpColor: themeColors.positive,
    });

    // Filter data based on time range
    const now = new Date();
    let filteredData = data;

    if (timeRange !== 'ALL') {
      const daysBack = {
        '1M': 30,
        '3M': 90,
        '6M': 180,
        '1Y': 365,
      }[timeRange] || 365;

      const cutoffDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
      filteredData = data.filter(d => new Date(d.time) >= cutoffDate);
    }

    candlestickSeries.setData(filteredData);

    chart.timeScale().fitContent();

    // Handle resize
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
  }, [data, timeRange, resolvedTheme]);

  return (
    <div className="hud-panel p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gemini-text-primary">{symbol} Price Chart</h3>
        <div className="flex gap-2">
          {(['1M', '3M', '6M', '1Y', 'ALL'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 rounded text-sm ${
                timeRange === range
                  ? 'bg-gemini-gradient text-white'
                  : 'bg-gemini-bg-secondary/70 text-gemini-text-secondary hover:bg-gemini-surface-hover hover:text-gemini-text-primary'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}