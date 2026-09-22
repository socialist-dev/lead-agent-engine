import { ExtractedItem, ActiveClientFromAdmin } from './types';
import { RawScrapedPost } from './jina';

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Hàm chuẩn hóa ngày giờ quét theo đúng định dạng Việt Nam: dd/MM/yyyy HH:mm:ss
function formatScanTimeVN(): string {
  const now = new Date();
  // Chuyển sang giờ Việt Nam (UTC+7)
  const vnTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const d = String(vnTime.getDate()).padStart(2, '0');
  const m = String(vnTime.getMonth() + 1).padStart(2, '0');
  const y = vnTime.getFullYear();
  const h = String(vnTime.getHours()).padStart(2, '0');
  const min = String(vnTime.getMinutes()).padStart(2, '0');
  const s = String(vnTime.getSeconds()).padStart(2, '0');
  return `${d}/${m}/${y} ${h}:${min}:${s}`;
}

// 1. HÀM AI TẠO DORKING TỰ NHIÊN
export async function generateDorksFromNiche(nicheString: string, geminiKey: string): Promise<string[]> {
  const MODEL = 'gemini-3.1-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${geminiKey}`;

  const prompt = `
Bạn là chuyên gia săn Lead trên mạng xã hội Việt Nam.
Khách hàng cần tìm: "${nicheString}"

Nhiệm vụ: Tạo ra đúng 4 câu tìm kiếm Google Dorking tự nhiên và hiệu quả nhất để tìm bài đăng của người cần mua/tư vấn/tìm dịch vụ.
Quy tắc:
- Không dùng ngoặc đơn lồng nhau phức tạp.
- Dùng từ ngữ tự nhiên người Việt hay hỏi trên Threads, Facebook, Diễn đàn.

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

// 2. HÀM AI THẨM ĐỊNH HÀNG LOẠT & ĐIỀN ĐỦ 100% CÁC CỘT DỮ LIỆU
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
    🔥 GÓI CAO CẤP: DUYỆT CÁC BÀI ĐĂNG MỚI TRONG 24 GIỜ QUA HOẶC GẦN ĐÂY.
    `;
  } else {
    timeFilterRule = `
    📦 GÓI TIÊU CHUẨN: DUYỆT các bài đăng trong vòng 7 ngày qua. LOẠI BỎ bài quá 7 ngày.
    `;
  }

  const formattedPostsText = posts.map((post, index) => `
--- [BÀI VIẾT #${index + 1}] ---
URL_GỐC: ${post.url}
PLATFORM: ${post.platform}
NỘI DUNG:
${post.rawContent.slice(0, 1500)}
`).join('\n\n');

  const prompt = `
Bạn là chuyên gia phân tích và bóc tách dữ liệu Lead cho khách hàng: "${client.nicheDefinition}".
HÔM NAY LÀ NGÀY: ${todayVN} (Giờ Việt Nam).

Dưới đây là danh sách ${posts.length} bài viết cào được:
=== DANH SÁCH BÀI VIẾT ===
${formattedPostsText}
==========================

QUY TẮC BẮT BUỘC ĐỂ ĐIỀN ĐẦY ĐỦ 100% DỮ LIỆU VÀO CÁC CỘT (TUYỆT ĐỐI KHÔNG ĐỂ TRỐNG):
1. url: BẮT BUỘC copy chính xác 100% đường link URL_GỐC của bài viết tương ứng.
2. platform: Nền tảng (Threads, Facebook, TikTok, X, Web...).
3. postedAgo (Cột C): Thời gian đăng bằng TIẾNG VIỆT (VD: "Vừa xong", "2 giờ trước", "1 ngày trước"). Không dùng tiếng Anh hay "N/A".
4. categoryTag (Cột D): Thẻ nhu cầu ngắn gọn (VD: "Tư vấn mở tài khoản", "Mua chung cư 2PN").
5. scoreOrPriority (Cột E): Điểm tiềm năng ngắn gọn: "5 ⭐", "4 ⭐", "3 ⭐".
6. title (Cột F): Tóm tắt tiêu đề nhu cầu của người đăng (TUYỆT ĐỐI KHÔNG ĐỂ TRỐNG).
7. contentOrBrief (Cột G): Tóm tắt chi tiết nội dung, câu hỏi, yêu cầu của bài viết (TUYỆT ĐỐI KHÔNG ĐỂ TRỐNG).
8. extraField1 (Cột H): Ngân sách hoặc nhu cầu cụ thể (VD: "Mở tài khoản sàn uy tín", "Tài chính 3 tỷ").
9. extraField2 (Cột I): SĐT hoặc Zalo nếu có (VD: "0981234567"). Nếu bài viết KHÔNG CÓ SĐT, BẮT BUỘC ghi là: "Chưa có SĐT (Inbox qua link bài)". TUYỆT ĐỐI KHÔNG DÁN LINK URL VÀO ĐÂY!

QUY TẮC THỜI GIAN:
${timeFilterRule}

CHỈ TRẢ VỀ MẢNG JSON CÁC BÀI ĐẠT CHUẨN CÓ NHU CẦU THẬT SỰ.
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

    const scanTimeFormatted = formatScanTimeVN(); // Chuẩn định dạng: dd/MM/yyyy HH:mm:ss

    for (const item of approvedItems) {
      if (item.url) {
        let cleanContact = String(item.extraField2 || "").trim();
        if (cleanContact.includes("http://") || cleanContact.includes("https://") || cleanContact.includes("facebook.com") || cleanContact === "") {
          cleanContact = "Chưa có SĐT (Inbox qua link bài)";
        }

        let cleanTime = String(item.postedAgo || "Mới đăng gần đây").trim();
        cleanTime = cleanTime
          .replace(/days? ago/gi, "ngày trước")
          .replace(/hours? ago/gi, "giờ trước")
          .replace(/mins? ago/gi, "phút trước")
          .replace(/N\/A/gi, "Mới đăng gần đây");

        validItems.push({
          scanTime: scanTimeFormatted,
          platform: item.platform || 'Mạng xã hội',
          postedAgo: cleanTime,
          categoryTag: item.categoryTag || '[Lead Tiềm Năng]',
          scoreOrPriority: item.scoreOrPriority || '5 ⭐',
          title: item.title || 'Nhu cầu khách hàng',
          contentOrBrief: item.contentOrBrief || 'Xem chi tiết tại link bài gốc',
          extraField1: item.extraField1 || 'Theo thỏa thuận',
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
