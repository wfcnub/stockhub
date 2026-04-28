'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';
import type { MouseEventParams, Time } from 'lightweight-charts';
import { useTheme } from 'next-themes';
import type { ChartDataPoint, TimeRangeValue, DivergenceEvent, TriangleEvent } from '@/types';
import { TIME_RANGES, MA_PERIOD_OPTIONS } from '@/types';
import { getChartThemeColors } from '@/lib/chartTheme';

type ChartViewMode = 'default' | 'bullish_divergence' | 'triangle_patterns';

interface TickerChartProps {
  symbol: string;
  data: ChartDataPoint[];
  divergences: DivergenceEvent[];
  triangles: TriangleEvent[];
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

// Threshold for considering a divergence "historical" (60 trading bars old)
const MAX_LOOKBACK_BARS = 60;

function isHistoricalDivergence(event: DivergenceEvent, data: ChartDataPoint[]): boolean {
  if (data.length === 0) return false;
  
  const signalTimestamp = event.signal_timestamp;
  let signalIndex = -1;
  
  for (let i = 0; i < data.length; i++) {
    if (dateStringToUnixSeconds(data[i].date) === signalTimestamp) {
      signalIndex = i;
      break;
    }
  }
  
  if (signalIndex === -1) return false;
  
  const barsAgo = data.length - 1 - signalIndex;
  return barsAgo >= MAX_LOOKBACK_BARS;
}

function getDivergenceColors(event: DivergenceEvent): { lineColor: string; boxColorTriplet: string } {
  if (event.strategy_type === 'BULLISH_AGGRESSIVE') {
    return {
      lineColor: 'rgb(250, 204, 21)',
      boxColorTriplet: '250, 204, 21',
    };
  }

  if (event.strategy_type === 'BULLISH_EMERGING') {
    return {
      lineColor: 'rgb(147, 51, 234)',
      boxColorTriplet: '147, 51, 234',
    };
  }

  // BULLISH_CONFIRMED (default)
  return {
    lineColor: 'rgb(236, 72, 153)',
    boxColorTriplet: '236, 72, 153',
  };
}

function getTriangleColorTriplet(event: TriangleEvent): string {
  if (event.state === 'potential') {
    return '6, 182, 212';
  }

  if (event.breakout_direction === 'bearish') {
    return '239, 68, 68';
  }

  return '34, 197, 94';
}

function getTriangleLineWidth(confidenceLevel: TriangleEvent['confidence_level']): number {
  if (confidenceLevel === 'high') {
    return 3;
  }

  if (confidenceLevel === 'medium') {
    return 2.4;
  }

  return 2;
}

function getTriangleSignalPrice(event: TriangleEvent): number {
  if (event.state === 'breakout') {
    if (event.breakout_direction === 'bullish') {
      return event.upper_line.end_price;
    }
    if (event.breakout_direction === 'bearish') {
      return event.lower_line.end_price;
    }
  }

  return (event.upper_line.end_price + event.lower_line.end_price) / 2;
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

const CLIP_LEFT = 1;
const CLIP_RIGHT = 2;
const CLIP_BOTTOM = 4;
const CLIP_TOP = 8;

interface ClippedLineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function getClipOutCode(
  x: number,
  y: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): number {
  let code = 0;

  if (x < minX) {
    code |= CLIP_LEFT;
  } else if (x > maxX) {
    code |= CLIP_RIGHT;
  }

  if (y < minY) {
    code |= CLIP_TOP;
  } else if (y > maxY) {
    code |= CLIP_BOTTOM;
  }

  return code;
}

function clipLineToRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): ClippedLineSegment | null {
  let currentX1 = x1;
  let currentY1 = y1;
  let currentX2 = x2;
  let currentY2 = y2;

  let outCode1 = getClipOutCode(currentX1, currentY1, minX, minY, maxX, maxY);
  let outCode2 = getClipOutCode(currentX2, currentY2, minX, minY, maxX, maxY);

  while (true) {
    if (!(outCode1 | outCode2)) {
      return {
        x1: currentX1,
        y1: currentY1,
        x2: currentX2,
        y2: currentY2,
      };
    }

    if (outCode1 & outCode2) {
      return null;
    }

    const outCodeOut = outCode1 || outCode2;
    let nextX = 0;
    let nextY = 0;

    if (outCodeOut & CLIP_TOP) {
      if (currentY2 === currentY1) {
        return null;
      }

      nextX = currentX1 + ((currentX2 - currentX1) * (minY - currentY1)) / (currentY2 - currentY1);
      nextY = minY;
    } else if (outCodeOut & CLIP_BOTTOM) {
      if (currentY2 === currentY1) {
        return null;
      }

      nextX = currentX1 + ((currentX2 - currentX1) * (maxY - currentY1)) / (currentY2 - currentY1);
      nextY = maxY;
    } else if (outCodeOut & CLIP_RIGHT) {
      if (currentX2 === currentX1) {
        return null;
      }

      nextY = currentY1 + ((currentY2 - currentY1) * (maxX - currentX1)) / (currentX2 - currentX1);
      nextX = maxX;
    } else {
      if (currentX2 === currentX1) {
        return null;
      }

      nextY = currentY1 + ((currentY2 - currentY1) * (minX - currentX1)) / (currentX2 - currentX1);
      nextX = minX;
    }

    if (outCodeOut === outCode1) {
      currentX1 = nextX;
      currentY1 = nextY;
      outCode1 = getClipOutCode(currentX1, currentY1, minX, minY, maxX, maxY);
    } else {
      currentX2 = nextX;
      currentY2 = nextY;
      outCode2 = getClipOutCode(currentX2, currentY2, minX, minY, maxX, maxY);
    }
  }
}

export function TickerChart({
  symbol,
  data,
  divergences,
  triangles,
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
  const queueOverlayRenderRef = useRef<(() => void) | null>(null);
  const showInvalidatedAggressiveRef = useRef(false);
  const showHistoricalDivergencesRef = useRef(false);
  const showEmergingRef = useRef(true);
  const { resolvedTheme } = useTheme();
  const [viewMode, setViewMode] = useState<ChartViewMode>('default');
  const [showInvalidatedAggressive, setShowInvalidatedAggressive] = useState(false);
  const [showHistoricalDivergences, setShowHistoricalDivergences] = useState(false);
  const [showEmerging, setShowEmerging] = useState(true);
  const [cursorReadout, setCursorReadout] = useState<CursorReadout | null>(null);
  const [themeRefreshKey, setThemeRefreshKey] = useState(0);
  const isBullishView = viewMode === 'bullish_divergence';
  const isTriangleView = viewMode === 'triangle_patterns';
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
      const maxX = overlay.clientWidth;
      const maxY = overlay.clientHeight;

      if (maxX <= 0 || maxY <= 0) {
        return;
      }

      const clippedLine = clipLineToRect(x1, y1, x2, y2, 0, 0, maxX, maxY);

      if (!clippedLine) {
        return;
      }

      const lineLength = Math.hypot(clippedLine.x2 - clippedLine.x1, clippedLine.y2 - clippedLine.y1);
      if (lineLength <= 0) {
        return;
      }

      const lineAngle = Math.atan2(clippedLine.y2 - clippedLine.y1, clippedLine.x2 - clippedLine.x1) * (180 / Math.PI);
      const line = document.createElement('div');
      line.style.position = 'absolute';
      line.style.left = `${clippedLine.x1}px`;
      line.style.top = `${clippedLine.y1}px`;
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
      const overlayWidth = overlay.clientWidth;
      const overlayHeight = overlay.clientHeight;

      if (overlayWidth <= 0 || overlayHeight <= 0) {
        return;
      }

      const isAggressiveInvalidated = (event: DivergenceEvent): boolean => {
        const invalidationLevel = event.invalidation_level;

        if (event.strategy_type !== 'BULLISH_AGGRESSIVE' || !isFiniteNumber(invalidationLevel)) {
          return false;
        }

        return data.some((point) => {
          const pointTimestamp = dateStringToUnixSeconds(point.date);
          return (
            pointTimestamp > event.p2.timestamp
            && isFiniteNumber(point.price.low)
            && point.price.low <= invalidationLevel
          );
        });
      };

      divergences.forEach((event) => {
        const isInvalidatedAggressiveEvent = isAggressiveInvalidated(event);
        const isHistoricalEvent = isHistoricalDivergence(event, data);
        const isEmergingEvent = event.strategy_type === 'BULLISH_EMERGING';
        
        // Skip if invalidated and not showing, or if historical and not showing, or if emerging and not showing
        if (isInvalidatedAggressiveEvent && !showInvalidatedAggressiveRef.current) {
          return;
        }
        if (isHistoricalEvent && !showHistoricalDivergencesRef.current) {
          return;
        }
        if (isEmergingEvent && !showEmergingRef.current) {
          return;
        }

        const p1Time = timestampToChartDate(event.p1.timestamp);
        const p2Time = timestampToChartDate(event.p2.timestamp);

        const x1 = chart.timeScale().timeToCoordinate(p1Time);
        const x2 = chart.timeScale().timeToCoordinate(p2Time);
        const y1 = candleSeries.priceToCoordinate(event.p1.low);
        const y2 = candleSeries.priceToCoordinate(event.p2.low);
        const { lineColor, boxColorTriplet } = getDivergenceColors(event);
        
        // Determine styling based on invalidated/historical status
        let renderedLineColor = lineColor;
        if (isInvalidatedAggressiveEvent) {
          renderedLineColor = `rgba(${boxColorTriplet}, 0.55)`;
        } else if (isHistoricalEvent) {
          // Historical divergences: gray color with reduced opacity
          renderedLineColor = `rgba(128, 128, 128, 0.5)`;
        }
        
        const lineStyle = event.line_style === 'dotted' ? 'dotted' : 'dashed';

        if (x1 === null || x2 === null || y1 === null || y2 === null) {
          return;
        }

        const rawLeft = Math.min(x1, x2);
        const rawRight = Math.max(x1, x2);
        const rawTop = Math.min(y1, y2) - 8;
        const rawBottom = Math.max(y1, y2) + 8;

        const left = Math.max(rawLeft, 0);
        const right = Math.min(rawRight, overlayWidth);
        const top = Math.max(rawTop, 0);
        const bottom = Math.min(rawBottom, overlayHeight);

        if (right <= left || bottom <= top) {
          return;
        }

        const width = right - left;
        const height = bottom - top;

        // Opacity based on state
        let backgroundOpacity = event.grade === 'oversold' ? 0.2 : 0.1;
        let borderOpacity = 0.5;
        
        if (isInvalidatedAggressiveEvent) {
          backgroundOpacity = 0.06;
          borderOpacity = 0.35;
        } else if (isHistoricalEvent) {
          backgroundOpacity = 0.04;
          borderOpacity = 0.25;
        }

        const box = document.createElement('div');
        box.style.position = 'absolute';
        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
        box.style.width = `${width}px`;
        box.style.height = `${height}px`;
        box.style.borderRadius = '4px';
        
        // Use gray for historical, original color for invalidated/normal
        if (isHistoricalEvent) {
          box.style.backgroundColor = `rgba(128, 128, 128, ${backgroundOpacity})`;
          box.style.border = `1px ${lineStyle} rgba(128, 128, 128, ${borderOpacity})`;
        } else {
          box.style.backgroundColor = `rgba(${boxColorTriplet}, ${backgroundOpacity})`;
          box.style.border = `1px ${lineStyle} rgba(${boxColorTriplet}, ${borderOpacity})`;
        }
        
        overlay.appendChild(box);

        createOverlayLine(overlay, x1, y1, x2, y2, renderedLineColor, lineStyle, 2);

        if (
          isBullishView
          && rsiSeries
          && isFiniteNumber(event.p1.rsi_14)
          && isFiniteNumber(event.p2.rsi_14)
        ) {
          const rsiY1 = rsiSeries.priceToCoordinate(event.p1.rsi_14);
          const rsiY2 = rsiSeries.priceToCoordinate(event.p2.rsi_14);

          if (rsiY1 !== null && rsiY2 !== null) {
            createOverlayLine(overlay, x1, rsiY1, x2, rsiY2, renderedLineColor, lineStyle, 2);
          }
        }
      });
    };

    const renderTriangleOverlay = () => {
      const overlay = overlayElement;
      const candleSeries = seriesStore.candlestick;

      if (!overlay || !candleSeries) {
        return;
      }

      overlay.replaceChildren();
      const overlayWidth = overlay.clientWidth;
      const overlayHeight = overlay.clientHeight;

      if (overlayWidth <= 0 || overlayHeight <= 0) {
        return;
      }

      triangles.forEach((event) => {
        const colorTriplet = getTriangleColorTriplet(event);
        const opacity = event.confidence_level === 'high'
          ? 0.95
          : (event.confidence_level === 'medium' ? 0.82 : 0.7);
        const lineColor = `rgba(${colorTriplet}, ${opacity})`;
        const lineStyle = event.line_style === 'dotted'
          ? 'dotted'
          : (event.line_style === 'dashed' ? 'dashed' : 'solid');
        const lineWidth = getTriangleLineWidth(event.confidence_level);

        const upperStartTime = timestampToChartDate(event.upper_line.start_timestamp);
        const upperEndTime = timestampToChartDate(event.upper_line.end_timestamp);
        const lowerStartTime = timestampToChartDate(event.lower_line.start_timestamp);
        const lowerEndTime = timestampToChartDate(event.lower_line.end_timestamp);

        const upperX1 = chart.timeScale().timeToCoordinate(upperStartTime);
        const upperX2 = chart.timeScale().timeToCoordinate(upperEndTime);
        const lowerX1 = chart.timeScale().timeToCoordinate(lowerStartTime);
        const lowerX2 = chart.timeScale().timeToCoordinate(lowerEndTime);

        const upperY1 = candleSeries.priceToCoordinate(event.upper_line.start_price);
        const upperY2 = candleSeries.priceToCoordinate(event.upper_line.end_price);
        const lowerY1 = candleSeries.priceToCoordinate(event.lower_line.start_price);
        const lowerY2 = candleSeries.priceToCoordinate(event.lower_line.end_price);

        if (upperX1 !== null && upperX2 !== null && upperY1 !== null && upperY2 !== null) {
          createOverlayLine(overlay, upperX1, upperY1, upperX2, upperY2, lineColor, lineStyle, lineWidth);
        }

        if (lowerX1 !== null && lowerX2 !== null && lowerY1 !== null && lowerY2 !== null) {
          createOverlayLine(overlay, lowerX1, lowerY1, lowerX2, lowerY2, lineColor, lineStyle, lineWidth);
        }

        const signalTime = timestampToChartDate(event.signal_timestamp);
        const signalX = chart.timeScale().timeToCoordinate(signalTime);
        const signalPrice = getTriangleSignalPrice(event);
        const signalY = candleSeries.priceToCoordinate(signalPrice);

        if (signalX === null || signalY === null) {
          return;
        }

        const markerSize = event.confidence_level === 'high' ? 10 : 8;
        const marker = document.createElement('div');
        marker.style.position = 'absolute';
        marker.style.left = `${signalX - (markerSize / 2)}px`;
        marker.style.top = `${signalY - (markerSize / 2)}px`;
        marker.style.width = `${markerSize}px`;
        marker.style.height = `${markerSize}px`;
        marker.style.borderRadius = '50%';
        marker.style.backgroundColor = `rgba(${colorTriplet}, 0.25)`;
        marker.style.border = `2px solid rgba(${colorTriplet}, ${opacity})`;
        overlay.appendChild(marker);
      });
    };

    const renderOverlay = () => {
      if (isTriangleView) {
        renderTriangleOverlay();
        return;
      }
      if (isBullishView) {
        renderDivergenceOverlay();
        return;
      }

      if (overlayElement) {
        overlayElement.replaceChildren();
      }
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

    let overlayRenderFrame = 0;
    const queueOverlayRender = () => {
      if (overlayRenderFrame) {
        window.cancelAnimationFrame(overlayRenderFrame);
      }

      overlayRenderFrame = window.requestAnimationFrame(() => {
        overlayRenderFrame = 0;
        renderOverlay();
      });
    };

    // Store in ref so it can be accessed from other effects
    queueOverlayRenderRef.current = queueOverlayRender;

    const handleVisibleRangeChange = () => {
      queueOverlayRender();
    };

    chart.timeScale().fitContent();
    queueOverlayRender();
    // Schedule another pass for the initial paint after layout settles.
    window.requestAnimationFrame(() => {
      queueOverlayRender();
    });

    chart.timeScale().subscribeVisibleTimeRangeChange(handleVisibleRangeChange);
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
    chart.subscribeCrosshairMove(handleCrosshairMove);

    // Keep chart width and divergence overlay in sync with container changes.
    const handleContainerResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
        queueOverlayRender();
      }
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(handleContainerResize)
      : null;
    if (chartContainerRef.current && resizeObserver) {
      resizeObserver.observe(chartContainerRef.current);
    }

    window.addEventListener('resize', handleContainerResize);

    return () => {
      window.removeEventListener('resize', handleContainerResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handleVisibleRangeChange);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      if (overlayRenderFrame) {
        window.cancelAnimationFrame(overlayRenderFrame);
      }
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
  }, [
    data,
    selectedMA,
    themeRefreshKey,
    divergences,
    triangles,
    isBullishView,
    isTriangleView,
  ]);

