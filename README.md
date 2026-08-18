# 旅行記帳 · Travel Expense

一群人出國旅行共用的記帳 PWA。單一 `index.html`，沒有框架、沒有建置步驟，
放上 GitHub Pages 就能在手機「加入主畫面」當成 App 用。

功能是從 [Tokyo-2026](https://github.com/neinton7581/Tokyo-2026) 行程網頁裡的記帳系統
獨立出來，再擴充成多人共用版本。

## 兩本帳

| 帳本 | 誰看得到 | 用途 |
|---|---|---|
| 👤 **我的帳** | 只有你自己 | 個人開銷。存在 `users/{你的uid}/items`，Firestore 規則鎖死，其他成員連讀都讀不到 |
| 👥 **公帳** | 所有登入的成員 | 大家一起花的錢。每筆記錄誰先墊的、由誰分攤，可以自動算出最後誰該還誰多少 |

頂部切換帳本，記帳就記進當下那本。沒登入時只有「我的帳」可用，資料只存在本機。

## 功能

| 功能 | 說明 |
|---|---|
| 🤝 分帳結算 | 每筆公帳指定付款人與分攤名單，統計頁算出「你要付誰多少」，並用最少的轉帳次數還清 |
| 🤖 AI 收據辨識 | 拍收據 → Google Gemini 讀出店名、日期、幣別、各品項單價數量 → 確認頁逐項修改 → 一次存成多筆 |
| 💱 雙幣別 | 外幣（預設 JPY）與主要幣別（預設 TWD）可切換，統計以主要幣別加總；匯率隨時可調 |
| 📒 兩層分組 | 依「日期 → 店家」分組，各層都有小計，店名／品名可直接點著改 |
| 🧾 稅制標記 | 每筆可標含稅／免稅，店家層自動顯示「免稅／含稅／Mix」 |
| 🧮 計算機 | 邊逛邊按，算完一鍵填入單價，同時顯示換算金額 |
| 📊 統計 | 總支出、分類與付款方式圓餅圖、店家前十名、每日支出、每人先墊金額 |
| 🔑 管理員統一設定 | 幣別、匯率、分類、成員名單、API Key 只有管理員能改，改完即時同步到所有人的 App |
| 💾 備份 | 一鍵匯出／匯入 JSON |
| 📴 離線可用 | Service Worker 快取，飛航模式也能記帳（AI 辨識與同步需要網路，恢復連線會自動補送）|

除了 AI 辨識與雲端同步，其他功能都不依賴任何外部 CDN。

## 部署

推上 `main` 後在 **Settings → Pages** 選 `main` / `root`，網址是
`https://neinton7581.github.io/travelexpence/`。
用手機 Safari 開啟 → 分享 → 「加入主畫面」。

## 建置步驟（管理員做一次）

### 1. 建立 Firebase 專案

1. 到 [Firebase Console](https://console.firebase.google.com/) → 新增專案（不需要 Google Analytics）
2. **Build → Firestore Database** → 建立資料庫 → 位置選 `asia-east1`（台灣）
3. **Build → Authentication** → Sign-in method → 啟用「電子郵件/密碼」
4. Authentication → Users → **手動新增每位成員的帳號**（Email ＋ 密碼）
   　這個 App 不做註冊功能，否則任何人開網址都能註冊進來看你們的公帳

### 2. 把設定填進程式碼

Firebase Console → ⚙️ 專案設定 → 一般 → 你的應用程式 → 新增「網頁應用程式」，
複製那段 `firebaseConfig`，貼到 `index.html` 最上面：

```js
var FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "xxx.firebaseapp.com",
  projectId: "xxx",
  storageBucket: "xxx.firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
};
```

> **為什麼要放在程式碼裡？** 朋友的手機必須先有這段才連得上資料庫，
> 而這段本身又存在資料庫裡的話就永遠拿不到。
> 這段不是密碼，它比較像資料庫的門牌號碼——Firebase 官方文件也說明它可以公開。
> 真正的鎖是下面的安全規則：沒有管理員建立的帳號，知道門牌也進不去。

同一段附近設定管理員：

```js
var ADMIN_EMAILS = ['neinton7581@gmail.com'];
```

### 3. 設定 Firestore 安全規則

Firestore Database → 規則 → 全部換成（`ADMIN_EMAILS` 名單要跟程式碼一致）：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() { return request.auth != null; }
    function isAdmin() {
      return signedIn() && request.auth.token.email.lower() in ['neinton7581@gmail.com'];
    }

    // 應用程式設定：成員可讀，只有管理員可寫
    match /config/{doc} {
      allow read:  if signedIn();
      allow write: if isAdmin();
    }

    // 公帳：所有登入成員可讀寫
    match /shared_items/{item} {
      allow read, write: if signedIn();
    }

    // 個人帳：只有本人，其他人連讀都不行
    match /users/{uid}/{document=**} {
      allow read, write: if signedIn() && request.auth.uid == uid;
    }
  }
}
```

想改成「公帳只有記錄者本人與管理員能改」的話，把 `shared_items` 那段換成：

```
    match /shared_items/{item} {
      allow read:   if signedIn();
      allow create: if signedIn();
      allow update, delete: if isAdmin() ||
        (signedIn() && resource.data.by.lower() == request.auth.token.email.lower());
    }
```

### 4. 在 App 裡設定

用管理員帳號登入後，到 ⚙️ 設定：

- **同行成員**：一行一個人，`Email, 名字`。分帳結算依這份名單計算，Email 要與 Authentication 建立的帳號一致
- **幣別與匯率**、**分類與付款方式**：改完所有人即時同步
- **AI 收據辨識**：到 <https://aistudio.google.com/apikey> 申請 Gemini API Key 貼上

> ⚠️ **Gemini Key 是全體共用的**：它會傳到每位成員的瀏覽器，技術上有辦法被取出。
> 建議在 Google AI Studio 幫這把 Key 設用量上限。

其他成員只要用你給的帳密登入，設定會自動套用，他們看得到設定但改不動。

## 分帳怎麼算

每筆公帳有兩個角色：**付款人**（先墊錢的人）與**分攤名單**（要一起分的人，預設全員）。

```
淨額 = 你先墊的總額 − 你應分攤的總額
```

淨額為正表示你墊多了，別人要還你；為負表示你欠別人。
系統把所有人的淨額互相抵銷後，用**最少的轉帳次數**排出「誰付給誰多少」，
統計頁預設只顯示跟你有關的那幾筆，要看全部可以展開。

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
`CACHE_NAME` 的版本號 +1**（`travel-ledger-v3` → `v4`），否則已安裝的裝置
會一直吃舊快取、收不到更新提示。

資料存放位置：

| 位置 | 內容 |
|---|---|
| Firestore `users/{uid}/items/*` | 個人帳（一筆消費一份文件）|
| Firestore `shared_items/*` | 公帳 |
| Firestore `config/app` | 幣別、匯率、分類、付款方式、成員名單、Gemini Key |
| localStorage `ledger_items_me` / `ledger_items_shared` | 兩本帳的本機鏡像（離線可用）|
| localStorage `ledger_settings` | 設定的本機快取 |
| localStorage `ledger_thumbs` | 收據縮圖（**只存本機**，不進雲端）|

> 收據縮圖刻意不同步：Firestore 單一文件上限 1 MB，照片塞進去很快就爆。
> 拍照那台裝置看得到圖，其他人看得到記錄但看不到圖。
