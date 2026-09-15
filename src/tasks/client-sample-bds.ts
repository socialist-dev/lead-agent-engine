import { TaskDefinition } from '../core/types';

const NEGATIVE = '-"bán đất chính chủ" -"cần bán gấp" -"nhận môi giới" -"cho thuê phòng trọ"';

export const ClientSampleBDS: TaskDefinition = {
  id: 'client-sample-bds',
  name: 'Anh Tuấn - Khách Mua Chung Cư Hà Nội',
  enabled: true,
  // 👉 Thay bằng ID Google Sheet riêng của khách này (lấy từ hàm tạo file mẫu)
  spreadsheetId: 'DIEN_SPREADSHEET_ID_CUA_KHACH_VAO_DAY',
  timeFilter: 'qdr:d', // 24 giờ qua
  dorks: [
    `("cần mua chung cư" OR "tìm mua căn hộ" OR "hỏi mua nhà") ("hà nội" OR "nam từ liêm" OR "cầu giấy" OR "hà đông") ${NEGATIVE}`,
    `site:threads.net ("cần tìm căn 2pn" OR "mua chung cư tài chính 3 tỷ" OR "ai bán nhà hà nội") ${NEGATIVE}`,
    `site:facebook.com/groups ("cần mua căn hộ" OR "tìm nhà chính chủ" OR "tài chính 2 tỷ cần mua") ${NEGATIVE}`
  ],
  aiPrompt: {
    systemRole: 'Bạn là chuyên gia thẩm định nhu cầu MUA BẤT ĐỘNG SẢN của khách hàng thực tế.',
    validationRules: `
    - DUYỆT: Bài viết/bình luận của NGƯỜI CẦN MUA/THUÊ NHÀ THẬT (có nhu cầu, hỏi giá, tìm căn hộ).
    - LOẠI BỎ: Môi giới/cò đất khác đăng bài chào bán sản phẩm hoặc bài quảng cáo dự án.
    `,
    categoryTags: ['[Cần Mua 1-2PN]', '[Cần Mua 3PN+]', '[Tài Chính 2-3 Tỷ]', '[Tài Chính > 4 Tỷ]', '[Cần Thuê Gấp]'],
    extraField1Label: 'Ngân sách & Loại BĐS cần mua',
    extraField2Label: 'SĐT / Link liên hệ người mua'
  },
  dynamicDorks: {
    enabled: true,
    instruction: 'Tạo 3 câu Google Dorking tiếng Việt văn nói tìm người đăng tìm mua nhà đất hoặc chung cư ở Hà Nội.'
  }
};
