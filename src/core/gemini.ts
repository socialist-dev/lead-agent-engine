import { ExtractedItem, ActiveClientFromAdmin } from './types';
import { RawScrapedPost } from './jina';

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// =========================================================================
// 🌟 1. HÀM AI TẠO TRUY VẤN TỰ NHIÊN & DORKING LINH HOẠT (KHÔNG BÓP NGHẸT TỪ KHÓA)
// =========================================================================
export async function generateDorksFromNiche(nicheString: string, geminiKey: string): Promise<string[]> {
  const MODEL = 'gemini-3.1-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${geminiKey}`;

  const prompt = `
Bạn là chuyên gia săn Lead thực chiến trên mạng xã hội Việt Nam (Threads, Facebook, TikTok, Diễn đàn).
Khách hàng muốn tìm kiếm khách hàng có nhu cầu: "${nicheString}"

Nhiệm vụ: Hãy tạo ra đúng 4 câu tìm kiếm Google/Dorking tự nhiên, đơn giản và hiệu quả nhất để gom được NHIỀU BÀI VIẾT NHẤT.

QUY TẮC BẮT BUỘC ĐỂ KHÔNG BỊ 0 KẾT QUẢ:
1. KHÔNG dùng ngoặc đơn lồng nhau phức tạp kiểu: (A OR B) (C OR D) (E OR F).
2. DÙNG CÂU TỪ TỰ NHIÊN NGƯỜI VIỆT HAY ĐĂNG:
   - Thay vì ép ngoặc, hãy viết: tư vấn mua xe mercedes OR bmw OR audi sài gòn
   - Thay vì ép ngoặc, hãy viết: cần mua căn hộ vinhomes đà nẵng
   - Thay vì ép ngoặc, hãy viết: nên mở tài khoản chứng khoán sàn nào uy tín
3. MẪU 4 CÂU TRẢ VỀ:
   - Câu 1 (Tìm nhu cầu rộng): [Hành động: cần mua/tư vấn/tìm] + [Tên sản phẩm/dịch vụ] + [Địa điểm nếu có]
   - Câu 2 (Văn nói hỏi kinh nghiệm): nên mua/chọn [Sản phẩm] nào OR xin review [Sản phẩm]
   - Câu 3 (Mạng xã hội Threads/Facebook): site:threads.net OR site:facebook.com/groups [Sản phẩm ngắn gọn]
   - Câu 4 (Diễn đàn/Video): site:voz.vn OR site:tiktok.com OR site:otofun.net [Sản phẩm]

Trả về đúng mảng JSON gồm 4 chuỗi:
["câu 1", "câu 2", "câu 3", "câu 4"]
`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      })
    });

    if (!res.ok) throw new Error("API Error");

    const data = (await res.json()) as any;
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const dorks = JSON.parse(text) as string[];

    if (Array.isArray(dorks) && dorks.length > 0) {
      return dorks;
    }
    throw new Error("Invalid array");
  } catch (err: any) {
    console.warn(`[Gemini Dork Gen] Tự động tạo dork thông minh cho ngách: "${nicheString}"`);
    
    // Tách các từ khóa chính một cách thông minh
    const clean = nicheString.replace(/tìm lead|nhu cầu|khách hàng/gi, "").replace(/\|/g, " ").trim();
    return [
      `tư vấn ${clean}`,
      `cần tìm ${clean}`,
      `site:threads.net ${clean}`,
      `site:facebook.com/groups ${clean}`
    ];
  }
}

// =========================================================================
// 🌟 2. HÀM AI THẨM ĐỊNH HÀNG LOẠT (SINGLE BATCH)
// =========================================================================
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

  // Phân tầng thời gian
  let timeFilterRule = '';
  const isHighTier = client.sku.includes('PRO') || client.sku.includes('TRI');

  if (isHighTier) {
    timeFilterRule = `
    🔥 CHẾ ĐỘ: [GÓI CAO CẤP REAL-TIME].
    - DUYỆT CÁC BÀI ĐĂNG MỚI TRONG VÒNG 24 GIỜ QUA HOẶC GẦN ĐÂY.
    - Bóc tách chính xác số điện thoại/Zalo, ngân sách và nhu cầu của người mua.
    `;
  } else {
    timeFilterRule = `
    📦 CHẾ ĐỘ: [GÓI TRẢI NGHIỆM & TIÊU CHUẨN].
    - DUYỆT các bài đăng trong vòng 7 ngày qua.
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
1. TIÊU CHÍ DUYỆT: Người đăng có nhu cầu thật sự tìm mua/thuê/tư vấn/sử dụng dịch vụ liên quan đến: "${client.nicheDefinition}".
2. TIÊU CHÍ LOẠI BỎ: Người bán/môi giới chào dịch vụ, bài quảng cáo spam.
3. QUY TẮC THỜI GIAN:
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
    let jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!jsonText) return [];

    jsonText = jsonText.replace(/```json/g, "").replace(/```/g, "").trim();
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
