# Solana Meme Token 收藏夹

一个纯前端网页，用来跟踪并展示自选的 Solana Meme Token：
- 使用 Jupiter Lite API 获取 Token 的基础信息与价格。
- 展示图标、名称、符号、市值、流动性、24 小时涨跌等数据。
- 支持查看常用社区链接（官网 / Twitter / Telegram）。
- 可选择 3、5、10 分钟三个刷新频率，必要时也能手动立即刷新。

## 使用方式

1. 直接在本地打开 `index.html` 即可使用（无需构建或后台服务）。
2. 页面顶部的输入框支持一次粘贴一个或多个 mint（即使包含在 JSON 中也能自动识别），点击「添加」即可加入关注列表。
3. 已关注的 mint 会保存在浏览器的 localStorage 中，刷新或重开页面时会自动恢复；卡片右上角可随时移除关注。
4. 页面会按照当前选择的刷新间隔定时同步最新数据，也可以点击「立即刷新」强制更新。

> **提示**：
> - `https://lite-api.jup.ag/tokens/v2/search` 最多一次查询 100 个 mint；
> - `https://lite-api.jup.ag/price/v3` 最多一次查询 50 个 mint；
> - 本项目已自动分批请求，无需手动处理。

## 自定义

- 样式可以在 `styles.css` 中调整；
- 若要调整默认展示的 Token，可以修改 `scripts/main.js` 顶部的 `DEFAULT_MINTS` 列表；
- 若要展示更多信息，可以在 `scripts/main.js` 的 `renderTokens` 函数中补充字段；
- 若需要更短/更长的刷新间隔，也可以修改 `index.html` 中下拉选项的毫秒值。

## 开发小记

- 使用原生 ES Modules 与 `fetch`，无需构建工具。
- 对接口异常有基本的错误提示，方便排查。
- 默认会记住上一次获取的价格，在下一次更新时给出上涨/下跌与幅度提示。