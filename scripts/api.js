const TOKEN_INFO_API = "https://lite-api.jup.ag/tokens/v2/search";
const TOKEN_PRICE_API = "https://lite-api.jup.ag/price/v3";
const QUERY_LIMIT_INFO = 100;
const QUERY_LIMIT_PRICE = 50;

function chunk(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

export async function fetchTokenInfos(mints) {
  const infoMap = new Map();
  for (const mintChunk of chunk(mints, QUERY_LIMIT_INFO)) {
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
  }
  return infoMap;
}

export async function fetchTokenPrices(mints) {
  const priceMap = new Map();
  for (const mintChunk of chunk(mints, QUERY_LIMIT_PRICE)) {
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
  }
  return priceMap;
}