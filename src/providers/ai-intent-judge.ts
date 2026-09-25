import { RawScrapedPost, ActiveClientFromAdmin } from '../types';
import { httpFetch } from '../infra/http-client';
import { geminiRateLimiter } from '../infra/rate-limiter';
import { logger } from '../infra/logger';

/**
 * GIAI ĐOẠN 1: AI INTENT JUDGE (Trọng Tài Độc Lập Thẩm Định Ý Định Mua Dương Tính)
 * Nhận vào danh sách bài viết thô và trả về CHỈ những bài có kết quả BINARY = YES
 */
export async function evaluateIntentBinary(
  posts: RawScrapedPost[],
  client: ActiveClientFromAdmin,
  geminiKey: string,
  model = 'gemini-3.1-flash-lite'
): Promise<RawScrapedPost[]> {
  if (posts.length === 0) return [];

  const passedPosts: RawScrapedPost[] = [];
  const CHUNK_SIZE = 10;

  for (let i = 0; i < posts.length; i += CHUNK_SIZE) {
    const chunk = posts.slice(i, i + CHUNK_SIZE);
    const approved = await judgeChunkBinary(chunk, client, geminiKey, model);
    passedPosts.push(...approved);
  }

  return passedPosts;
}

async function judgeChunkBinary(
  posts: RawScrapedPost[],
  client: ActiveClientFromAdmin,
  geminiKey: string,
  model: string
): Promise<RawScrapedPost[]> {
  await geminiRateLimiter.acquire();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

  const formattedPosts = posts
    .map(
      (p, idx) => `
[BÀI #${idx + 1}]
URL: ${p.url}
NỘI DUNG:
${p.rawContent.slice(0, 800)}
`
    )
    .join('\n---\n');

  const prompt = `
Bạn là TRỌNG TÀI THẨM ĐỊNH Ý ĐỊNH MUA HÀNG DƯƠNG TÍNH (STRICT BUYER INTENT JUDGE).
MỤC TIÊU KHÁCH HÀNG: Cần tìm bài viết của người thật sự muốn MUA / TỰ CHI TIỀN THUÊ / CẦN TƯ VẤN MUA SẢN PHẨM: "${client.nicheDefinition}".

Dưới đây là ${posts.length} bài viết cào được:
=== DANH SÁCH BÀI VIẾT ===
${formattedPosts}
==========================

QUY TẮC THẨM ĐỊNH CHẮC CHẮN (BINARY YES / NO):

CÂU HỎI QUYẾT ĐỊNH: Tác giả bài viết có phải là CÁ NHÂN / DOANH NGHIỆP ĐANG CÓ NHU CẦU TỰ MÓC TIỀN TÚI MUA HOẶC TÌM TƯ VẤN MUA THẬT SỰ CHO BẢN THÂN / GIA ĐÌNH VỚI DỊCH VỤ "${client.nicheDefinition}" HAY KHÔNG?

CÁC TRƯỜNG HỢP NGHÊU NGHĨ CẤM DUYỆT (BẮT BUỘC CHỌN NO):
1. NGHÀNH BẢO HIỂM: LOẠI BỎ LẬP TỨC nếu bài viết nói về offer việc làm, phúc lợi chế độ bảo hiểm công ty đóng khi đi làm, bảo hiểm xã hội bắt buộc, thủ tục rút BHXH 1 lần, bảo hiểm xe máy đối phó công an.
2. NGHÀNH Ô TÔ: LOẠI BỎ LẬP TỨC nếu từ "bmw" chỉ là thuê acc game Black Myth Wukong (kèm các từ game, steam, family share, acc, pass acc).
3. NGHÀNH BĐS: LOẠI BỎ LẬP TỨC nếu là tin tuyển dụng telesale, phòng trọ 1.5 triệu, hoặc thanh lý đồ cũ.
4. CHUNG: LOẠI BỎ LẬP TỨC nếu bài viết là người chào bán/môi giới, tin tức báo chí, hỏi kinh nghiệm phỏng vấn, trò chuyện phiếm, hoặc bình luận dạo không chứa ý định mua.

CHỈ TRẢ VỀ MẢNG JSON CÁC URL CỦA BÀI ĐẠT CHUẨN "YES":
["url_bai_1", "url_bai_2"]
Nếu không có bài nào đạt chuẩn, trả về mảng rỗng: []
`;

  try {
    const res = await httpFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'ARRAY',
            items: { type: 'STRING' }
          }
        }
      }),
      timeoutMs: 25000,
      retries: 2
    });

    if (!res.ok) return [];

    const data = (await res.json()) as any;
    let jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();

    let passedUrls: string[] = [];
    try {
      passedUrls = JSON.parse(jsonText);
    } catch {
      const match = jsonText.match(/\[\s*[\s\S]*?\s*\]/);
      if (match) {
        try {
          passedUrls = JSON.parse(match[0]);
        } catch {
          logger.warn(`[AI Intent Judge Stage 1] Lỗi parse JSON fallback cho [${client.name}]`);
        }
      }
    }

    if (!Array.isArray(passedUrls) || passedUrls.length === 0) return [];

    const passedSet = new Set(passedUrls.map(u => String(u).trim()));
    const approvedPosts = posts.filter(p => passedSet.has(p.url));

    logger.info(
      `⚖️ [AI Intent Judge Stage 1] [${client.name}]: Đã lọc ${approvedPosts.length}/${posts.length} bài đạt chuẩn ý định mua thật.`
    );
    return approvedPosts;
  } catch (err: any) {
    logger.warn(`[AI Intent Judge Stage 1] Lỗi: ${err.message}. Chuyển thẳng sang Stage 2.`);
    return posts;
  }
}
