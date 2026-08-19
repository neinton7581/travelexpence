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
| `settingsModal` | 所有人 | 帳號登入、幣別與匯率、資料備份。幣別與匯率加 `.locked` class 對非管理員唯讀 |
| `sysModal` | 只有管理員 | 分類與付款方式、同行成員、Gemini API Key（含模型名稱）、Firebase 設定。入口按鈕 `#sysEntry` 只在 `isAdmin()` 時顯示，`openModal()` 裡另有一道防線 |

兩個 modal 各自有 `render*Form()` / `commit*Form()`，關閉時才寫回設定。
`settingsEditing()` 用來避免雲端推送的設定蓋掉管理員正在編輯的內容。

### 付款人預設值

`fillMemberSelect(id, forceMe)` 的第二參數：`forceMe=true` 會忽略欄位目前的值，
強制重設成 `myEmail()`（目前登入者）。這是為了修一個 bug——欄位第一次繪製時
（App 剛載入、還沒登入前）沒有「目前使用者」可用，會退回瀏覽器預設的清單第一位，
之後任何呼叫都會用「保留原值」的邏輯把這個錯誤值一路帶下去，導致付款人永遠卡在
第一位成員身上，不會因為換人登入而更新。

**任何「使用者身分剛確定」的時機都要傳 `true`**：`switchBook('shared')`、
`onAuthStateChanged` 登入後（若當下在公帳）、收據確認頁切到公帳
（`paintReceiptBookBtn`）。`fPayer`／`receiptPayer` 需要這個修正；`editPayer`
本來就在 `fillMemberSelect` 之後又用 `item.payer || item.by || myEmail()`
明確覆寫一次，不受影響。不要拿掉 `forceMe`，否則這個 bug 會回來。

### 刪除權限

公帳的項目只有記錄者（`item.by`）本人能刪。前端用 `canDelete(item)` 決定要顯示 ✕
還是 🔒，`delItem()` / `delStore()` 進去前再擋一次；真正的防線是 Firestore 規則裡
`shared_items` 的 `allow delete`（規則全文在 README）。改動任何一邊時兩邊要一起改，
否則畫面允許但雲端拒絕，會變成看似刪掉、重新整理又出現。

`allow update` 保持開放（大家可以互相修正錯字金額），但規則禁止改動 `by`，
避免有人把記錄者改成自己再刪掉。

### 稅金與折扣（receiptPrompt）

日本收據是總額表示（含稅價），所以 `item.amount` 本身就含稅，分攤時不需要另外
拆稅金出來處理——這是刻意的設計，不要加「稅金另外分攤」的邏輯。

折扣（クーポン割引）曾經一律要求 Gemini 列成獨立負數行，但這跟品項各自分攤的
功能衝突：使用者容易忘記把折扣行的分攤對象跟它所屬的商品對齊，算出來的錢就會錯。
現在分兩種處理，都不會產生獨立的折扣 item：

1. **商品專屬折扣**（緊跟在某商品後面、金額對得上該商品）：prompt 要求 Gemini
   直接淨入該商品的 amount／unit_price，並把折抵金額填進新增的 `discount` 欄位
   （`applyReceiptResult()` 讀出來，`receiptRows()` 在該品項旁顯示「折扣 10%・¥83」
   徽章；百分比是前端自己算的，不是 Gemini 回傳的，抓收據裡沒明講的百分比沒意義；
   `updateReceiptRow()` 裡手動改價格/數量時會清空 `discount`，因為那個標籤已經不
   可信）。

2. **整單性質折扣**（會員折扣、滿額折扣，跟特定商品無關）：prompt 要求 Gemini
   完全不要列成 item、也不要扣進任何商品，只要 `total` 正確反映最終實際支付金額。
   複用既有的「品項加總 vs 收據 total」比例校正機制（原本是拿來修正 AI 誤差用的）：
   當校正方向是「縮小」（`scale < 1`）時，判定為整單折扣，記到 `_receiptWholeDiscount`
   純顯示用，並把每個品項因此減少的金額累加進它自己的 `discount`（`+=`，不是覆蓋，
   跟商品自帶的折扣共存）。這樣「花比較多的人分到比較多折扣」，不是齊頭均分。
   `renderReceiptConfirm()` 在收據卡片顯示「整單折扣 ¥XXX（已按比例分攤到各品項）」。

這兩層判斷都是 Gemini 的視覺理解在做，不是關鍵字比對——沒辦法在這個環境用真的
API Key 端到端驗證，只驗證過 `applyReceiptResult()` 的比例分攤數學本身（含跟商品
自帶折扣疊加的情況）。使用者回報金額算錯時，先看是不是這個判斷沒抓對，而不是懷疑
比例分攤的計算邏輯。

### 免稅收據的「合計」選錯行、殘值稅金

