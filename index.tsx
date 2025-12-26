
import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, Cell, Legend
} from 'recharts';
import {
  NormalizedRow, Filters, PivotValueType, ReportMeta
} from './types';
import { COLORS, CHART_COLORS, MONTH_NAMES, ICONS } from './constants';

// --- УТИЛИТЫ ОЧИСТКИ ---

const cleanString = (val: any): string => {
  if (val === null || val === undefined) return '';
  return String(val).replace(/[\n\r]/g, '').trim();
};

const parseNum = (val: any): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  // Удаляем переносы строк, пробелы, меняем запятые на точки
  const cleaned = String(val)
    .replace(/[\n\r]/g, '')
    .replace(/\s/g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

const formatCurrency = (val: number) => 
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(val);

const formatCompact = (val: number) => 
  val.toLocaleString('ru-RU', { maximumFractionDigits: 0 });

const formatWeight = (val: number) => 
  val.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' кг';

// --- НОРМАЛИЗАЦИЯ ДАННЫХ ---

const normalizeData = (raw: any[]): NormalizedRow[] => {
  return raw.map((item, idx) => {
    // n8n может возвращать массив объектов напрямую или в поле json
    const row = item.json ? item.json : item;
    
    // Основные числовые поля
    const revenue = parseNum(row.revenue_rub || row["Выручка, ₽"] || row.revenue_rub_raw);
    const checks = parseNum(row.checks || row["Чеки, шт."]);
    const pieces = parseNum(row.pieces || row["Штуки"] || row.peaces); // peaces - возможная опечатка в n8n
    const weight = parseNum(row.weight_kg || row["Вес, кг"]);
    
    // Текстовые поля с очисткой от \n
    const dateStr = cleanString(row.date || row["Дата"]);
    const store = cleanString(row.store_name || row["Магазин"] || "Неизвестно");
    const category = cleanString(row.category_name || row["Категория товара"] || "Прочее");
    
    // Определение типа единицы
    const rawUnit = cleanString(row.unit_raw || row["Шт. в кг"]);
    const unitTypeClean = cleanString(row.unit_type).toLowerCase();
    const unitType: 'kg' | 'pcs' = (unitTypeClean.includes('kg') || unitTypeClean.includes('кг') || rawUnit.toLowerCase().includes('кг')) ? 'kg' : 'pcs';

    return {
      id: cleanString(row.id) || `row-${idx}`,
      date: dateStr,
      store_name: store,
      category_name: category,
      unit_raw: rawUnit,
      unit_type: unitType,
      pieces_per_kg: parseNum(row.pieces_per_kg),
      weight_kg: weight,
      revenue_rub: revenue,
      checks: checks,
      pieces: pieces,
      week: parseNum(row.week),
      month: parseNum(row.month),
      quarter: parseNum(row.quarter),
      year: parseNum(row.year) || 2025,
      atv: checks > 0 ? revenue / checks : 0,
      upt: checks > 0 ? pieces / checks : 0,
      avg_price_per_kg: weight > 0 ? revenue / weight : 0,
      avg_price_per_piece: pieces > 0 ? revenue / pieces : 0,
    };
  });
};

// --- КОМПОНЕНТЫ ---

const KPICard = ({ title, value, icon: Icon, color }: { title: string, value: string, icon: any, color: string }) => (
  <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] transition-all hover:shadow-xl">
    <div className="flex justify-between items-start mb-4">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${color}15`, color: color }}>
        <Icon className="w-6 h-6" />
      </div>
    </div>
    <div className="space-y-1">
      <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{title}</div>
      <div className="text-2xl font-black text-slate-900 tracking-tight">{value}</div>
    </div>
  </div>
);

const App = () => {
  const [data, setData] = useState<NormalizedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    dateFrom: '',
    dateTo: '',
    stores: [],
    categories: [],
    unitTypes: [],
  });

  // Настройки сводной таблицы
  const [pivotRow, setPivotRow] = useState<keyof NormalizedRow>('category_name');
  const [pivotCol, setPivotCol] = useState<keyof NormalizedRow>('month');
  const [pivotVal, setPivotVal] = useState<PivotValueType>('sum_revenue');

  const WEBHOOK_URL = 'https://tunasruso.ru/webhook/f9ec92c8-b03f-4a23-be47-10c42f095dc3';

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(WEBHOOK_URL);
      if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
      const result = await response.json();
      
      const rawRows = Array.isArray(result) ? result : (result.rows || []);
      if (!rawRows.length) throw new Error("Нет данных от вебхука");
      
      const normalized = normalizeData(rawRows);
      setData(normalized);
      localStorage.setItem('cached_report_rows', JSON.stringify(normalized));
    } catch (err: any) {
      setError(err.message);
      const cached = localStorage.getItem('cached_report_rows');
      if (cached) setData(JSON.parse(cached));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cached = localStorage.getItem('cached_report_rows');
    if (cached) {
      setData(JSON.parse(cached));
    } else {
      loadData();
    }
  }, []);

  // Фильтрация
  const filteredData = useMemo(() => {
    return data.filter(d => {
      if (filters.dateFrom && d.date < filters.dateFrom) return false;
      if (filters.dateTo && d.date > filters.dateTo) return false;
      if (filters.stores.length && !filters.stores.includes(d.store_name)) return false;
      if (filters.categories.length && !filters.categories.includes(d.category_name)) return false;
      if (filters.unitTypes.length && !filters.unitTypes.includes(d.unit_type)) return false;
      return true;
    });
  }, [data, filters]);

  // Расчет KPI
  const stats = useMemo(() => {
    const total = filteredData.reduce((acc, curr) => ({
      rev: acc.rev + curr.revenue_rub,
      chk: acc.chk + curr.checks,
      pcs: acc.pcs + curr.pieces,
      wgt: acc.wgt + curr.weight_kg,
    }), { rev: 0, chk: 0, pcs: 0, wgt: 0 });

    return {
      revenue: formatCurrency(total.rev),
      checks: formatCompact(total.chk),
      pieces: formatCompact(total.pcs),
      weight: formatWeight(total.wgt),
      atv: formatCurrency(total.chk > 0 ? total.rev / total.chk : 0),
      upt: (total.chk > 0 ? total.pcs / total.chk : 0).toFixed(2),
    };
  }, [filteredData]);

  // Логика сводной таблицы
  const pivotTable = useMemo(() => {
    const rowKeys = Array.from(new Set(filteredData.map(d => String(d[pivotRow])))).sort();
    const colKeys = Array.from(new Set(filteredData.map(d => String(d[pivotCol])))).sort((a, b) => {
      if (!isNaN(Number(a)) && !isNaN(Number(b))) return Number(a) - Number(b);
      return a.localeCompare(b);
    });
    
    const matrix: Record<string, Record<string, number>> = {};
    rowKeys.forEach(r => {
      matrix[r] = {};
      colKeys.forEach(c => matrix[r][c] = 0);
    });

    // Для расчета ATV/UPT в итогах нужно хранить промежуточные суммы
    const matrixAux: Record<string, Record<string, { rev: number, chk: number, pcs: number }>> = {};
    rowKeys.forEach(r => {
      matrixAux[r] = {};
      colKeys.forEach(c => matrixAux[r][c] = { rev: 0, chk: 0, pcs: 0 });
    });

    filteredData.forEach(d => {
      const r = String(d[pivotRow]);
      const c = String(d[pivotCol]);
      
      matrixAux[r][c].rev += d.revenue_rub;
      matrixAux[r][c].chk += d.checks;
      matrixAux[r][c].pcs += d.pieces;

      switch(pivotVal) {
        case 'sum_revenue': matrix[r][c] += d.revenue_rub; break;
        case 'sum_checks': matrix[r][c] += d.checks; break;
        case 'sum_pieces': matrix[r][c] += d.pieces; break;
        case 'sum_weight': matrix[r][c] += d.weight_kg; break;
        case 'calc_atv': matrix[r][c] = matrixAux[r][c].chk > 0 ? matrixAux[r][c].rev / matrixAux[r][c].chk : 0; break;
        case 'calc_upt': matrix[r][c] = matrixAux[r][c].chk > 0 ? matrixAux[r][c].pcs / matrixAux[r][c].chk : 0; break;
      }
    });

    return { rowKeys, colKeys, matrix, matrixAux };
  }, [filteredData, pivotRow, pivotCol, pivotVal]);

  // Данные для графиков
  const chartData = useMemo(() => {
    const timeMap: Record<string, number> = {};
    const catMap: Record<string, number> = {};

    filteredData.forEach(d => {
      timeMap[d.date] = (timeMap[d.date] || 0) + d.revenue_rub;
      catMap[d.category_name] = (catMap[d.category_name] || 0) + d.revenue_rub;
    });

    const time = Object.entries(timeMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const categories = Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    return { time, categories };
  }, [filteredData]);

  const uniqueStores = useMemo(() => Array.from(new Set(data.map(d => d.store_name))).sort(), [data]);
  const uniqueCats = useMemo(() => Array.from(new Set(data.map(d => d.category_name))).sort(), [data]);

  const exportCSV = () => {
    if (!filteredData.length) return;
    const headers = ["Дата", "Магазин", "Категория", "Выручка", "Чеки", "Штуки", "Вес"].join(',');
    const rows = filteredData.map(r => [
      r.date, r.store_name, r.category_name, r.revenue_rub, r.checks, r.pieces, r.weight_kg
    ].join(',')).join('\n');
    const blob = new Blob(["\uFEFF" + headers + '\n' + rows], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'sales_report.csv';
    link.click();
  };

  const handleClear = () => {
    setData([]);
    localStorage.removeItem('cached_report_rows');
  };

  return (
    <div className="min-h-screen flex flex-col xl:flex-row bg-[#F8FAFC]">
      {/* Боковая панель */}
      <aside className="w-full xl:w-80 bg-white border-b xl:border-r border-slate-100 p-8 flex flex-col gap-8 shrink-0 overflow-y-auto max-h-screen">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#FF5C35] rounded-xl flex items-center justify-center shadow-lg shadow-orange-200">
            <ICONS.TrendingUp className="text-white w-6 h-6" />
          </div>
          <span className="text-2xl font-black tracking-tight">TunasReport</span>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Период</label>
            <div className="space-y-2">
              <input 
                type="date" 
                value={filters.dateFrom} 
                onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
                className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-orange-500"
              />
              <input 
                type="date" 
                value={filters.dateTo} 
                onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
                className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {[7, 8, 9, 10, 11, 12].map(m => (
                <button 
                  key={m}
                  onClick={() => setFilters(f => ({ ...f, dateFrom: `2025-${String(m).padStart(2, '0')}-01`, dateTo: `2025-${String(m).padStart(2, '0')}-31` }))}
                  className="px-3 py-1 bg-slate-100 hover:bg-orange-100 text-[10px] font-bold rounded-lg transition"
                >
                  {MONTH_NAMES[m-1]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Магазин</label>
            <div className="max-h-40 overflow-y-auto space-y-1 pr-2">
              {uniqueStores.map(s => (
                <label key={s} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded-xl cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={filters.stores.includes(s)}
                    onChange={e => {
                      const next = e.target.checked ? [...filters.stores, s] : filters.stores.filter(x => x !== s);
                      setFilters(f => ({ ...f, stores: next }));
                    }}
                    className="w-4 h-4 text-orange-500 rounded border-slate-300 focus:ring-orange-500"
                  />
                  <span className="text-sm font-medium text-slate-600 truncate">{s}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Категория</label>
            <div className="max-h-40 overflow-y-auto space-y-1 pr-2">
              {uniqueCats.map(c => (
                <label key={c} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded-xl cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={filters.categories.includes(c)}
                    onChange={e => {
                      const next = e.target.checked ? [...filters.categories, c] : filters.categories.filter(x => x !== c);
                      setFilters(f => ({ ...f, categories: next }));
                    }}
                    className="w-4 h-4 text-orange-500 rounded border-slate-300 focus:ring-orange-500"
                  />
                  <span className="text-sm font-medium text-slate-600 truncate">{c}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-4 space-y-3">
            <button 
              onClick={() => setFilters({ dateFrom: '', dateTo: '', stores: [], categories: [], unitTypes: [] })}
              className="w-full py-3 text-slate-400 hover:text-orange-500 text-xs font-bold uppercase tracking-widest transition"
            >
              Сбросить фильтры
            </button>
            <button 
              onClick={loadData}
              disabled={loading}
              className="w-full py-4 bg-orange-500 text-white rounded-[20px] font-black text-xs uppercase tracking-[2px] shadow-lg shadow-orange-200 hover:bg-orange-600 disabled:bg-slate-300 transition-all flex items-center justify-center gap-2"
            >
              <ICONS.ArrowPath className={`w-4 h-4 ${loading && 'animate-spin'}`} />
              {loading ? 'Загрузка...' : 'Обновить данные'}
            </button>
          </div>
        </div>
      </aside>

      {/* Основной контент */}
      <main className="flex-1 p-6 xl:p-10 space-y-10 overflow-y-auto h-screen">
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-500 text-sm font-medium flex justify-between items-center">
            <span>Ошибка: {error}</span>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600">×</button>
          </div>
        )}

        {!data.length && !loading ? (
          <div className="h-full flex flex-col items-center justify-center space-y-6 text-center">
            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center">
              <ICONS.Package className="w-12 h-12 text-slate-300" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900">Данные не загружены</h2>
              <p className="text-slate-400 mt-2 max-w-sm">Нажмите кнопку обновления или отправьте данные через вебхук n8n.</p>
            </div>
            <button onClick={loadData} className="px-8 py-4 bg-orange-500 text-white rounded-2xl font-bold shadow-lg hover:bg-orange-600 transition">
              Загрузить данные
            </button>
          </div>
        ) : (
          <>
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h1 className="text-4xl font-black tracking-tight text-slate-900">Дашборд продаж</h1>
                <p className="text-slate-400 font-medium mt-1">
                  Анализ {filteredData.length} строк из {data.length}
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={exportCSV} className="px-6 py-3 bg-white border border-slate-100 rounded-2xl font-bold text-slate-600 shadow-sm hover:bg-slate-50 transition flex items-center gap-2">
                  <ICONS.Download className="w-4 h-4" />
                  Экспорт CSV
                </button>
                <button onClick={handleClear} className="px-6 py-3 bg-white border border-rose-100 rounded-2xl font-bold text-rose-500 shadow-sm hover:bg-rose-50 transition flex items-center gap-2">
                  <ICONS.Trash className="w-4 h-4" />
                  Очистить
                </button>
              </div>
            </header>

            {/* Карточки KPI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
              <KPICard title="Выручка" value={stats.revenue} icon={ICONS.CurrencyDollar} color="#FF5C35" />
              <KPICard title="Чеки" value={stats.checks} icon={ICONS.Tag} color="#3BA3F8" />
              <KPICard title="Ср. чек (ATV)" value={stats.atv} icon={ICONS.TrendingUp} color="#10B981" />
              <KPICard title="Штуки" value={stats.pieces} icon={ICONS.Package} color="#F59E0B" />
              <KPICard title="UPT" value={stats.upt} icon={ICONS.TrendingUp} color="#8B5CF6" />
              <KPICard title="Вес" value={stats.weight} icon={ICONS.Package} color="#EC4899" />
            </div>

            {/* Графики */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-black">Динамика выручки</h3>
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                    <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                    Продажи по дням
                  </div>
                </div>
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData.time}>
                      <defs>
                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#FF5C35" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#FF5C35" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94A3B8' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94A3B8' }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                        formatter={(v: any) => [formatCurrency(v), 'Выручка']}
                      />
                      <Area type="monotone" dataKey="value" stroke="#FF5C35" strokeWidth={4} fillOpacity={1} fill="url(#colorRev)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
                <h3 className="text-xl font-black mb-8">Топ категорий</h3>
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData.categories} layout="vertical">
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748B', fontWeight: 'bold' }} width={90} />
                      <Tooltip cursor={{ fill: '#F8FAFC' }} />
                      <Bar dataKey="value" radius={[0, 10, 10, 0]}>
                        {chartData.categories.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Сводная таблица */}
            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
                <h3 className="text-2xl font-black tracking-tight">Сводный анализ</h3>
                <div className="flex flex-wrap gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Строки</label>
                    <select 
                      value={pivotRow} 
                      onChange={e => setPivotRow(e.target.value as any)}
                      className="block w-40 bg-slate-50 border-none rounded-2xl px-4 py-2 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="category_name">Категория</option>
                      <option value="store_name">Магазин</option>
                      <option value="year">Год</option>
                      <option value="month">Месяц</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Колонки</label>
                    <select 
                      value={pivotCol} 
                      onChange={e => setPivotCol(e.target.value as any)}
                      className="block w-40 bg-slate-50 border-none rounded-2xl px-4 py-2 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="month">Месяц</option>
                      <option value="store_name">Магазин</option>
                      <option value="unit_type">Тип единицы</option>
                      <option value="quarter">Квартал</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Показатель</label>
                    <select 
                      value={pivotVal} 
                      onChange={e => setPivotVal(e.target.value as any)}
                      className="block w-40 bg-slate-50 border-none rounded-2xl px-4 py-2 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="sum_revenue">Выручка</option>
                      <option value="sum_checks">Чеки</option>
                      <option value="sum_pieces">Штуки</option>
                      <option value="sum_weight">Вес</option>
                      <option value="calc_atv">ATV (Ср. чек)</option>
                      <option value="calc_upt">UPT</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto -mx-8">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="p-6 text-left text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 min-w-[200px] sticky left-0 bg-slate-50 z-10">
                        {pivotRow === 'category_name' ? 'Категория' : pivotRow === 'store_name' ? 'Магазин' : pivotRow}
                      </th>
                      {pivotTable.colKeys.map(c => (
                        <th key={c} className="p-6 text-center text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 min-w-[120px]">
                          {pivotCol === 'month' ? MONTH_NAMES[Number(c)-1] : c}
                        </th>
                      ))}
                      <th className="p-6 text-right text-xs font-black text-orange-500 uppercase tracking-widest border-b border-slate-100 bg-orange-50/50 min-w-[140px]">Итого</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {pivotTable.rowKeys.map(r => {
                      let rowTotal = 0;
                      let rowRev = 0;
                      let rowChk = 0;
                      let rowPcs = 0;
                      
                      return (
                        <tr key={r} className="hover:bg-slate-50/50 transition group">
                          <td className="p-6 text-sm font-black text-slate-800 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-50">
                            {r}
                          </td>
                          {pivotTable.colKeys.map(c => {
                            const val = pivotTable.matrix[r][c] || 0;
                            const aux = pivotTable.matrixAux[r][c];
                            rowRev += aux.rev;
                            rowChk += aux.chk;
                            rowPcs += aux.pcs;
                            
                            // Суммируемые итоги
                            if (['sum_revenue', 'sum_checks', 'sum_pieces', 'sum_weight'].includes(pivotVal)) {
                                rowTotal += val;
                            }

                            return (
                              <td key={c} className="p-6 text-center text-sm font-medium text-slate-500">
                                {val > 0 ? (
                                  pivotVal.includes('revenue') || pivotVal.includes('atv') ? formatCurrency(val) : formatCompact(val)
                                ) : '—'}
                              </td>
                            );
                          })}
                          <td className="p-6 text-right text-sm font-black text-slate-900 bg-orange-50/20">
                            {(() => {
                              let finalTotal = rowTotal;
                              if (pivotVal === 'calc_atv') finalTotal = rowChk > 0 ? rowRev / rowChk : 0;
                              if (pivotVal === 'calc_upt') finalTotal = rowChk > 0 ? rowPcs / rowChk : 0;
                              
                              return pivotVal.includes('revenue') || pivotVal.includes('atv') ? formatCurrency(finalTotal) : formatCompact(finalTotal);
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
