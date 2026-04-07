'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';
import { useTheme } from 'next-themes';
import type { ChartDataPoint, TimeRangeValue } from '@/types';
import { TIME_RANGES, MA_PERIOD_OPTIONS } from '@/types';
import { getChartThemeColors } from '@/lib/chartTheme';

interface TickerChartProps {
  symbol: string;
  data: ChartDataPoint[];
  isLoading: boolean;
  error: string | null;
  selectedRange: TimeRangeValue;
  selectedMA: number[];
  onRangeChange: (range: TimeRangeValue) => void;
  onMAChange: (periods: number[]) => void;
}

function getMAColor(period: number, themeColors: ReturnType<typeof getChartThemeColors>): string {
  if (period === 20) return themeColors.accentPurple;
  if (period === 50) return themeColors.accentOrange;
  if (period === 200) return themeColors.positive;
  return themeColors.accentBlue;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function TickerChart({
  symbol,
  data,
  isLoading,
  error,
  selectedRange,
  selectedMA,
  onRangeChange,
  onMAChange,
}: TickerChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { resolvedTheme } = useTheme();
  const maThemeColors = getChartThemeColors();
  const seriesRef = useRef<{
    candlestick: ISeriesApi<'Candlestick'> | null;
    volume: ISeriesApi<'Histogram'> | null;
    ma: Map<number, ISeriesApi<'Line'>>;
  }>({
    candlestick: null,
    volume: null,
    ma: new Map(),
  });

  useEffect(() => {
    if (!chartContainerRef.current || !data.length) return;

    const themeColors = getChartThemeColors();

    // Create chart
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
      height: 500,
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: themeColors.borderColor,
      },
      timeScale: {
        borderColor: themeColors.borderColor,
        timeVisible: true,
      },
    });

    chartRef.current = chart;

    // Add candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: themeColors.positive,
      downColor: themeColors.negative,
      borderDownColor: themeColors.negative,
      borderUpColor: themeColors.positive,
      wickDownColor: themeColors.negative,
      wickUpColor: themeColors.positive,
    });

    seriesRef.current.candlestick = candlestickSeries;

    // Add volume series
    const volumeSeries = chart.addHistogramSeries({
      color: themeColors.accentPurple,
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    seriesRef.current.volume = volumeSeries;

    // Add MA lines
    seriesRef.current.ma.clear();
    selectedMA.forEach((period) => {
      const maSeries = chart.addLineSeries({
        color: getMAColor(period, themeColors),
        lineWidth: 2,
      });
      seriesRef.current.ma.set(period, maSeries);
    });

    // Transform data for chart
    const candleData = data
      .filter(
        (d) =>
          isFiniteNumber(d.price.open) &&
          isFiniteNumber(d.price.high) &&
          isFiniteNumber(d.price.low) &&
          isFiniteNumber(d.price.close)
      )
      .map((d) => ({
        time: d.date as string,
        open: d.price.open,
        high: d.price.high,
        low: d.price.low,
        close: d.price.close,
      }));

    const volumeData = data.map((d) => ({
      time: d.date as string,
      value: isFiniteNumber(d.price.volume) ? d.price.volume : 0,
      color: d.price.close >= d.price.open ? themeColors.volumeUp : themeColors.volumeDown,
    }));

    candlestickSeries.setData(candleData);
    volumeSeries.setData(volumeData);

    // Add MA data
    selectedMA.forEach((period) => {
      const maKey = `ma_${period}` as keyof typeof data[0]['indicators'];
      const maSeries = seriesRef.current.ma.get(period);
      if (maSeries) {
        const maData = data.flatMap((d) => {
          const maValue = d.indicators[maKey];
          if (!isFiniteNumber(maValue)) {
            return [];
          }

          return [{
            time: d.date as string,
            value: maValue,
          }];
        });
        maSeries.setData(maData);
      }
    });

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
      if (chartRef.current === chart) {
        chartRef.current = null;
      }
      seriesRef.current.candlestick = null;
      seriesRef.current.volume = null;
      seriesRef.current.ma.clear();
      chart.remove();
    };
  }, [data, selectedMA, resolvedTheme]);

  const toggleMA = (period: number) => {
    if (selectedMA.includes(period)) {
      onMAChange(selectedMA.filter((p) => p !== period));
    } else {
      onMAChange([...selectedMA, period]);
    }
  };

  if (isLoading) {
    return (
      <div className="hud-panel p-4">
        <div className="animate-pulse">
          <div className="mb-4 h-6 w-1/4 rounded bg-gemini-bg-secondary/80"></div>
          <div className="h-96 rounded bg-gemini-bg-secondary/80"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="hud-panel p-4">
        <div
          className="inline-flex max-w-full items-center gap-2 rounded-full border border-gemini-accent-red/30 bg-gemini-accent-red/10 px-3 py-1.5 text-xs font-semibold text-gemini-accent-red"
          title={error}
        >
          <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="truncate">Failed to load chart data</span>
        </div>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="hud-panel p-4">
        <p className="text-gemini-text-secondary">No chart data available</p>
      </div>
    );
  }

  return (
    <div className="hud-panel p-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <h3 className="text-lg font-semibold text-gemini-text-primary">{symbol} Price Chart</h3>
        
        <div className="flex flex-wrap gap-4">
          {/* Time Range Selector */}
          <div className="flex gap-1">
            {TIME_RANGES.map((range) => (
              <button
                key={range.value}
                onClick={() => onRangeChange(range.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  selectedRange === range.value
                    ? 'bg-gemini-gradient text-white'
                    : 'bg-gemini-bg-secondary/70 text-gemini-text-secondary hover:text-gemini-text-primary hover:bg-gemini-surface-hover'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>

          {/* MA Selector */}
          <div className="flex gap-1">
            {MA_PERIOD_OPTIONS.map((ma) => (
              <button
                key={ma.value}
                onClick={() => toggleMA(ma.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  selectedMA.includes(ma.value)
                    ? 'bg-gemini-bg-secondary/80 text-gemini-text-primary border-b-2'
                    : 'bg-gemini-bg-secondary/70 text-gemini-text-tertiary hover:text-gemini-text-secondary'
                }`}
                style={{
                  borderBottom: selectedMA.includes(ma.value)
                    ? `2px solid ${getMAColor(ma.value, maThemeColors)}`
                    : 'none',
                }}
              >
                {ma.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div ref={chartContainerRef} className="w-full" />

      {/* Legend */}
      {selectedMA.length > 0 && (
        <div className="flex gap-4 mt-4">
          {selectedMA.map((period) => (
            <div
              key={period}
              className="flex items-center gap-2 text-sm text-gemini-text-secondary"
            >
              <div
                className="w-3 h-0.5 rounded"
                style={{ backgroundColor: getMAColor(period, maThemeColors) }}
              />
              <span>MA {period}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}