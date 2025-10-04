const TOKEN_INFO_API = "https://lite-api.jup.ag/tokens/v2/search";
const TOKEN_PRICE_API = "https://lite-api.jup.ag/price/v3";
const QUERY_LIMIT_INFO = 40;
const QUERY_LIMIT_PRICE = 40;
const CHUNK_DELAY = 2000; // 批次请求之间的延迟（毫秒）

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function chunk(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

export async function fetchTokenInfos(mints) {
  const infoMap = new Map();
  const chunks = chunk(mints, QUERY_LIMIT_INFO);
  for (let i = 0; i < chunks.length; i++) {
    const mintChunk = chunks[i];
    const url = new URL(TOKEN_INFO_API);
    url.searchParams.set("query", mintChunk.join(","));

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`获取 Token 基础信息失败: ${response.status}`);
    }

    const data = await response.json();
    for (const token of data) {
      infoMap.set(token.id, token);
    }

    if (i < chunks.length - 1) {
      await sleep(CHUNK_DELAY);
    }
  }
  return infoMap;
}

export async function fetchTokenPrices(mints) {
  const priceMap = new Map();
  const chunks = chunk(mints, QUERY_LIMIT_PRICE);
  for (let i = 0; i < chunks.length; i++) {
    const mintChunk = chunks[i];
    const url = new URL(TOKEN_PRICE_API);
    url.searchParams.set("ids", mintChunk.join(","));

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`获取 Token 价格失败: ${response.status}`);
    }
    const data = await response.json();
    for (const [mint, value] of Object.entries(data)) {
      priceMap.set(mint, value);
    }

    if (i < chunks.length - 1) {
      await sleep(CHUNK_DELAY);
    }
  }
  return priceMap;
}