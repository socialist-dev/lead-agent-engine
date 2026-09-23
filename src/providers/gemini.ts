import { ExtractedItem, ActiveClientFromAdmin, RawScrapedPost } from '../types';
import { getTimeFilterRule } from '../config';
import { formatScanTimeVN, cleanPhoneNumber, cleanStringField } from '../utils';
import { httpFetch } from '../infra/http-client';
import { geminiRateLimiter } from '../infra/rate-limiter';
import { logger } from '../infra/logger';
import { isToxicOrNsfw, isLeadTimeValid } from '../infra/content-filter';

export async function generateDorksFromNiche(
  nicheString: string,
  geminiKey: string,
  model = 'gemini-3.1-flash-lite'
): Promise<string[]> {
  await geminiRateLimiter.acquire();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

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
    const res = await httpFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      }),
      timeoutMs: 15000,
      retries: 2
    });

    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);

    const data = (await res.json()) as any;
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const dorks = JSON.parse(text) as string[];

    if (Array.isArray(dorks) && dorks.length > 0) return dorks;
    throw new Error('Invalid array response from Gemini');
  } catch (err: any) {
    logger.warn(`[Gemini Dorking] Fallback to regex dorks due to error: ${err.message}`);
    const clean = nicheString.replace(/tìm lead|nhu cầu|khách hàng/gi, '').replace(/\|/g, ' ').trim();
    return [
      `tư vấn ${clean}`,
      `cần tìm ${clean}`,
      `site:threads.net ${clean}`,
      `site:facebook.com/groups ${clean}`
    ];
  }
}

export async function batchEvaluateContent(
  posts: RawScrapedPost[],
  client: ActiveClientFromAdmin,
  geminiKey: string,
  model = 'gemini-3.1-flash-lite'
): Promise<ExtractedItem[]> {
  if (posts.length === 0) return [];

  // Split posts into chunks of 15 max to avoid hitting Gemini response token limits or producing truncated JSON
  const CHUNK_SIZE = 15;
  const chunks: RawScrapedPost[][] = [];
  for (let i = 0; i < posts.length; i += CHUNK_SIZE) {
    chunks.push(posts.slice(i, i + CHUNK_SIZE));
  }

  const allApprovedLeads: ExtractedItem[] = [];

  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    const chunkPosts = chunks[chunkIdx];
    const chunkItems = await evaluatePostChunk(chunkPosts, client, geminiKey, model, chunkIdx + 1, chunks.length);
    allApprovedLeads.push(...chunkItems);
  }

  return allApprovedLeads;
}

