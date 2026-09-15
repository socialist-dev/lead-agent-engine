export interface ExtractedItem {
  scanTime: string;
  platform: string;
  postedAgo: string;
  categoryTag: string;
  scoreOrPriority: string;
  title: string;
  contentOrBrief: string;
  extraField1: string;  // Ngân sách / Nhu cầu chi tiết
  extraField2: string;  // SĐT / Liên hệ / Link tác giả
  url: string;
}

export interface TaskDefinition {
  id: string;                     // ID task (vd: 'client-tuan-bds')
  name: string;                   // Tên khách hàng & Ngành nghề
  enabled: boolean;               // Bật/tắt quét cho khách này
  spreadsheetId: string;          // ID file Google Sheet riêng của khách
  timeFilter: 'qdr:h' | 'qdr:d' | 'qdr:w' | 'qdr:m'; // Mốc thời gian (qdr:d = 24h, qdr:w = 7 ngày)
  dorks: string[];                // Danh sách Google Dorking riêng của khách
  aiPrompt: {
    systemRole: string;           // Vai trò thẩm định của AI
    validationRules: string;      // Tiêu chuẩn duyệt & loại bỏ bài rác
    categoryTags: string[];       // Danh sách Tag phân loại
    extraField1Label: string;     // Ý nghĩa cột H
    extraField2Label: string;     // Ý nghĩa cột I
  };
  dynamicDorks?: {
    enabled: boolean;
    instruction: string;
  };
}