真實案例：LOFT 免稅收據上有兩個「合計」字樣的行——中間一個「合計税抜 ¥9,238」
（扣完退稅但還沒加上殘值稅的中間小計）跟最下面付款方式旁的最終金額 ¥9,250。
Gemini 一開始選錯，抓了中間那個當 total，導致漏掉 ¥12。

兩處修正：
1. prompt 的 `total` 欄位說明加強：明確要求優先選「跟付款方式印在一起、收據最下面」
   的那一行，避開標示「税抜」「小計」字樣的中間值。
2. `tax_free_fee` 的定義放寬：不只抓 TaxFreeFee/免稅手續費，連免稅收據上另外印出的
   小額殘值消費稅／消費税等也要求 Gemini 一併加總進來，這樣「品項＋fee」才會準確
   對上最終實付金額。

`applyReceiptResult()` 的比例校正邏輯也一併調整：比對基準改成 `total - fee`（原本
是直接比 `total`，沒扣掉 fee，邏輯上不對），而且免稅收據原本完全不允許「往上」校正
（只能縮小，因為早期設計是防止「品項還沒扣退稅」誤加碼），現在放寬成落差在 3% 以內
時也允許往上補（`allowUp`），處理殘值稅這類小額、非退稅性質的落差；落差夠大時
（可能真的是退稅還沒反映）仍然維持原本保守、不校正的行為。1% 以下的極小落差
（例如上面 LOFT 案例裡漏抓時的那 ¥12／¥9250＝0.13%）刻意不校正，屬於容許的精度
損失，不要為了追這種零頭再進一步調低門檻——調太敏感會反過來誤動一般收據上
正常的辨識誤差。

### 比例校正的捨入殘差

比例分攤（整單折扣／免稅殘值稅）會對每個品項各自 `Math.round()`，JS 的 `Math.round`
遇到剛好 .5 的情況一律無條件進位（不像有些語言用銀行家捨入法）。如果同一張收據裡
剛好有兩個以上品項都落在 .5 邊界，各自進位會疊加出 1 圓以上的誤差，導致
`sum(items)` 對不齊 `target`（真實案例：寵物用品店收據，5 品項裡有 2 個卡在 .5，
四捨五入後多了 1 圓）。

修法跟 `computeBalances()` 處理結算誤差是同一招：全部品項四捨五入完，重新加總跟
`target` 核對一次，把殘差整筆補到金額最大的那個品項（連同它的 `discount` 一併
調整，維持 `discount = 原金額 - 最終金額` 的定義）。只補一個品項是刻意的，不用
「最大餘數法」平均分散到多個品項——殘差通常只有 1、2 圓，補在一個品項上肉眼看
不出差異，沒必要為了分散這麼小的誤差多寫一層邏輯。

### 收據品項各自分攤

`_receiptItems[i].split` 讓收據裡每個品項各自帶自己的分攤名單，不是整張收據共用
一組。架構上不需要額外設計——每個品項存進 Firestore 後本來就是獨立一份文件，
各自的 `split` 欄位直接就是 `computeBalances()` 的輸入，結算邏輯完全不用改，
只需要在收據確認畫面（`receiptRows()`）替每一列加上自己的分攤 chips。

- `applyReceiptResult()` / `addReceiptRow()`：新品項預設 `split = allMemberEmails()`
- 每列的 chips 用 `data-act="itemsplit" data-idx="N"` 標記，事件委派綁在
  `#receiptBody`（靜態存在的容器，`renderReceiptConfirm()` 只換它的 innerHTML，
  監聽器不會因為重繪而失效）
- 底下的「全部套用」（`#receiptSplit`，`_receiptSplit`）維持原本的通用 chip
  委派邏輯（`data-split="receiptSplit"`），但點擊時額外把選到的名單廣播寫進
  **每一個** `_receiptItems[i].split` 並重繪列表——它是「批次覆蓋」工具，
  不是即時綁定的預設值，使用者手動調整過的品項再次觸發它一樣會被蓋掉，這是
  刻意的（先套用大範圍、再處理例外）
- `confirmReceiptSave()` 存檔時：每個品項優先用自己的 `it.split`，沒有才退回
  `defaultSplit`（= 全部套用當下的選擇，或全員）；免稅手續費這類非品項的
  附加費用固定用 `defaultSplit`，因為它不屬於任何單一品項

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

`toHome(item)` 換算成主要幣別，**一律用記錄裡存的 `item.rate`**（記帳當下的匯率），
只有早期沒存匯率的資料才退回目前設定值。不要改成「用現在的匯率重算全部」——
使用者要的是 8/18 記的帳永遠用 8/18 的匯率。

匯率可由管理員手動輸入或按 🔄 用 `fetchRate()` 抓（open.er-api.com，免金鑰）；
管理員每天第一次開 App 會自動抓一次（`maybeAutoFetchRate()`，用 `S.rateDate` 節流）。

Gemini 模型放在 `S.geminiModel`（空值時用 `DEFAULT_GEMINI_MODEL`），可在系統設定更換，
Google 停用某個型號時不需要改程式碼。

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
