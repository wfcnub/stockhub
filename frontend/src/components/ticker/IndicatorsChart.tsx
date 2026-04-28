'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';
import { useTheme } from 'next-themes';
import type { ChartDataPoint, MACDMovingAverageType } from '@/types';
import { getChartThemeColors } from '@/lib/chartTheme';

interface IndicatorsChartProps {
  data: ChartDataPoint[];
  height?: number;
}

interface MACDChartProps extends IndicatorsChartProps {
  mode?: MACDMovingAverageType;
}

export function RSIChart({ data, height = 150 }: IndicatorsChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!chartContainerRef.current || !data.length) return;

    const themeColors = getChartThemeColors();

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
      height,
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
      },
    });

    chartRef.current = chart;

    const rsiSeries = chart.addLineSeries({
      color: themeColors.accentPurple,
      lineWidth: 2,
    });

    const rsiData = data
      .filter((d) => d.indicators.rsi_14 !== undefined)
      .map((d) => ({
        time: d.date as string,
        value: d.indicators.rsi_14 as number,
      }));

    rsiSeries.setData(rsiData);

    // Add overbought/oversold levels
    const oversoldLine = chart.addLineSeries({
      color: themeColors.positive,
      lineWidth: 1,
      lineStyle: 2,
    });

    const overboughtLine = chart.addLineSeries({
      color: themeColors.negative,
      lineWidth: 1,
      lineStyle: 2,
    });

    const middleLine = chart.addLineSeries({
      color: themeColors.muted,
      lineWidth: 1,
      lineStyle: 2,
    });

    const lineData = data.map((d) => ({ time: d.date as string, value: 30 }));
    const lineData70 = data.map((d) => ({ time: d.date as string, value: 70 }));
    const lineData50 = data.map((d) => ({ time: d.date as string, value: 50 }));

    oversoldLine.setData(lineData);
    overboughtLine.setData(lineData70);
    middleLine.setData(lineData50);

    chart.timeScale().fitContent();

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
      chart.remove();
    };
  }, [data, height, resolvedTheme]);

  return (
    <div className="hud-panel p-4">
      <div className="flex justify-between items-center mb-2">
        <h4 className="text-sm font-medium text-gemini-text-secondary">RSI (14)</h4>
        <div className="flex items-center gap-4 text-xs text-gemini-text-tertiary">
          <span className="text-gemini-accent-red">Overbought (70)</span>
          <span className="text-gemini-accent-green">Oversold (30)</span>
        </div>
      </div>
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}

export function MACDChart({ data, height = 150, mode = 'sma' }: MACDChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!chartContainerRef.current || !data.length) return;

    const themeColors = getChartThemeColors();

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
      height,
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
      },
    });

    chartRef.current = chart;

    // MACD Line
    const macdLine = chart.addLineSeries({
      color: themeColors.accentPurple,
      lineWidth: 2,
    });

    // Signal Line
    const signalLine = chart.addLineSeries({
      color: themeColors.accentOrange,
      lineWidth: 2,
    });

    // Histogram
    const histogramSeries = chart.addHistogramSeries({
      priceFormat: {
        type: 'price',
      },
    });

    const macdData = data
      .filter((d) => d.indicators.macd !== undefined)
      .map((d) => ({
        time: d.date as string,
        value: (d.indicators.macd as { value: number; signal: number; histogram: number }).value,
      }));

    const signalData = data
      .filter((d) => d.indicators.macd !== undefined)
      .map((d) => ({
        time: d.date as string,
        value: (d.indicators.macd as { value: number; signal: number; histogram: number }).signal,
      }));

    const histogramData = data
      .filter((d) => d.indicators.macd !== undefined)
      .map((d) => ({
        time: d.date as string,
        value: (d.indicators.macd as { value: number; signal: number; histogram: number }).histogram,
        color: (d.indicators.macd as { value: number; signal: number; histogram: number }).histogram >= 0
          ? themeColors.volumeUp
          : themeColors.volumeDown,
      }));

    macdLine.setData(macdData);
    signalLine.setData(signalData);
    histogramSeries.setData(histogramData);

    chart.timeScale().fitContent();

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
      chart.remove();
    };
  }, [data, height, resolvedTheme]);

  return (
    <div className="hud-panel p-4">
      <div className="flex justify-between items-center mb-2">
        <h4 className="text-sm font-medium text-gemini-text-secondary">MACD ({mode.toUpperCase()})</h4>
        <div className="flex items-center gap-4 text-xs text-gemini-text-tertiary">
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 rounded bg-gemini-accent-purple" />
            <span>MACD</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 rounded bg-gemini-accent-orange" />
            <span>Signal</span>
          </div>
        </div>
      </div>
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}