async function evaluatePostChunk(
  posts: RawScrapedPost[],
  client: ActiveClientFromAdmin,
  geminiKey: string,
  model: string,
  chunkNum: number,
  totalChunks: number
): Promise<ExtractedItem[]> {
  await geminiRateLimiter.acquire();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

  const now = new Date();
  const todayVN = now.toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const { ruleText: timeFilterRule } = getTimeFilterRule(client.sku);

  const formattedPostsText = posts
    .map(
      (post, index) => `
--- [BÀI VIẾT #${index + 1}] ---
URL_GỐC: ${post.url}
PLATFORM: ${post.platform}
NỘI DUNG:
${post.rawContent.slice(0, 1500)}
`
    )
    .join('\n\n');

  const prompt = `
Bạn là chuyên gia phân tích và bóc tách dữ liệu Lead cho khách hàng ngách: "${client.nicheDefinition}".
HÔM NAY LÀ NGÀY: ${todayVN} (Giờ Việt Nam).

Dưới đây là danh sách ${posts.length} bài viết cào được (Lượt ${chunkNum}/${totalChunks}):
=== DANH SÁCH BÀI VIẾT ===
${formattedPostsText}
==========================

QUY TẮC THẨM ĐỊNH LỌC LEAD:
1. TIÊU CHÍ DUYỆT: Chỉ duyệt bài viết/bình luận của NGƯỜI CẦN MUA / THUÊ / CẦN TƯ VẤN / TÌM DỊCH VỤ thật sự phù hợp với: "${client.nicheDefinition}".
2. TIÊU CHÍ LOẠI BỎ: Loại bỏ hoàn toàn người bán, môi giới, cò đất, tuyển dụng, bài chào mời dịch vụ, quảng cáo spam.
3. TIÊU CHÍ AN TOÀN NỘI DUNG: LOẠI BỎ HOÀN TOÀN bài viết chứa từ ngữ thô tục, khiếm nhã, 18+, bình luận chửi nhau, tâm sự cá nhân phiếm, hoặc bài viết đã bị gỡ.

QUY TẮC BẮT BUỘC ĐỂ ĐIỀN ĐẦY ĐỦ 100% DỮ LIỆU VÀO TẤT CẢ CÁC CỘT (TUYỆT ĐỐI KHÔNG ĐỂ TRỐNG HOẶC N/A):
1. url: Copy chính xác 100% đường link URL_GỐC của bài viết tương ứng.
2. platform: Nền tảng (Threads, Facebook, TikTok, X, Voz, Web...).
3. postedAgo (Cột C): Thời gian đăng bằng TIẾNG VIỆT (VD: "Vừa xong", "2 giờ trước", "1 ngày trước"). Không dùng tiếng Anh hay "N/A".
4. categoryTag (Cột D): Thẻ nhu cầu ngắn gọn (VD: "[Tư vấn mở tài khoản]", "[Mua chung cư 2PN]").
5. scoreOrPriority (Cột E): Điểm tiềm năng ngắn gọn (VD: "5 ⭐", "4 ⭐", "3 ⭐").
6. title (Cột F): Tóm tắt ngắn tiêu đề nhu cầu của người đăng (TUYỆT ĐỐI KHÔNG ĐỂ TRỐNG).
7. contentOrBrief (Cột G): Tóm tắt chi tiết nội dung, câu hỏi, yêu cầu bài viết (TUYỆT ĐỐI KHÔNG ĐỂ TRỐNG).
8. extraField1 (Cột H): Chi tiết nhu cầu hoặc ngân sách cụ thể phù hợp ngách "${client.nicheDefinition}" (VD: "Tài chính 3 tỷ", "Cần mở tài khoản gấp", "Thiết kế căn 70m2"). TUYỆT ĐỐI KHÔNG ĐỂ TRỐNG!
9. extraField2 (Cột I): SĐT hoặc Zalo nếu bài viết có đề cập (VD: "0981234567"). Nếu bài viết KHÔNG CÓ SĐT, BẮT BUỘC GHI LÀ: "Chưa có SĐT (Inbox qua link bài)". TUYỆT ĐỐI KHÔNG DÁN LINK URL VÀO ĐÂY!

QUY TẮC THỜI GIAN:
${timeFilterRule}

CHỈ TRẢ VỀ MẢNG JSON CÁC BÀI ĐẠT CHUẨN.
`;

  try {
    const response = await httpFetch(url, {
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
              required: [
                'url',
                'platform',
                'postedAgo',
                'categoryTag',
                'scoreOrPriority',
                'title',
                'contentOrBrief',
                'extraField1',
                'extraField2'
              ]
            }
          }
        }
      }),
      timeoutMs: 35000,
      retries: 2
    });

    if (!response.ok) {
      logger.error(`[Gemini Batch ${chunkNum}/${totalChunks}] HTTP Error ${response.status}`);
      return [];
    }

    const data = (await response.json()) as any;
    let jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!jsonText) return [];

    jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();

    let approvedItems: any[] = [];
    try {
      approvedItems = JSON.parse(jsonText);
    } catch {
      const match = jsonText.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (match) {
        try {
          approvedItems = JSON.parse(match[0]);
        } catch {
          logger.warn(`[Gemini Batch ${chunkNum}/${totalChunks}] Lỗi parse JSON array fallback`);
        }
      }
    }

    if (!Array.isArray(approvedItems)) return [];

    const validItems: ExtractedItem[] = [];
    const scanTimeFormatted = formatScanTimeVN();

    for (const item of approvedItems) {
      if (item && item.url) {
        let cleanTime = String(item.postedAgo || 'Mới đăng gần đây').trim();
        cleanTime = cleanTime
          .replace(/days? ago/gi, 'ngày trước')
          .replace(/hours? ago/gi, 'giờ trước')
          .replace(/mins? ago/gi, 'phút trước')
          .replace(/N\/A/gi, 'Mới đăng gần đây');

        // TẦNG 2: BỘ LỌC THỜI GIAN CỨNG (Chặn bài "6 tháng trước", "1 năm trước", "> 7 ngày")
        if (!isLeadTimeValid(cleanTime, 7)) {
          logger.warn(`🚫 [Gemini Filter] Bỏ qua bài do quá thời hạn: "${cleanTime}" (${item.url})`);
          continue;
        }

        // TẦNG 1: BỘ LỌC TỪ NGỮ THÔ TỤC / KHIẾM NHÃ / NSFW
        if (
          isToxicOrNsfw(item.title) ||
          isToxicOrNsfw(item.contentOrBrief) ||
          isToxicOrNsfw(item.extraField1) ||
          isToxicOrNsfw(item.url)
        ) {
          logger.warn(`🚫 [Gemini Filter] Bỏ qua bài chứa từ thô tục khiếm nhã (${item.url})`);
          continue;
        }

        const cleanContact = cleanPhoneNumber(item.extraField2);
        const scanTimeVal = scanTimeFormatted;
        const platformVal = cleanStringField(item.platform, 'Facebook');
        const postedAgoVal = cleanStringField(cleanTime, 'Mới đăng gần đây');
        const tagVal = cleanStringField(item.categoryTag, '[Lead Tiềm Năng]');
        const scoreVal = cleanStringField(item.scoreOrPriority, '5 ⭐');
        const titleVal = cleanStringField(item.title, 'Nhu cầu khách hàng');
        const contentVal = cleanStringField(item.contentOrBrief, 'Xem chi tiết tại link bài gốc');
        const extra1Val = cleanStringField(item.extraField1, 'Chi tiết theo nhu cầu (Xem bài gốc)');
        const extra2Val = cleanContact;
        const urlVal = String(item.url || '').trim();

        validItems.push({
          scanTime: scanTimeVal,
          date: scanTimeVal,
          platform: platformVal,
          postedAgo: postedAgoVal,
          time: postedAgoVal,
          categoryTag: tagVal,
          tag: tagVal,
          category: tagVal,
          scoreOrPriority: scoreVal,
          score: scoreVal,
          priority: scoreVal,
          title: titleVal,
          summary: titleVal,
          contentOrBrief: contentVal,
          content: contentVal,
          brief: contentVal,
          description: contentVal,
          extraField1: extra1Val,
          extra1: extra1Val,
          extraField2: extra2Val,
          extra2: extra2Val,
          phone: extra2Val,
          contact: extra2Val,
          url: urlVal,
          link: urlVal
        });

      }
    }

    return validItems;
  } catch (err: any) {
    logger.error(`[Gemini Batch ${chunkNum}/${totalChunks}] Lỗi: ${err.message}`);
    return [];
  }
}

