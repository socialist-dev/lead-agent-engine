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
