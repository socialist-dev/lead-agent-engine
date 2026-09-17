import { ExtractedItem, ActiveClientFromAdmin } from './types';
import { RawScrapedPost } from './jina';

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 1. HÀM AI TỰ ĐỘNG TẠO DORKING THỜI GIAN THỰC TỪ CỘT H TRÊN SHEET
export async function generateDorksFromNiche(nicheString: string, geminiKey: string): Promise<string[]> {
  const MODEL = 'gemini-3.1-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${geminiKey}`;

  const prompt = `
Dưới đây là định nghĩa ngách khách hàng do người dùng nhập từ trang quản trị:
"${nicheString}"

Nhiệm vụ: Hãy tạo ra 4 câu Google Dorking tiếng Việt cực kỳ linh hoạt (bao gồm cả văn nói, từ lóng, cụm từ tìm kiếm trên Threads, Facebook Groups, TikTok, Diễn đàn) để săn đúng những bài đăng tìm mua/thuê/sử dụng dịch vụ này.
Quy tắc:
- Tận dụng từ khóa chính, khu vực địa lý và từ khóa loại trừ (-) nếu có trong chuỗi.
- Trả về đúng mảng JSON gồm 4 chuỗi dorking: ["dork 1", "dork 2", "dork 3", "dork 4"]
`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });
    const data = (await res.json()) as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? JSON.parse(text) : [nicheString];
  } catch {
    return [nicheString];
  }
}

// 2. HÀM AI THẨM ĐỊNH HÀNG LOẠT & PHÂN TẦNG THỜI GIAN THEO GÓI
export async function batchEvaluateContent(
  posts: RawScrapedPost[],
  client: ActiveClientFromAdmin,
  geminiKey: string
): Promise<ExtractedItem[]> {
  if (posts.length === 0) return [];

  const MODEL = 'gemini-3.1-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${geminiKey}`;

  const now = new Date();
  const todayVN = now.toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  // PHÂN TẦNG THỜI GIAN DỰA THEO MÃ SKU / GÓI DỊCH VỤ
  let timeFilterRule = '';
  const isHighTier = client.sku.includes('PRO') || client.sku.includes('TRI'); // Gói Cao Cấp hoặc Dùng Thử 0đ

  if (isHighTier) {
    timeFilterRule = `
    🔥 CHẾ ĐỘ: [GÓI CAO CẤP REAL-TIME].
    - ƯU TIÊN DUYỆT CÁC BÀI ĐĂNG TRONG VÒNG 24 GIỜ QUA ("vừa xong", "vài giờ trước", "1 ngày trước").
    - Bóc tách đầy đủ và chính xác số điện thoại/Zalo, ngân sách và liên hệ trực tiếp.
    `;
  } else {
    timeFilterRule = `
    📦 CHẾ ĐỘ: [GÓI TRẢI NGHIỆM 99K & TIÊU CHUẨN - DATA CÓ ĐỘ TRỄ].
    - CHỈ DUYỆT các bài đăng từ 2 ĐẾN 7 NGÀY TRƯỚC ("2 ngày trước", "3 ngày trước", "4-6 ngày trước").
    - ⚠️ TUYỆT ĐỐI LOẠI BỎ ("isValid = false") các bài đăng siêu mới trong vòng 48 giờ qua ("vừa xong", "vài giờ trước", "1 ngày trước") để bảo lưu tính năng cho gói Cao Cấp.
    - LOẠI BỎ bài quá 7 ngày (từ tháng trước, năm ngoái).
    `;
  }

  const formattedPostsText = posts.map((post, index) => `
--- [BÀI VIẾT #${index + 1}] ---
ID: ${index + 1}
PLATFORM: ${post.platform}
URL: ${post.url}
NỘI DUNG RAW:
${post.rawContent.slice(0, 1500)}
`).join('\n\n');

  const prompt = `
Bạn là chuyên gia thẩm định nhu cầu khách hàng cho ngách: "${client.nicheDefinition}".
HÔM NAY LÀ NGÀY: ${todayVN} (Giờ Việt Nam).

Dưới đây là danh sách ${posts.length} bài viết cào được.
Nhiệm vụ: Thẩm định và CHỈ TRẢ VỀ các bài viết ĐẠT CHUẨN theo quy tắc sau:

=== DANH SÁCH BÀI VIẾT ===
${formattedPostsText}
==========================

QUY TẮC THẨM ĐỊNH CHO KHÁCH HÀNG [${client.name}]:
1. TIÊU CHÍ DUYỆT: Người đăng bài có nhu cầu THẬT sự tìm mua/thuê/sử dụng dịch vụ đúng theo mô tả: "${client.nicheDefinition}".
2. TIÊU CHÍ LOẠI BỎ: Người bán/môi giới chào dịch vụ, bài quảng cáo, bài spam.
3. QUY TẮC PHÂN TẦNG THỜI GIAN THEO GÓI DỊCH VỤ:
${timeFilterRule}

TIÊU CHÍ TRẢ VỀ:
- scoreOrPriority: Đánh giá độ nét từ 1-5 ⭐ kèm lý do ngắn.
- extraField1: Ngân sách / Nhu cầu chi tiết.
- extraField2: SĐT / Zalo / Link liên hệ của người cần mua.
`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                url: { type: 'STRING' },
                platform: { type: 'STRING' },
                postedAgo: { type: 'STRING' },
                categoryTag: { type: 'STRING' },
                scoreOrPriority: { type: 'STRING' },
                title: { type: 'STRING' },
                contentOrBrief: { type: 'STRING' },
                extraField1: { type: 'STRING' },
                extraField2: { type: 'STRING' }
              },
              required: ['url', 'platform', 'postedAgo', 'categoryTag', 'scoreOrPriority', 'title', 'contentOrBrief', 'extraField1', 'extraField2']
            }
          }
        }
      })
    });

    if (!response.ok) return [];

    const data = (await response.json()) as any;
    const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!jsonText) return [];

    const approvedItems = JSON.parse(jsonText) as any[];
    const validItems: ExtractedItem[] = [];

    for (const item of approvedItems) {
      if (item.url) {
        validItems.push({
          scanTime: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
          platform: item.platform,
          postedAgo: item.postedAgo,
          categoryTag: item.categoryTag || '[Lead Tiềm Năng]',
          scoreOrPriority: item.scoreOrPriority,
          title: item.title,
          contentOrBrief: item.contentOrBrief,
          extraField1: item.extraField1,
          extraField2: item.extraField2,
          url: item.url
        });
      }
    }

    return validItems;
  } catch (err: any) {
    console.error('[Gemini Batch] Lỗi:', err.message);
    return [];
  }
}
