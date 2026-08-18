# CLAUDE.md

給 Claude Code（claude.ai/code）在這個 repo 工作時的指引。

## 專案概述

旅行記帳 PWA。整個 App 只有一個 `index.html`（CSS／HTML／JS 全寫在裡面），
沒有建置工具、框架或套件管理器。前身是 `Tokyo-2026` 行程網頁裡的 Wallet 記帳功能，
拆出來改成不綁定特定旅程的通用版。

## 開發與部署

- **無建置步驟**：直接編輯 `index.html`，用瀏覽器開啟即可預覽。
- **部署**：`git push` 到 `main`，GitHub Pages 自動部署。
- **改完程式碼一定要升 `sw.js` 的 `CACHE_NAME` 版本號**（`travel-ledger-v1` → `v2`），
  否則已安裝的裝置吃舊快取、收不到更新提示。
- 新增靜態檔案（圖片等）要同步加進 `sw.js` 的 `PRECACHE_URLS`。

## 架構

`index.html` 由上到下分成三段：`<style>`、HTML 結構、單一 `<script>`。

JS 的區塊順序（每段前面都有 `══` 分隔註解）：

1. **設定**——`S` 是目前設定（幣別、符號、匯率、分類、付款方式），
   `DEFAULT_SETTINGS` 是預設值；`applySettings()` 負責把設定灌進所有下拉選單與按鈕。
2. **資料存取**——`getItems()` / `saveItems()`。永遠先寫 `localStorage`，
   有登入 Firebase 才額外 `fbPush()`。縮圖走 `getThumb()` / `setThumb()`，
   刻意**不進雲端**（Firestore 單一文件 1 MB 上限）。
3. **記錄列表**——`renderLedger()` 產生「日期 → 店家 → 品項」兩層分組 HTML；
   點擊全部走 `#ledgerList` 上的**事件委派**（`data-act` 屬性），
   不要改回 inline `onclick`，店名含引號時會爆掉。
4. **項目編輯 / 計算機 / AI 收據辨識 / 統計 / 備份 / Firebase**。

### 資料結構

```js
item = {
  id, name, store, date: 'YYYY-MM-DD', cat, pay,
  currency: 'JPY',        // 幣別代碼
  rate: 0.215,            // 記帳當下的匯率（外幣才有）
  unitPrice, qty, amt,    // amt = unitPrice × qty
  isTaxFree: true|false   // 沒設定就沒有這個欄位
}
```

`toHome(item)` 負責換算成主要幣別：幣別等於目前設定的外幣就用「現在的匯率」
（改匯率會即時反映到全部記錄），否則用記錄裡存的 `item.rate`。

### AI 辨識

Google Gemini（`GEMINI_MODEL`）。prompt 在 `receiptPrompt()`，
重點是要求純 JSON、排除稅金／小計／手續費行，並在 `applyReceiptResult()` 做
「品項加總 vs 收據 total」的比例校正。回傳被截斷時 `parseGeminiJson()` 會嘗試修補括號。

## 色票

配色集中在 `index.html` 最上面的 `:root`，改色只要動那裡的 CSS 變數，
不要在個別規則裡寫死色碼（統計圖表的 `CAT_COLORS` / `PAY_COLORS` 例外，
那兩個陣列在 JS 的統計區塊）。

| 變數 | 色碼 | 用途 |
|---|---|---|
| `--bg` | `#f0ebe3` | 頁面底色 |
| `--card` | `#fbf8f3` | 卡片、面板 |
| `--card-2` | `#e4dccf` | 日期分組標題、標籤等次級表面 |
| `--sage` / `--accent` | `#7d9d9c` / `#5d7b79` | 灰綠點綴／文字用的深一階 |
| `--accent-deep` | `#576f72` | 主要按鈕、標題 |
| `--ink` / `--ink-2` | `#3b4e50` / `#4a6260` | 主要／次要文字 |
| `--clay` / `--clay-deep` | `#8c7561` / `#6f5c4b` | AI 辨識、付款方式 |
| `--red` / `--green` | `#a4635c` / `#5f7d63` | 負數與刪除／免稅 |

## 慣例

- 純 ES5 寫法（`var`／`function`），跟原本的程式碼一致，不要突然改用 ESM 或框架。
- 不引入外部 CDN。除了 AI 辨識（Gemini）與雲端同步（Firebase SDK，只有設定後才動態載入）
  之外，App 必須離線完全可用——圖示一律用 emoji 或 inline SVG。
- 使用者介面文字用繁體中文。
- commit message 用中文。
