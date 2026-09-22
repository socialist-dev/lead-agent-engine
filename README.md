# 🚀 Universal Lead Agent Engine

Hệ thống săn Lead tự động tối ưu cho GitHub Actions + Google Sheets.

## 📁 Thư mục dự án

```text
src/
├── config.ts             # Centralized config & SKU pricing rules
├── types.ts              # System interfaces & data models
├── utils.ts              # Sleep, VN time, platform detector, mapConcurrent
├── infra/
│   ├── logger.ts         # Structured logging engine
│   ├── rate-limiter.ts   # Token bucket rate limiter (Gemini 15 RPM protection)
│   └── http-client.ts    # Fetch wrapper with auto-retry & timeout
├── providers/
│   ├── gemini.ts         # AI Dorking generator & Single-batch evaluator
│   ├── jina.ts           # Jina AI Search crawler
│   ├── firecrawl.ts      # Firecrawl fallback crawler
│   └── gsheet.ts         # Google Sheet Admin sync & lead export
├── pipeline.ts           # Per-client pipeline runner
└── index.ts              # Entry point with controlled concurrency
```

## 🛠 Lệnh làm việc

- **Chạy chính**: `npm run start`
- **Kiểm tra kiểu dữ liệu**: `npm run typecheck`
- **Chạy Test**: `npm test`

## ⚙️ Biến môi trường (GitHub Secrets)

- `JINA_API_KEY`: API Key cào dữ liệu chính từ Jina AI
- `FIRECRAWL_API_KEY`: API Key dự phòng (Tùy chọn)
- `GEMINI_API_KEY`: API Key từ Google Gemini AI
- `SHEET_WEBHOOK_URL`: Google Apps Script Webhook URL
- `GEMINI_MODEL`: (Mặc định: `gemini-3.1-flash-lite`)
- `CONCURRENCY_LIMIT`: Tối đa số khách chạy song song (Mặc định: `3`)
