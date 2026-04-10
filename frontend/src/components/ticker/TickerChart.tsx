'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';
import type { MouseEventParams, Time } from 'lightweight-charts';
import { useTheme } from 'next-themes';
import type { ChartDataPoint, TimeRangeValue, DivergenceEvent } from '@/types';
import { TIME_RANGES, MA_PERIOD_OPTIONS } from '@/types';
import { getChartThemeColors } from '@/lib/chartTheme';

type ChartViewMode = 'default' | 'bullish_divergence';

interface TickerChartProps {
  symbol: string;
  data: ChartDataPoint[];
  divergences: DivergenceEvent[];
  isLoading: boolean;
  error: string | null;
  selectedRange: TimeRangeValue;
  selectedMA: number[];
  onRangeChange: (range: TimeRangeValue) => void;
  onMAChange: (periods: number[]) => void;
}

const MA_COLOR_MAP: Record<number, string> = {
  10: 'rgb(254, 215, 170)',
  15: 'rgb(251, 146, 60)',
  20: 'rgb(194, 65, 12)',
  50: 'rgb(191, 219, 254)',
  100: 'rgb(96, 165, 250)',
  200: 'rgb(29, 78, 216)',
};

function getMAColor(period: number, themeColors: ReturnType<typeof getChartThemeColors>): string {
  return MA_COLOR_MAP[period] || themeColors.accentBlue;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function timestampToChartDate(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function dateStringToUnixSeconds(value: string): number {
  return Math.floor(new Date(`${value}T00:00:00Z`).getTime() / 1000);
}

function getDivergenceColors(event: DivergenceEvent): { lineColor: string; boxColorTriplet: string } {
  if (event.strategy_type === 'BULLISH_AGGRESSIVE') {
    return {
      lineColor: 'rgb(250, 204, 21)',
      boxColorTriplet: '250, 204, 21',
    };
  }

  return {
    lineColor: 'rgb(236, 72, 153)',
    boxColorTriplet: '236, 72, 153',
  };
}

interface CursorReadout {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  rsi: number | null;
  maValues: Array<{ period: number; value: number | null }>;
}

function isBusinessDayLike(value: unknown): value is { year: number; month: number; day: number } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { year?: unknown; month?: unknown; day?: unknown };
  return isFiniteNumber(candidate.year) && isFiniteNumber(candidate.month) && isFiniteNumber(candidate.day);
}

function timeToDateKey(value: Time): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return new Date(value * 1000).toISOString().slice(0, 10);
  }

  if (isBusinessDayLike(value)) {
    const month = String(value.month).padStart(2, '0');
    const day = String(value.day).padStart(2, '0');
    return `${value.year}-${month}-${day}`;
  }

  return '';
}

function isOHLCValue(value: unknown): value is { open: number; high: number; low: number; close: number } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as {
    open?: unknown;
    high?: unknown;
    low?: unknown;
    close?: unknown;
  };

  return (
    isFiniteNumber(candidate.open)
    && isFiniteNumber(candidate.high)
    && isFiniteNumber(candidate.low)
    && isFiniteNumber(candidate.close)
  );
}

function isSingleValueData(value: unknown): value is { value: number } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { value?: unknown };
  return isFiniteNumber(candidate.value);
}

function formatDateLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }

  return date.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function formatFixed(value: number, fractionDigits = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function TickerChart({
  symbol,
  data,
  divergences,
  isLoading,
  error,
  selectedRange,
  selectedMA,
  onRangeChange,
  onMAChange,
}: TickerChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const divergenceOverlayRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { resolvedTheme } = useTheme();
  const [viewMode, setViewMode] = useState<ChartViewMode>('default');
  const [cursorReadout, setCursorReadout] = useState<CursorReadout | null>(null);
  const [themeRefreshKey, setThemeRefreshKey] = useState(0);
  const isBullishView = viewMode === 'bullish_divergence';
  const maThemeColors = getChartThemeColors();
  const seriesRef = useRef<{
    candlestick: ISeriesApi<'Candlestick'> | null;
    volume: ISeriesApi<'Histogram'> | null;
    rsi: ISeriesApi<'Line'> | null;
    rsiThresholds: ISeriesApi<'Line'>[];
    ma: Map<number, ISeriesApi<'Line'>>;
  }>({
    candlestick: null,
    volume: null,
    rsi: null,
    rsiThresholds: [],
    ma: new Map(),
  });

  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;

    // Wait for the theme class and CSS variables to settle before rebuilding chart colors.
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        setThemeRefreshKey((value) => value + 1);
      });
    });

    return () => {
      if (raf1) {
        window.cancelAnimationFrame(raf1);
      }
      if (raf2) {
        window.cancelAnimationFrame(raf2);
      }
    };
  }, [resolvedTheme]);

  useEffect(() => {
    if (!chartContainerRef.current || !data.length) return;

    setCursorReadout(null);
    const overlayElement = divergenceOverlayRef.current;
    const seriesStore = seriesRef.current;
    const themeColors = getChartThemeColors();
    const chartHeight = isBullishView ? 620 : 500;
    const dataByDate = new Map(data.map((point) => [point.date, point]));

    const createOverlayLine = (
      overlay: HTMLDivElement,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      lineColor: string,
      lineStyle: 'solid' | 'dashed' | 'dotted',
      lineWidth = 2,
    ) => {
      const lineLength = Math.hypot(x2 - x1, y2 - y1);
      if (lineLength <= 0) {
        return;
      }

      const lineAngle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
      const line = document.createElement('div');
      line.style.position = 'absolute';
      line.style.left = `${x1}px`;
      line.style.top = `${y1}px`;
      line.style.width = `${lineLength}px`;
      line.style.borderTop = `${lineWidth}px ${lineStyle} ${lineColor}`;
      line.style.transformOrigin = '0 0';
      line.style.transform = `rotate(${lineAngle}deg)`;
      overlay.appendChild(line);
    };

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
      height: chartHeight,
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: themeColors.borderColor,
        scaleMargins: isBullishView
          ? {
            top: 0.05,
            bottom: 0.42,
          }
          : {
            top: 0.05,
            bottom: 0.2,
          },
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

    seriesStore.candlestick = candlestickSeries;

    // Add volume series
    const volumeSeries = chart.addHistogramSeries({
      color: themeColors.accentPurple,
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: isBullishView ? 0.88 : 0.8,
        bottom: 0,
      },
      borderVisible: false,
      visible: false,
    });

    seriesStore.volume = volumeSeries;

    if (isBullishView) {
      const rsiSeries = chart.addLineSeries({
        color: themeColors.accentPurple,
        lineWidth: 2,
        priceScaleId: 'rsi',
      });

      chart.priceScale('rsi').applyOptions({
        scaleMargins: {
          top: 0.64,
          bottom: 0.18,
        },
        borderVisible: false,
      });

      const rsiData = data.flatMap((d) => {
        if (!isFiniteNumber(d.indicators.rsi_14)) {
          return [];
        }

        return [{
          time: d.date as string,
          value: d.indicators.rsi_14,
        }];
      });

      rsiSeries.setData(rsiData);
      seriesStore.rsi = rsiSeries;

      const thresholdDefinitions = [
        { value: 30, color: themeColors.positive },
        { value: 50, color: themeColors.muted },
        { value: 70, color: themeColors.negative },
      ];

      const thresholdSeries = thresholdDefinitions.map((threshold) => {
        const thresholdLine = chart.addLineSeries({
          color: threshold.color,
          lineWidth: 1,
          lineStyle: 2,
          priceScaleId: 'rsi',
        });

        thresholdLine.setData(data.map((d) => ({
          time: d.date as string,
          value: threshold.value,
        })));

        return thresholdLine;
      });

      seriesStore.rsiThresholds = thresholdSeries;
    } else {
      seriesStore.rsi = null;
      seriesStore.rsiThresholds = [];
    }

    // Add MA lines
    seriesStore.ma.clear();
    selectedMA.forEach((period) => {
      const maSeries = chart.addLineSeries({
        color: getMAColor(period, themeColors),
        lineWidth: 2,
        priceScaleId: 'right',
      });
      seriesStore.ma.set(period, maSeries);
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
      const maSeries = seriesStore.ma.get(period);
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

    const renderDivergenceOverlay = () => {
      const overlay = overlayElement;
      const candleSeries = seriesStore.candlestick;
      const rsiSeries = seriesStore.rsi;

      if (!overlay || !candleSeries) {
        return;
      }

      overlay.replaceChildren();
      const latestPoint = data[data.length - 1];
      const latestTimestamp = latestPoint ? dateStringToUnixSeconds(latestPoint.date) : null;
      const latestLow = latestPoint && isFiniteNumber(latestPoint.price.low)
        ? latestPoint.price.low
        : null;

      divergences.forEach((event) => {
        if (
          event.strategy_type === 'BULLISH_AGGRESSIVE'
          && latestTimestamp !== null
          && latestLow !== null
          && event.invalidation_level !== null
          && latestTimestamp > event.p2.timestamp
          && latestLow < event.invalidation_level
        ) {
          return;
        }

        const p1Time = timestampToChartDate(event.p1.timestamp);
        const p2Time = timestampToChartDate(event.p2.timestamp);

        const x1 = chart.timeScale().timeToCoordinate(p1Time);
        const x2 = chart.timeScale().timeToCoordinate(p2Time);
        const y1 = candleSeries.priceToCoordinate(event.p1.low);
        const y2 = candleSeries.priceToCoordinate(event.p2.low);
        const { lineColor, boxColorTriplet } = getDivergenceColors(event);
        const lineStyle = event.line_style === 'dotted' ? 'dotted' : 'dashed';

        if (x1 === null || x2 === null || y1 === null || y2 === null) {
          return;
        }

        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const top = Math.min(y1, y2) - 8;
        const height = Math.abs(y2 - y1) + 16;
        const width = Math.max(right - left, 2);

        const backgroundOpacity = event.grade === 'oversold' ? 0.2 : 0.1;

        const box = document.createElement('div');
        box.style.position = 'absolute';
        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
        box.style.width = `${width}px`;
        box.style.height = `${Math.max(height, 8)}px`;
        box.style.borderRadius = '4px';
        box.style.backgroundColor = `rgba(${boxColorTriplet}, ${backgroundOpacity})`;
        box.style.border = `1px ${lineStyle} rgba(${boxColorTriplet}, 0.5)`;
        overlay.appendChild(box);

        createOverlayLine(overlay, x1, y1, x2, y2, lineColor, lineStyle, 2);

        if (
          isBullishView
          && rsiSeries
          && isFiniteNumber(event.p1.rsi_14)
          && isFiniteNumber(event.p2.rsi_14)
        ) {
          const rsiY1 = rsiSeries.priceToCoordinate(event.p1.rsi_14);
          const rsiY2 = rsiSeries.priceToCoordinate(event.p2.rsi_14);

          if (rsiY1 !== null && rsiY2 !== null) {
            createOverlayLine(overlay, x1, rsiY1, x2, rsiY2, lineColor, lineStyle, 2);
          }
        }
      });
    };

    const handleCrosshairMove = (param: MouseEventParams<Time>) => {
      if (!param.point || !param.time) {
        setCursorReadout(null);
        return;
      }

      const dateKey = timeToDateKey(param.time);
      if (!dateKey) {
        setCursorReadout(null);
        return;
      }

      const mappedPoint = dataByDate.get(dateKey);
      if (!mappedPoint) {
        setCursorReadout(null);
        return;
      }

      const candleValue = seriesStore.candlestick
        ? param.seriesData.get(seriesStore.candlestick)
        : undefined;
      const volumeValue = seriesStore.volume
        ? param.seriesData.get(seriesStore.volume)
        : undefined;
      const rsiValue = seriesStore.rsi
        ? param.seriesData.get(seriesStore.rsi)
        : undefined;

      const open = isOHLCValue(candleValue) ? candleValue.open : mappedPoint.price.open;
      const high = isOHLCValue(candleValue) ? candleValue.high : mappedPoint.price.high;
      const low = isOHLCValue(candleValue) ? candleValue.low : mappedPoint.price.low;
      const close = isOHLCValue(candleValue) ? candleValue.close : mappedPoint.price.close;

      const volume = isSingleValueData(volumeValue)
        ? volumeValue.value
        : (isFiniteNumber(mappedPoint.price.volume) ? mappedPoint.price.volume : null);

      const rsiFromPoint = isFiniteNumber(mappedPoint.indicators.rsi_14)
        ? mappedPoint.indicators.rsi_14
        : null;
      const rsi = isSingleValueData(rsiValue) ? rsiValue.value : rsiFromPoint;

      const maValues = selectedMA.map((period) => {
        const maSeries = seriesStore.ma.get(period);
        const maSeriesValue = maSeries ? param.seriesData.get(maSeries) : undefined;
        const maIndicatorKey = `ma_${period}` as keyof ChartDataPoint['indicators'];
        const maFromPoint = mappedPoint.indicators[maIndicatorKey];
        const fallbackValue = isFiniteNumber(maFromPoint) ? maFromPoint : null;

        return {
          period,
          value: isSingleValueData(maSeriesValue) ? maSeriesValue.value : fallbackValue,
        };
      });

      setCursorReadout({
        date: dateKey,
        open,
        high,
        low,
        close,
        volume,
        rsi,
        maValues,
      });
    };

    chart.timeScale().fitContent();
    renderDivergenceOverlay();
    chart.timeScale().subscribeVisibleTimeRangeChange(renderDivergenceOverlay);
    chart.subscribeCrosshairMove(handleCrosshairMove);

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
        renderDivergenceOverlay();
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(renderDivergenceOverlay);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      if (overlayElement) {
        overlayElement.replaceChildren();
      }
      if (chartRef.current === chart) {
        chartRef.current = null;
      }
      seriesStore.candlestick = null;
      seriesStore.volume = null;
      seriesStore.rsi = null;
      seriesStore.rsiThresholds = [];
      seriesStore.ma.clear();
      setCursorReadout(null);
      chart.remove();
    };
  }, [data, selectedMA, themeRefreshKey, divergences, isBullishView]);

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
        <h3 className="text-lg font-semibold text-gemini-text-primary">
          {symbol} {isBullishView ? 'Price + RSI Divergence View' : 'Price Chart'}
        </h3>
        
        <div className="flex flex-wrap gap-4">
          {/* View Selector */}
          <div className="flex gap-1">
            <button
              onClick={() => setViewMode('default')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'default'
                  ? 'bg-gemini-gradient text-white'
                  : 'bg-gemini-bg-secondary/70 text-gemini-text-secondary hover:text-gemini-text-primary hover:bg-gemini-surface-hover'
              }`}
            >
              Default
            </button>
            <button
              onClick={() => setViewMode('bullish_divergence')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'bullish_divergence'
                  ? 'bg-gemini-gradient text-white'
                  : 'bg-gemini-bg-secondary/70 text-gemini-text-secondary hover:text-gemini-text-primary hover:bg-gemini-surface-hover'
              }`}
            >
              Bullish Divergence
            </button>
          </div>

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

      <div className="relative w-full">
        <div ref={chartContainerRef} className="w-full" />
        <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-lg border border-gemini-surface-border/60 bg-gemini-bg-secondary/85 px-3 py-2 text-xs backdrop-blur-sm">
          {cursorReadout ? (
            <div className="space-y-1 text-gemini-text-secondary">
              <div className="font-semibold text-gemini-text-primary">{formatDateLabel(cursorReadout.date)}</div>
              <div>O {formatFixed(cursorReadout.open)} | H {formatFixed(cursorReadout.high)}</div>
              <div>L {formatFixed(cursorReadout.low)} | C {formatFixed(cursorReadout.close)}</div>
              {cursorReadout.rsi !== null && (
                <div className="text-gemini-accent-purple">RSI 14: {formatFixed(cursorReadout.rsi, 2)}</div>
              )}
              {cursorReadout.volume !== null && (
                <div>Vol: {Math.round(cursorReadout.volume).toLocaleString('en-US')}</div>
              )}
              {!!cursorReadout.maValues.length && (
                <div className="flex flex-wrap gap-x-2">
                  {cursorReadout.maValues.map((maValue) => (
                    <span key={maValue.period}>
                      MA {maValue.period}: {maValue.value !== null ? formatFixed(maValue.value) : '-'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-gemini-text-tertiary">Hover chart to inspect price and RSI values</div>
          )}
        </div>
        <div ref={divergenceOverlayRef} className="pointer-events-none absolute inset-0 z-10" />
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4">
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
        <div className="flex items-center gap-2 text-sm text-gemini-text-secondary">
          <div className="h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: 'rgb(236, 72, 153)' }} />
          <span>Non-aggressive divergence</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gemini-text-secondary">
          <div className="h-0.5 w-4 border-t-2 border-dotted" style={{ borderColor: 'rgb(250, 204, 21)' }} />
          <span>Aggressive divergence</span>
        </div>
        {isBullishView && (
          <>
            <div className="flex items-center gap-2 text-sm text-gemini-text-secondary">
              <div className="h-0.5 w-4 rounded" style={{ backgroundColor: maThemeColors.accentPurple }} />
              <span>RSI (14) in shared time view</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gemini-text-secondary">
              <div className="h-0.5 w-4 border-t-2" style={{ borderColor: 'rgb(236, 72, 153)' }} />
              <span>RSI P1 to P2 path (non-aggressive)</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gemini-text-secondary">
              <div className="h-0.5 w-4 border-t-2" style={{ borderColor: 'rgb(250, 204, 21)' }} />
              <span>RSI P1 to P2 path (aggressive)</span>
            </div>
          </>
        )}
        <div className="text-sm text-gemini-text-tertiary">Oversold zones use stronger shading</div>
      </div>
    </div>
  );
}