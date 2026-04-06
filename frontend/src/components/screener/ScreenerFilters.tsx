'use client';

import { useState } from 'react';

interface FilterConfig {
  indicator: string;
  operator: 'gt' | 'lt' | 'eq' | 'between';
  value: number | [number, number];
}

interface ScreenerFiltersProps {
  onFilter: (filters: FilterConfig[]) => void;
}

const AVAILABLE_INDICATORS = [
  { id: 'sma_5', name: 'SMA 5', category: 'Moving Averages' },
  { id: 'sma_10', name: 'SMA 10', category: 'Moving Averages' },
  { id: 'sma_15', name: 'SMA 15', category: 'Moving Averages' },
  { id: 'sma_20', name: 'SMA 20', category: 'Moving Averages' },
  { id: 'sma_50', name: 'SMA 50', category: 'Moving Averages' },
  { id: 'sma_100', name: 'SMA 100', category: 'Moving Averages' },
  { id: 'sma_200', name: 'SMA 200', category: 'Moving Averages' },
  { id: 'ema_5', name: 'EMA 5', category: 'Moving Averages' },
  { id: 'ema_10', name: 'EMA 10', category: 'Moving Averages' },
  { id: 'ema_15', name: 'EMA 15', category: 'Moving Averages' },
  { id: 'ema_20', name: 'EMA 20', category: 'Moving Averages' },
  { id: 'ema_50', name: 'EMA 50', category: 'Moving Averages' },
  { id: 'ema_100', name: 'EMA 100', category: 'Moving Averages' },
  { id: 'ema_200', name: 'EMA 200', category: 'Moving Averages' },
  { id: 'macd', name: 'MACD', category: 'Momentum' },
  { id: 'macd_signal', name: 'MACD Signal', category: 'Momentum' },
  { id: 'macd_histogram', name: 'MACD Histogram', category: 'Momentum' },
  { id: 'rsi', name: 'RSI (14)', category: 'Momentum' },
  { id: 'vwap', name: 'VWAP', category: 'Volume' },
];

const OPERATORS = [
  { id: 'gt', label: '>' },
  { id: 'lt', label: '<' },
  { id: 'eq', label: '=' },
  { id: 'between', label: 'Between' },
];

export default function ScreenerFilters({ onFilter }: ScreenerFiltersProps) {
  const [filters, setFilters] = useState<FilterConfig[]>([]);
  const [selectedIndicator, setSelectedIndicator] = useState('');
  const [selectedOperator, setSelectedOperator] = useState<'gt' | 'lt' | 'eq' | 'between'>('gt');
  const [value, setValue] = useState<number>(0);
  const [valueFrom, setValueFrom] = useState<number>(0);
  const [valueTo, setValueTo] = useState<number>(100);

  const addFilter = () => {
    if (!selectedIndicator) return;

    const newFilter: FilterConfig = {
      indicator: selectedIndicator,
      operator: selectedOperator,
      value: selectedOperator === 'between' ? [valueFrom, valueTo] : value,
    };

    setFilters([...filters, newFilter]);

    // Reset form
    setSelectedIndicator('');
    setValue(0);
  };

  const removeFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  const handleApplyFilters = () => {
    onFilter(filters);
  };

  const clearFilters = () => {
    setFilters([]);
    onFilter([]);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h3 className="text-lg font-semibold mb-4">Screening Filters</h3>

      {/* Active Filters */}
      {filters.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Active Filters:</h4>
          <div className="flex flex-wrap gap-2">
            {filters.map((filter, idx) => (
              <span
                key={idx}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
              >
                {AVAILABLE_INDICATORS.find(i => i.id === filter.indicator)?.name}
                {' '}
                {OPERATORS.find(o => o.id === filter.operator)?.label}
                {' '}
                {Array.isArray(filter.value)
                  ? `${filter.value[0]} - ${filter.value[1]}`
                  : filter.value}
                <button
                  onClick={() => removeFilter(idx)}
                  className="ml-2 text-blue-600 hover:text-blue-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Add Filter Form */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Indicator</label>
          <select
            value={selectedIndicator}
            onChange={(e) => setSelectedIndicator(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select...</option>
            {AVAILABLE_INDICATORS.map((ind) => (
              <option key={ind.id} value={ind.id}>
                {ind.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Operator</label>
          <select
            value={selectedOperator}
            onChange={(e) => setSelectedOperator(e.target.value as typeof selectedOperator)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {OPERATORS.map((op) => (
              <option key={op.id} value={op.id}>
                {op.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          {selectedOperator === 'between' ? (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                <input
                  type="number"
                  value={valueFrom}
                  onChange={(e) => setValueFrom(parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                <input
                  type="number"
                  value={valueTo}
                  onChange={(e) => setValueTo(parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
              <input
                type="number"
                value={value}
                onChange={(e) => setValue(parseFloat(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        <div className="flex items-end">
          <button
            onClick={addFilter}
            disabled={!selectedIndicator}
            className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Filter
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleApplyFilters}
          disabled={filters.length === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Apply Filters
        </button>
        <button
          onClick={clearFilters}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
        >
          Clear All
        </button>
      </div>
    </div>
  );
}