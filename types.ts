
export interface RawReportRow {
  row_number?: number;
  Дата?: number;
  date: string; // YYYY-MM-DD
  Магазин: string;
  "Категория товара": string;
  "Шт. в кг": string;
  unit_type?: string;
  pieces_per_kg?: number;
  "Вес, кг"?: number;
  "Выручка, ₽": number;
  "Чеки, шт."?: number;
  "Штуки"?: number;
  ATV?: number;
  UPT?: number;
  "Ср. стоимость"?: number;
  "Номер недели"?: number;
  Месяц?: number;
  Квартал?: number;
  Год?: number;
}

export interface ReportMeta {
  source: string;
  generated_at: string;
  report_name: string;
  currency: string;
}

export interface ReportPayload {
  meta: ReportMeta;
  rows: RawReportRow[];
}

export interface NormalizedRow {
  id: string;
  date: string;
  store_name: string;
  category_name: string;
  unit_raw: string;
  unit_type: 'kg' | 'pcs';
  pieces_per_kg: number | null;
  weight_kg: number;
  revenue_rub: number;
  checks: number;
  pieces: number;
  week: number;
  month: number;
  quarter: number;
  year: number;
  atv: number;
  upt: number;
  avg_price_per_kg: number;
  avg_price_per_piece: number;
}

export interface Filters {
  dateFrom: string;
  dateTo: string;
  stores: string[];
  categories: string[];
  unitTypes: string[];
}

export type PivotValueType = 'sum_revenue' | 'sum_checks' | 'sum_pieces' | 'sum_weight' | 'calc_atv' | 'calc_upt';
