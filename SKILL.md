# 🤖 SKILL & SPECIFICATION: LEAD AGENT ENGINE

## 1. MỤC ĐÍCH
Hệ thống tự động hóa quét Intent Lead (Nhu cầu mua hàng thời gian thực) và xuất vào Google Sheet riêng biệt của từng khách hàng trả phí.

## 2. QUY CHUẨN MÃ NGUỒN
- **`src/core/`**: Tuyệt đối KHÔNG chỉnh sửa code trong thư mục này.
- **`src/tasks/`**: Mỗi khách hàng là 1 file `TaskDefinition` độc lập.

## 3. CÁCH TẠO KHÁCH HÀNG MỚI (TASK SPECIFICATION)
Tạo file `src/tasks/client-<ten-khach>.ts`:
```typescript
import { TaskDefinition } from '../core/types';

export const ClientX: TaskDefinition = {
  id: 'client-unique-id',
  name: 'Tên khách - Ngành nghề',
  enabled: true,
  spreadsheetId: 'ID_SHEET_RIENG_CUA_KHACH',
  timeFilter: 'qdr:d',
  dorks: [ /* Dorking chuyên biệt kèm từ khóa phủ định - */ ],
  aiPrompt: {
    systemRole: 'Vai trò thẩm định của AI...',
    validationRules: 'Quy tắc duyệt/loại bỏ...',
    categoryTags: ['[Tag 1]', '[Tag 2]'],
    extraField1Label: 'Nhãn cột H',
    extraField2Label: 'Nhãn cột I'
  }
};
