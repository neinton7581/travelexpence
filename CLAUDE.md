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
最上面有兩個必須手動維護的常數：`ADMIN_EMAILS`（誰能改設定）與 `FIREBASE_CONFIG`
（一定要寫在程式碼裡，成員的裝置才連得上；它不是密鑰，防護靠 Firestore 規則）。

### 兩本帳

```
BOOKS.me      個人帳 → Firestore users/{uid}/items/*    只有本人（規則強制）
BOOKS.shared  公帳   → Firestore shared_items/*         所有登入成員
```

`currentBook` 是目前檢視的帳本，記帳一律記進它。**一筆消費 = 一份 Firestore 文件**，
不要改回「整本帳存成一份文件」的寫法——多人同時記帳會互相覆蓋，也會撞上 1 MB 上限。
寫入一律走 `putItems(book, [items])` / `dropItems(book, [ids])`，它們負責本機與雲端兩邊。

### 設定與權限

設定放 `config/app`，`isAdmin()`（比對 `ADMIN_EMAILS`）決定能不能寫。
所有裝置都 `onSnapshot` 監聽這份文件，管理員一改立刻套用。Gemini API Key 也在裡面，
全體共用。

設定分成兩個 modal：

| Modal | 誰能開 | 內容 |
|---|---|---|
| `settingsModal` | 所有人 | 帳號登入、幣別與匯率、分類與付款方式、資料備份。非管理員的區塊加 `.locked` class 變唯讀 |
| `sysModal` | 只有管理員 | 同行成員、Gemini API Key、Firebase 設定。入口按鈕 `#sysEntry` 只在 `isAdmin()` 時顯示，`openModal()` 裡另有一道防線 |

兩個 modal 各自有 `render*Form()` / `commit*Form()`，關閉時才寫回設定。
`settingsEditing()` 用來避免雲端推送的設定蓋掉管理員正在編輯的內容。

### 分帳結算

`computeBalances()` 算每個人的淨額（先墊金額 − 應分攤），四捨五入的誤差補到絕對值最大的人
身上確保總和為 0；`computeTransfers()` 用貪婪法把債權債務兩兩抵銷成最少筆轉帳。
每筆公帳的 `payer`（先墊的人）與 `split`（分攤名單）是計算依據，預設全員均分。

### 資料結構

```js
item = {
  id, name, store, date: 'YYYY-MM-DD', cat, pay,
  currency: 'JPY',        // 幣別代碼
  rate: 0.215,            // 記帳當下的匯率（外幣才有）
  unitPrice, qty, amt,    // amt = unitPrice × qty
  isTaxFree: true|false,  // 沒設定就沒有這個欄位
  // 只有公帳才有：
  by, payer,              // 誰記的／誰先墊的（Email）
  split: [email, ...]     // 分攤名單
}
```

`toHome(item)` 換算成主要幣別：幣別等於目前設定的外幣就用「現在的匯率」
（改匯率會即時反映到全部記錄），否則用記錄裡存的 `item.rate`。

### AI 辨識

Google Gemini（`GEMINI_MODEL`）。prompt 在 `receiptPrompt()`，重點是要求純 JSON、
排除稅金／小計／手續費行，並在 `applyReceiptResult()` 做「品項加總 vs 收據 total」的
比例校正。回傳被截斷時 `parseGeminiJson()` 會嘗試修補括號。

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
