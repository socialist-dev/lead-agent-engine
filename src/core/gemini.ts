import { ExtractedItem, ActiveClientFromAdmin } from './types';
import { RawScrapedPost } from './jina';

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// =========================================================================
// 🌟 1. HÀM AI TẠO TRUY VẤN TỰ NHIÊN & DORKING LINH HOẠT
// =========================================================================
export async function generateDorksFromNiche(nicheString: string, geminiKey: string): Promise<string[]> {
  const MODEL = 'gemini-3.1-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${geminiKey}`;

  const prompt = `
Bạn là chuyên gia săn Lead thực chiến trên mạng xã hội Việt Nam (Threads, Facebook, TikTok, Diễn đàn).
Khách hàng muốn tìm kiếm khách hàng có nhu cầu: "${nicheString}"

Nhiệm vụ: Tạo ra đúng 4 câu tìm kiếm Google/Dorking tự nhiên, đơn giản và hiệu quả nhất để gom được NHIỀU BÀI VIẾT NHẤT.

QUY TẮC BẮT BUỘC:
1. KHÔNG dùng ngoặc đơn lồng nhau phức tạp (A OR B) (C OR D).
2. Dùng câu từ tự nhiên người Việt hay đăng bài tìm kiếm/hỏi han.
3. CẤU TRÚC 4 CÂU TRẢ VỀ:
   - Câu 1: [Hành động: cần tìm/tư vấn/muốn] + [Sản phẩm/Dịch vụ] + [Địa điểm nếu có]
   - Câu 2: nên mua/chọn [Sản phẩm] nào OR xin review [Sản phẩm]
   - Câu 3: (site:threads.net OR site:facebook.com/groups) [Sản phẩm ngắn gọn]
   - Câu 4: (site:voz.vn OR site:tiktok.com OR site:otofun.net) [Sản phẩm]

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
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    if (!res.ok) throw new Error("API Error");

    const data = (await res.json()) as any;
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const dorks = JSON.parse(text) as string[];

    if (Array.isArray(dorks) && dorks.length > 0) return dorks;
    throw new Error("Invalid array");
  } catch (err: any) {
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
// 🌟 2. HÀM AI THẨM ĐỊNH HÀNG LOẠT & CHUẨN HÓA DỮ LIỆU CỘT
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

  let timeFilterRule = '';
  const isHighTier = client.sku.includes('PRO') || client.sku.includes('TRI');

  if (isHighTier) {
    timeFilterRule = `
    🔥 CHẾ ĐỘ: [GÓI CAO CẤP REAL-TIME].
    - DUYỆT CÁC BÀI ĐĂNG MỚI TRONG VÒNG 24 GIỜ QUA HOẶC GẦN ĐÂY.
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

QUY TẮC ĐỊNH DẠNG CỘT BẮT BUỘC (ĐỂ KHÔNG BỊ LỘN XỘN TRÊN EXCEL):
- postedAgo (Thời gian đăng): BẮT BUỘC dùng tiếng Việt có dấu dạng: "Vừa xong", "X giờ trước" (VD: "2 giờ trước"), "X ngày trước" (VD: "1 ngày trước", "3 ngày trước"). TUYỆT ĐỐI KHÔNG dùng tiếng Anh (1 day ago, 5 days ago, Feb 24...) hay chữ "N/A". Nếu không rõ giờ thì ghi "Mới đăng gần đây".
- scoreOrPriority (Độ tiềm năng): Định dạng chuẩn ngắn gọn: "5/5 ⭐ (Nhu cầu gấp)", "4/5 ⭐ (Cần tư vấn)", "3/5 ⭐ (Hỏi tham khảo)".
- extraField1 (Ngân sách / Nhu cầu): Tóm tắt tầm giá hoặc nhu cầu cụ thể (VD: "Tài chính 3 tỷ", "Mở tài khoản sàn uy tín").
- extraField2 (SĐT / Liên hệ): CHỈ LẤY SỐ ĐIỆN THOẠI HOẶC ZALO (VD: "0981234567"). Nếu bài viết KHÔNG CÓ số điện thoại, BẮT BUỘC GHI LÀ "Chưa có SĐT (Inbox qua link bài)". TUYỆT ĐỐI KHÔNG COPY LẠI ĐƯỜNG LINK URL VÀO ĐÂY!
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
        // Hậu xử lý bằng Code: Chống tuyệt đối việc nhét URL vào cột SĐT
        let cleanContact = String(item.extraField2 || "").trim();
        if (cleanContact.includes("http://") || cleanContact.includes("https://") || cleanContact.includes("facebook.com")) {
          cleanContact = "Chưa có SĐT (Inbox qua link bài)";
        }

        // Hậu xử lý Thời gian tiếng Việt
        let cleanTime = String(item.postedAgo || "Mới đăng gần đây").trim();
        cleanTime = cleanTime
          .replace(/days? ago/gi, "ngày trước")
          .replace(/hours? ago/gi, "giờ trước")
          .replace(/mins? ago/gi, "phút trước")
          .replace(/N\/A/gi, "Mới đăng gần đây");

        validItems.push({
          scanTime: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
          platform: item.platform,
          postedAgo: cleanTime,
          categoryTag: item.categoryTag || '[Lead Nhu Cầu]',
          scoreOrPriority: item.scoreOrPriority,
          title: item.title,
          contentOrBrief: item.contentOrBrief,
          extraField1: item.extraField1,
          extraField2: cleanContact,
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
