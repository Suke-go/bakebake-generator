import path from 'node:path';
import dotenv from 'dotenv';

const SEARCH_PAYLOAD = {
  handle: { id: 'user-001', text: 'テストユーザー' },
  answers: {
    event: '祭りに参加した夜に見た',
    where: '古い神社の境内',
    when: '秋の夕方',
    noticed: '不思議な形の影',
    texture: '薄い霧',
    alone: '1',
    reaction: '恐ろしくはないが不安',
    stance: '静観',
    absence: '行方の行方が分からない',
  },
};

const BASE_URL = process.env.PHASE3_TEST_BASE_URL ?? 'http://localhost:3000';
const REQUEST_TIMEOUT_MS = 60_000;

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

/** @type {(pathname:string, body:unknown) => Promise<{status:number, data:unknown}>} */
async function postJson(pathname, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'TypeError' && error.message.includes('fetch failed')) {
        throw new Error(`Could not reach API at ${BASE_URL}. Start dev server (npm run dev) and retry.`);
      }
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms`);
      }
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not found in .env.local');
  }

  const searchResult = await postJson('/api/search-folklore', SEARCH_PAYLOAD);
  assert(searchResult.status === 200, `search-folklore returned ${searchResult.status}`);
  assert(Array.isArray(searchResult.data?.folklore), 'search-folklore folklore is not array');
  assert(searchResult.data.folklore.length > 0, 'search-folklore has no results');
  console.log(`[1/3] search-folklore ok: ${searchResult.data.folklore.length} items`);

  const conceptsPayload = {
    folklore: searchResult.data.folklore.slice(0, 3),
    answers: SEARCH_PAYLOAD.answers,
    handle: SEARCH_PAYLOAD.handle,
  };

  const conceptResult = await postJson('/api/generate-concepts', conceptsPayload);
  assert(conceptResult.status === 200, `generate-concepts returned ${conceptResult.status}`);
  assert(Array.isArray(conceptResult.data?.concepts), 'generate-concepts concepts is not array');
  assert(conceptResult.data.concepts.length > 0, 'generate-concepts returned empty concepts');
  console.log(`[2/3] generate-concepts ok: ${conceptResult.data.concepts.length} concepts`);

  const concept = conceptResult.data.concepts[0];
  const imageResult = await postJson('/api/generate-image', {
    concept,
    artStyle: null,
    visualInput: 'foggy shrine path at dusk',
    answers: SEARCH_PAYLOAD.answers,
  });
  assert(imageResult.status === 200, `generate-image returned ${imageResult.status}`);
  assert(typeof imageResult.data?.narrative === 'string', 'generate-image narrative missing');
  console.log('[3/3] generate-image ok');

  const imageBase64 = imageResult.data.imageBase64 || '';
  if (imageBase64) {
    console.log('Phase3 smoke test passed. imageBase64 preview:', imageBase64.slice(0, 20));
  } else {
    console.log('Phase3 smoke test passed. imageBase64 empty (fallback path).');
  }
}

main().catch((error) => {
  console.error('[Phase3 smoke test] Failed:', error?.message || String(error));
  process.exit(1);
});
