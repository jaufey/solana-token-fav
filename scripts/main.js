const TRACKED_TOKENS = [
  { mint: "EyiVQN5W1s2z3DPrbZnQuxyzQBPpzvc1inyScUxxpump" },
  { mint: "3sLSDYfmbu5ZdmC7wbBUzvwRFE6S1dtrTUafuhhApump" },
  { mint: "2GX27q7vmNSUx7P3Xpu9HfD7KP8VZXqGcPcK7bxpump" },
  { mint: "Bk8bozHooHNkUDaeXqydtA3NpUuDavhKqBHD3a6Xpump" }
];

const TOKEN_INFO_API = "https://lite-api.jup.ag/tokens/v2/search";
const TOKEN_PRICE_API = "https://lite-api.jup.ag/price/v3";
const QUERY_LIMIT_INFO = 100;
const QUERY_LIMIT_PRICE = 50;

const tokenGrid = document.getElementById("token-grid");
const template = document.getElementById("token-card-template");
const refreshButton = document.getElementById("refresh-button");
const refreshSelect = document.getElementById("refresh-select");
const lastUpdated = document.getElementById("last-updated");

let refreshTimerId = null;
const previousPrices = new Map();

function chunk(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

async function fetchTokenInfos(mints) {
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

async function fetchTokenPrices(mints) {
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

function formatNumber(value, { style = "decimal", maximumFractionDigits = 2 } = {}) {
  if (value == null || Number.isNaN(value)) return "--";
  return new Intl.NumberFormat("zh-CN", {
    style,
    currency: style === "currency" ? "USD" : undefined,
    maximumFractionDigits,
    notation: style === "currency" && value >= 1_000_000 ? "compact" : undefined
  }).format(value);
}

function formatCurrency(value) {
  if (value == null || Number.isNaN(value)) return "--";
  const opts = {
    style: "currency",
    maximumFractionDigits: value < 1 ? 6 : value < 10 ? 4 : 2
  };
  return formatNumber(value, opts);
}

function formatPercent(value) {
  if (value == null || Number.isNaN(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function buildAuditList(audit) {
  if (!audit) return [];
  const result = [];
  if (audit.mintAuthorityDisabled != null) {
    result.push(`Mint Authority ${audit.mintAuthorityDisabled ? "已禁用" : "未禁用"}`);
  }
  if (audit.freezeAuthorityDisabled != null) {
    result.push(`Freeze Authority ${audit.freezeAuthorityDisabled ? "已禁用" : "未禁用"}`);
  }
  if (audit.topHoldersPercentage != null) {
    result.push(`前十大持币占比 ${audit.topHoldersPercentage.toFixed(2)}%`);
  }
  if (audit.devBalancePercentage != null) {
    result.push(`开发者持币占比 ${(audit.devBalancePercentage * 100).toFixed(4)}%`);
  }
  if (audit.devMigrations != null) {
    result.push(`开发者迁移次数 ${audit.devMigrations}`);
  }
  if (audit.highSingleOwnership != null) {
    result.push(`单一地址高持币：${audit.highSingleOwnership ? "是" : "否"}`);
  }
  return result;
}

function setLink(anchor, href) {
  if (href) {
    anchor.href = href;
    anchor.hidden = false;
  } else {
    anchor.hidden = true;
  }
}

function renderTokens(tokens) {
  tokenGrid.replaceChildren();

  if (!tokens.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "暂无收藏 Token，请在 scripts/main.js 中添加 mint 地址。";
    tokenGrid.append(empty);
    return;
  }

  for (const token of tokens) {
    const { info, price } = token;
    const node = template.content.firstElementChild.cloneNode(true);

    const icon = node.querySelector(".token-icon");
    icon.loading = "lazy";
    icon.src = info?.icon ?? "https://placehold.co/80x80/20232a/8b949e?text=Token";
    icon.alt = info?.symbol ? `${info.symbol} 图标` : "Token 图标";

    node.querySelector("h2").textContent = info?.name ?? "未知 Token";
    node.querySelector(".symbol").textContent = info?.symbol ? `#${info.symbol}` : token.mint.slice(0, 6);

    const usdPrice = price?.usdPrice ?? info?.usdPrice;
    const marketCap = info?.mcap;
    const liquidity = info?.liquidity;
    const priceChange = price?.priceChange24h ?? info?.stats24h?.priceChange;

    const priceField = node.querySelector(".price");
    priceField.textContent = formatCurrency(usdPrice);
    const previous = previousPrices.get(token.mint);
    if (previous != null && usdPrice != null) {
      const diff = usdPrice - previous;
      if (Math.abs(diff) > 0) {
        const trend = document.createElement("span");
        trend.className = "price-trend";
        trend.textContent = ` (${diff > 0 ? "↑" : "↓"}${formatNumber(Math.abs(diff), {
          style: "currency",
          maximumFractionDigits: usdPrice < 1 ? 6 : 4
        })})`;
        priceField.appendChild(trend);
      }
    }

    node.querySelector(".market-cap").textContent = marketCap != null ? formatCurrency(marketCap) : "--";
    node.querySelector(".liquidity").textContent = liquidity != null ? formatCurrency(liquidity) : "--";

    const changeField = node.querySelector(".price-change");
    changeField.textContent = formatPercent(priceChange);
    if (priceChange != null) {
      changeField.classList.add(priceChange >= 0 ? "gain" : "loss");
    }

    const links = {
      website: info?.website,
      twitter: info?.twitter,
      telegram: info?.telegram
    };
    setLink(node.querySelector(".website"), links.website);
    setLink(node.querySelector(".twitter"), links.twitter);
    setLink(node.querySelector(".telegram"), links.telegram);

    const auditContainer = node.querySelector(".audit");
    const auditItems = buildAuditList(info?.audit);
    if (auditItems.length) {
      const list = auditContainer.querySelector("ul");
      for (const item of auditItems) {
        const li = document.createElement("li");
        li.textContent = item;
        list.appendChild(li);
      }
      auditContainer.hidden = false;
    }

    tokenGrid.append(node);
  }
}

async function refresh() {
  const mints = TRACKED_TOKENS.map((token) => token.mint);
  if (!mints.length) {
    renderTokens([]);
    lastUpdated.textContent = "请先添加需要跟踪的 Token mint 地址";
    return;
  }

  lastUpdated.textContent = "数据加载中…";
  tokenGrid.classList.add("loading");

  try {
    const [infoMap, priceMap] = await Promise.all([
      fetchTokenInfos(mints),
      fetchTokenPrices(mints)
    ]);

    const merged = mints.map((mint) => ({
      mint,
      info: infoMap.get(mint) ?? null,
      price: priceMap.get(mint) ?? null
    }));

    renderTokens(merged);

    for (const { mint, price, info } of merged) {
      const value = price?.usdPrice ?? info?.usdPrice;
      if (value != null) {
        previousPrices.set(mint, value);
      }
    }

    const now = new Date();
    lastUpdated.textContent = `最后更新：${now.toLocaleString("zh-CN", {
      hour12: false
    })}`;
  } catch (error) {
    console.error(error);
    const errorBox = document.createElement("div");
    errorBox.className = "empty-state";
    errorBox.textContent = `加载失败：${error.message}`;
    tokenGrid.replaceChildren(errorBox);
    lastUpdated.textContent = "加载失败，请稍后重试";
  } finally {
    tokenGrid.classList.remove("loading");
  }
}

function scheduleRefresh() {
  if (refreshTimerId) {
    clearInterval(refreshTimerId);
  }
  const interval = Number.parseInt(refreshSelect.value, 10);
  if (Number.isFinite(interval) && interval > 0) {
    refreshTimerId = setInterval(refresh, interval);
  }
}

refreshButton.addEventListener("click", () => {
  refresh();
});

refreshSelect.addEventListener("change", () => {
  scheduleRefresh();
  refresh();
});

refresh().then(() => {
  scheduleRefresh();
});
