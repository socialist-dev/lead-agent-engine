export interface ExtractedItem {
  scanTime: string;
  platform: string;
  postedAgo: string;
  categoryTag: string;
  scoreOrPriority: string;
  title: string;
  contentOrBrief: string;
  extraField1: string;
  extraField2: string;
  url: string;
}

export interface ActiveClientFromAdmin {
  name: string;
  spreadsheetId: string;
  nicheDefinition: string; // Chuỗi phân cấp Cột H (Ngành | Nhu cầu | Khu vực | -Loại trừ)
  sku: string;             // Mã SKU (Cột E)
  timeFilter: string;      // Mốc cào (Cột I: qdr:d hoặc qdr:w)
}

export interface RawScrapedPost {
  platform: string;
  url: string;
  rawContent: string;
}

export interface PipelineResult {
  client: string;
  leadsFound: number;
  leadsPushed: number;
  durationMs: number;
  errors: string[];
}

export interface AppConfig {
  jinaKey: string;
  firecrawlKey: string;
  geminiKey: string;
  sheetWebhookUrl: string;
  geminiModel: string;
  concurrencyLimit: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
