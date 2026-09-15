import { TaskDefinition } from './types';
import { searchJina, RawScrapedPost } from './jina';
import { searchFirecrawl } from './firecrawl';
import { batchEvaluateContent, generateDynamicDorks, sleep } from './gemini';
import { exportToClientSheet } from './sheet';

export async function runTask(
  task: TaskDefinition,
  keys: { jina: string; firecrawl: string; gemini: string; sheetUrl: string }
) {
  if (!task.enabled) {
    console.log(`⏩ [BỎ QUA] ${task.name} (Đang tắt)`);
    return;
  }

  console.log(`\n======================================================`);
  console.log(`🚀 BẮT ĐẦU QUÉT CHO KHÁCH: [${task.name}]`);
  console.log(`📍 SPREADSHEET ID: [${task.spreadsheetId}]`);
  console.log(`======================================================`);

  const rawPosts: RawScrapedPost[] = [];

  for (const dork of task.dorks) {
    console.log(`🔍 [Jina Search]: ${dork}`);
    const jinaRes = await searchJina(dork, keys.jina, task.timeFilter);
    rawPosts.push(...jinaRes);

    if (keys.firecrawl && jinaRes.length === 0) {
      const fcRes = await searchFirecrawl(dork, keys.firecrawl, task.timeFilter);
      rawPosts.push(...fcRes);
    }
    await sleep(500);
  }

  let uniquePosts = Array.from(new Map(rawPosts.map(p => [p.url, p])).values());

  if (uniquePosts.length < 3 && task.dynamicDorks?.enabled) {
    console.log(`⚡ Kết quả ít (<3). AI đang tự tạo Dorking bổ sung...`);
    const extraDorks = await generateDynamicDorks(task, keys.gemini);
    for (const dork of extraDorks) {
      const res = await searchJina(dork, keys.jina, task.timeFilter);
      rawPosts.push(...res);
    }
    uniquePosts = Array.from(new Map(rawPosts.map(p => [p.url, p])).values());
  }

  console.log(`📌 Gom được ${uniquePosts.length} bài viết thô.`);

  if (uniquePosts.length > 0) {
    const approvedJobs = await batchEvaluateContent(uniquePosts, task, keys.gemini);
    console.log(`🎯 AI đã duyệt ${approvedJobs.length}/${uniquePosts.length} lead chất lượng cao.`);

    for (const job of approvedJobs) {
      console.log(`✅ [${job.postedAgo}] [${job.categoryTag}] ${job.title}`);
    }

    if (approvedJobs.length > 0) {
      await exportToClientSheet(task.spreadsheetId, approvedJobs, keys.sheetUrl);
    }
  } else {
    console.log(`✨ Không cào được bài viết mới cho [${task.name}].`);
  }
}
