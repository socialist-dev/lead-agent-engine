import { AppConfig } from './types';

export function loadConfig(): AppConfig {
  const config: AppConfig = {
    jinaKey: process.env.JINA_API_KEY || '',
    firecrawlKey: process.env.FIRECRAWL_API_KEY || '',
    geminiKey: process.env.GEMINI_API_KEY || '',
    sheetWebhookUrl: process.env.SHEET_WEBHOOK_URL || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    concurrencyLimit: parseInt(process.env.CONCURRENCY_LIMIT || '3', 10),
    logLevel: (process.env.LOG_LEVEL as any) || 'info'
  };

  return config;
}

export function getTimeFilterRule(sku: string): { ruleText: string; isHighTier: boolean } {
  const isHighTier = sku.includes('PRO') || sku.includes('TRI');
  if (isHighTier) {
    return {
      ruleText: '🔥 GÓI CAO CẤP: DUYỆT CÁC BÀI ĐĂNG MỚI TRONG 24 GIỜ QUA HOẶC GẦN ĐÂY.',
      isHighTier: true
    };
  }
  return {
    ruleText: '📦 GÓI TIÊU CHUẨN: DUYỆT các bài đăng trong vòng 7 ngày qua. LOẠI BỎ bài quá 7 ngày.',
    isHighTier: false
  };
}