  // Separate effect to update overlay visibility when divergence toggles change
  // without recreating the chart (preserves zoom/pan state)
  useEffect(() => {
    // Update refs so renderOverlay can see current state values
    showInvalidatedAggressiveRef.current = showInvalidatedAggressive;
    showHistoricalDivergencesRef.current = showHistoricalDivergences;
    showEmergingRef.current = showEmerging;

    // Trigger overlay re-render
    if (queueOverlayRenderRef.current) {
      queueOverlayRenderRef.current();
    }
  }, [showInvalidatedAggressive, showHistoricalDivergences, showEmerging]);

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
          {symbol}{' '}
          {isTriangleView
            ? 'Triangle Pattern View'
            : (isBullishView ? 'Price + RSI Divergence View' : 'Price Chart')}
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
            <button
              onClick={() => setViewMode('triangle_patterns')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'triangle_patterns'
                  ? 'bg-gemini-gradient text-white'
                  : 'bg-gemini-bg-secondary/70 text-gemini-text-secondary hover:text-gemini-text-primary hover:bg-gemini-surface-hover'
              }`}
            >
              Triangle Patterns
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

          {isBullishView && (
            <div className="flex gap-2">
              <div className="inline-flex gap-2 items-center rounded-lg border border-gemini-surface-border/30 bg-gemini-bg-secondary/50 px-3 py-2">
                <div className="text-xs font-semibold text-gemini-text-secondary whitespace-nowrap">Advanced Options:</div>
                <button
                  onClick={() => setShowInvalidatedAggressive((current) => !current)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                    showInvalidatedAggressive
                      ? 'bg-gemini-accent-red/20 text-gemini-accent-red border border-gemini-accent-red/30'
                      : 'bg-gemini-bg-secondary/70 text-gemini-text-secondary hover:text-gemini-text-primary hover:bg-gemini-surface-hover'
                  }`}
                >
                  {showInvalidatedAggressive ? '✓ Invalidated' : 'Invalidated'}
                </button>
                <button
                  onClick={() => setShowHistoricalDivergences((current) => !current)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                    showHistoricalDivergences
                      ? 'bg-gemini-accent-gray/20 text-gemini-accent-gray border border-gemini-accent-gray/30'
                      : 'bg-gemini-bg-secondary/70 text-gemini-text-secondary hover:text-gemini-text-primary hover:bg-gemini-surface-hover'
                  }`}
                >
                  {showHistoricalDivergences ? '✓ Historical' : 'Historical'}
                </button>
                <button
                  onClick={() => setShowEmerging((current) => !current)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                    showEmerging
                      ? 'bg-gemini-accent-purple/20 text-gemini-accent-purple border border-gemini-accent-purple/30'
                      : 'bg-gemini-bg-secondary/70 text-gemini-text-secondary hover:text-gemini-text-primary hover:bg-gemini-surface-hover'
                  }`}
                >
                  {showEmerging ? '✓ Emerging' : 'Emerging'}
                </button>
              </div>
            </div>
          )}
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
            <div className="text-gemini-text-tertiary">
              {isBullishView
                ? 'Hover chart to inspect price and RSI values'
                : 'Hover chart to inspect price and volume values'}
            </div>
          )}
        </div>
        <div ref={divergenceOverlayRef} className="pointer-events-none absolute inset-0 z-10 overflow-hidden" />
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
        {isTriangleView ? (
          <>
            <div className="flex items-center gap-2 text-sm text-gemini-text-secondary">
              <div className="h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: 'rgb(6, 182, 212)' }} />
              <span>Potential triangle</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gemini-text-secondary">
              <div className="h-0.5 w-4 border-t-2" style={{ borderColor: 'rgb(34, 197, 94)' }} />
              <span>Bullish breakout</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gemini-text-secondary">
              <div className="h-0.5 w-4 border-t-2" style={{ borderColor: 'rgb(239, 68, 68)' }} />
              <span>Bearish breakout</span>
            </div>
            <div className="text-sm text-gemini-text-tertiary">High-confidence triangles use thicker lines and larger markers</div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm text-gemini-text-secondary">
              <div className="h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: 'rgb(236, 72, 153)' }} />
              <span>Confirmed divergence</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gemini-text-secondary">
              <div className="h-0.5 w-4 border-t-2 border-dotted" style={{ borderColor: 'rgb(250, 204, 21)' }} />
              <span>Aggressive divergence</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gemini-text-secondary">
              <div className="h-0.5 w-4 border-t-2 border-dotted" style={{ borderColor: 'rgb(147, 51, 234)' }} />
              <span>Emerging divergence</span>
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
            {isBullishView && (
              <>
                {showInvalidatedAggressive && (
                  <div className="flex items-center gap-2 text-sm text-gemini-accent-red/70">
                    <div className="h-0.5 w-4" style={{ borderColor: 'rgb(239, 68, 68)', borderTop: '1px dotted' }} />
                    <span>Invalidated aggressive lines (low opacity)</span>
                  </div>
                )}
                {showHistoricalDivergences && (
                  <div className="flex items-center gap-2 text-sm text-gray-500/70">
                    <div className="h-0.5 w-4" style={{ borderColor: 'rgb(128, 128, 128)', borderTop: '1px dotted' }} />
                    <span>Historical lines (60+ bars old, low opacity)</span>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}