import { TaskDefinition, ExtractedItem } from './types';
import { RawScrapedPost } from './jina';

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function batchEvaluateContent(
  posts: RawScrapedPost[],
  task: TaskDefinition,
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

  const formattedPostsText = posts.map((post, index) => `
--- [BÀI VIẾT #${index + 1}] ---
ID: ${index + 1}
PLATFORM: ${post.platform}
URL: ${post.url}
NỘI DUNG RAW:
${post.rawContent.slice(0, 1500)}
`).join('\n\n');

  const prompt = `
${task.aiPrompt.systemRole}
HÔM NAY LÀ NGÀY: ${todayVN} (Giờ Việt Nam).

Dưới đây là danh sách ${posts.length} bài viết cào được từ mạng xã hội/diễn đàn.
Nhiệm vụ: Hãy thẩm định TOÀN BỘ danh sách và CHỈ TRẢ VỀ các bài viết ĐẠT CHUẨN theo quy tắc bên dưới.

=== DANH SÁCH BÀI VIẾT (${posts.length} BÀI) ===
${formattedPostsText}
==============================================

QUY TẮC THẨM ĐỊNH CHO TÁC VỤ [${task.name}]:
${task.aiPrompt.validationRules}

TIÊU CHÍ BẮT BUỘC ĐỂ DUYỆT (CHỈ TRẢ VỀ BÀI ĐẠT CHUẨN):
1. LỌC THỜI GIAN: So sánh với ngày HÔM NAY (${todayVN}). CHỈ LẤY bài đăng trong 7 ngày trở lại ("vừa xong", "1-6 ngày trước"...). LOẠI BỎ bài từ tháng trước, năm ngoái, > 7 ngày.
2. PHÂN LOẠI TAG: Chọn tag từ danh sách: [${task.aiPrompt.categoryTags.join(', ')}].
3. THÔNG TIN PHỤ:
   - extraField1: Trích xuất ${task.aiPrompt.extraField1Label}.
   - extraField2: Trích xuất ${task.aiPrompt.extraField2Label}.
4. CHỈ TRẢ VỀ MẢNG CÁC BÀI ĐẠT YÊU CẦU (Bỏ qua bài rác, bài chào dịch vụ hoặc bài cũ).
`;

  try {
    console.log(`🧠 [Gemini 3.1] Đang thẩm định hàng loạt ${posts.length} bài viết trong 1 request...`);
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

    if (!response.ok) {
      console.error('[Gemini Batch] Lỗi API:', await response.text());
      return [];
    }

    const data = (await response.json()) as any;
    const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!jsonText) return [];

    const approvedItems = JSON.parse(jsonText) as any[];
    const currentYear = now.getFullYear().toString();
    const validItems: ExtractedItem[] = [];

    for (const item of approvedItems) {
      const lower = (item.postedAgo || '').toLowerCase();
      const isOld = (
        (lower.includes('tháng') && !lower.includes('trước')) ||
        lower.includes('month') ||
        lower.includes('tuần trước') ||
        lower.includes('weeks ago') ||
        (lower.match(/202[0-5]/) && !lower.includes(currentYear))
      );

      if (!isOld && item.url) {
        validItems.push({
          scanTime: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
          platform: item.platform,
          postedAgo: item.postedAgo,
          categoryTag: item.categoryTag,
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

export async function generateDynamicDorks(task: TaskDefinition, geminiKey: string): Promise<string[]> {
  if (!task.dynamicDorks?.enabled) return [];
  const MODEL = 'gemini-3.1-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${geminiKey}`;

  const prompt = `
Hãy tạo 3 câu Google Dorking nâng cao dựa trên yêu cầu sau:
${task.dynamicDorks.instruction}
Trả về mảng JSON 3 chuỗi: ["dork 1", "dork 2", "dork 3"]
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
    return text ? JSON.parse(text) : [];
  } catch {
    return [];
  }
}
