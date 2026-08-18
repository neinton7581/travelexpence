# 旅行記帳 · Travel Expense

出國旅行用的記帳 PWA。單一 `index.html`，沒有框架、沒有建置步驟，
放上 GitHub Pages 就能在手機「加入主畫面」當成 App 用。

功能是從 [Tokyo-2026](https://github.com/neinton7581/Tokyo-2026) 行程網頁裡的記帳系統
獨立出來，並改成不綁定特定旅程的通用版本。

## 功能

| 功能 | 說明 |
|---|---|
| 🤖 AI 收據辨識 | 拍收據 → Google Gemini 讀出店名、日期、幣別、各品項單價與數量 → 確認頁可逐項修改 → 一次存成多筆記錄 |
| 💱 雙幣別 | 外幣（預設 JPY）與主要幣別（預設 TWD）可切換，所有統計以主要幣別加總；匯率可隨時調整 |
| 📒 兩層分組 | 依「日期 → 店家」分組，各層都有小計，店名／品名可直接點著改 |
| 🧾 稅制標記 | 每筆可標含稅／免稅，店家層自動顯示「免稅／含稅／Mix」 |
| 🧮 計算機 | 邊逛邊按，算完一鍵填入單價，同時顯示換算後金額 |
| 📊 統計 | 總支出、分類與付款方式圓餅圖、消費店家前十名、每日支出長條 |
| ☁️ 雲端同步 | 選用。設定 Firebase 後，多台裝置用同一組帳號即時同步 |
| 💾 備份 | 一鍵匯出／匯入 JSON |
| 📴 離線可用 | Service Worker 快取，飛航模式也能記帳（只有 AI 辨識與雲端同步需要網路）|

除了 AI 辨識與雲端同步，其他功能都不依賴任何外部 CDN，離線完全可用。

## 部署

推上 `main` 後在 GitHub 的 **Settings → Pages** 選 `main` / `root`，
網址會是 `https://neinton7581.github.io/travelexpence/`。
用手機 Safari 開啟 → 分享 → 「加入主畫面」。

## 設定

### 1. AI 收據辨識（Gemini API Key）

1. 到 <https://aistudio.google.com/apikey> 申請一組免費的 API Key
2. App 裡 **⚙️ 設定 → AI 收據辨識** 貼上、按儲存

Key 只存在該台裝置的 `localStorage`，不會上傳、也不會進到雲端同步。
每台裝置都要各自貼一次。

### 2. 雲端同步（Firebase，選用）

不設定的話資料只存在本機瀏覽器，換手機或清除瀏覽資料就會不見。
要多台裝置共用同一本帳：

1. 到 [Firebase Console](https://console.firebase.google.com/) 建立新專案
2. **Build → Firestore Database** → 建立資料庫
3. **Build → Authentication** → 啟用「電子郵件/密碼」→ 手動新增要用的帳號
4. **專案設定 → 一般 → 你的應用程式** → 新增網頁應用程式，複製 `firebaseConfig`
5. App 裡 **⚙️ 設定 → 雲端同步** 貼上那段設定 → 儲存並連線 → 用步驟 3 的帳號登入

Firestore 安全規則建議設成「只有登入的帳號能讀寫」：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /ledger_sync/{doc} {
      allow read, write: if request.auth != null;
    }
  }
}
```

同步的是 `ledger_sync/items`（全部記錄）與 `ledger_sync/settings`（幣別、匯率、分類）。

> **收據縮圖不會同步。** Firestore 單一文件上限 1 MB，照片塞進去很快就會爆掉，
> 所以縮圖只存在拍照那台裝置的 `localStorage`，其他裝置看得到記錄但看不到圖。

## 檔案

```
index.html          整個 App（CSS／HTML／JS 全在裡面）
sw.js               Service Worker（離線快取）
manifest.json       PWA 設定
icon.png            App 圖示
icon-maskable.png   Android maskable 圖示
```

## 開發

直接編輯 `index.html`，用瀏覽器開就能預覽。**改完程式碼要把 `sw.js` 裡
`CACHE_NAME` 的版本號 +1**（`travel-ledger-v1` → `v2`），否則已安裝的裝置
會一直吃舊快取、收不到更新提示。

資料存放位置（`localStorage`）：

| Key | 內容 |
|---|---|
| `ledger_items` | 全部記帳記錄 |
| `ledger_settings` | 幣別、匯率、分類、付款方式 |
| `ledger_thumbs` | 收據縮圖（本機限定） |
| `gemini_api_key` | Gemini API Key |
| `ledger_fb_config` | Firebase 設定 |
