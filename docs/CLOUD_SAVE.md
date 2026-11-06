# 云存档（Firebase）

代码：`src/save.js`（本机存档）· `src/saveFormat.js`（格式、版本迁移、同步怎么选）· `src/cloud/`（云同步）· `firestore.rules`（云端安全规则）

## 现在的状态

`src/cloud/config.js` 里 `FIREBASE_CONFIG = null` → 用**模拟云端**：流程和真的一模一样，但数据其实存在这台浏览器里。
填上真的 Firebase 配置后，游戏自动改用真的，玩家什么都不用做。

## 玩家看到的流程

1. **不用登录**：第一次打开游戏，自动用游客身份（Firebase 匿名登录）。每次存档（睡觉自动存、菜单存档）后最多 20 秒传上云端。
2. **觉得好玩再登录**：菜单 → ☁ 云存档 → 用 Google 登录。游客账号直接升级成正式账号（uid 不变），云端进度原封不动跟过去。
3. **换设备 / 清了缓存**：标题画面点「☁ 在别的设备玩过？登录接着玩」→ 拉下进度 →「继续」。
4. **两边都玩过**（比如两台设备各玩了一段，或先当游客玩了一局再登录已有存档的账号）：弹窗让玩家选一份。没选的那份留备份：本机的在 `lingtian-save-v1.bak`，云端的在文档的 `prev` 字段。不会悄悄覆盖。
5. **没网**：照样存在本机，状态显示「连不上云端」，自动重试（15 秒、30 秒……最多 4 分钟一次），连上后自动上传。
6. **玩家开着旧的缓存页面**：本机或云端存档比游戏新时，不读也不覆盖，提示刷新。

注意：游客**没登录前**清掉浏览器数据（或换浏览器），那个游客账号就找不回来了——匿名账号只认这个浏览器。菜单的云存档面板里有写，提醒玩家登录。

## 接上真的 Firebase（约 10 分钟，免费的 Spark 方案，不用绑卡）

需要用你自己的 Google 账号操作（Claude 没办法替你开账号）：

1. 打开 <https://console.firebase.google.com> → **添加项目**（名字随意，比如 `lingtian`；Google Analytics 可以关掉）。
2. 左栏 **构建 → Authentication → 开始使用 → 登录方法**：启用 **匿名**，再启用 **Google**（填一个支持邮箱）。
3. Authentication → **设置 → 已获授权的网域**：添加 `refreshingday.github.io`（`localhost` 默认已有）。
4. 左栏 **构建 → Firestore Database → 创建数据库**：选**生产模式**；位置选离玩家近的（例如 `asia-east1` 台湾、`asia-southeast1` 新加坡；之后改不了）。
5. Firestore → **规则**：把仓库根目录 `firestore.rules` 整段贴进去 → **发布**。
6. 左上齿轮 **项目设置 → 一般 → 你的应用 → 添加应用 → 网页（`</>`）**：随便起个名字，不用勾 Hosting → 复制显示出来的 `firebaseConfig = { ... }` 那个对象。
7. 把它贴进 `src/cloud/config.js` 的 `FIREBASE_CONFIG`（或者直接贴给 Claude，让它贴好推上去）。这些值本来就是公开的，安全靠第 5 步的规则。
8. 推上去后打开 <https://refreshingday.github.io/xiuxian-farm/>：标题画面应该显示「☁ 游客 · 已同步 …」，**没有**「（模拟）」两个字。在 Firebase 控制台 → Firestore → 数据 里能看到 `saves/<uid>`。

费用：Spark 免费方案的 Firestore 每天有固定的免费读写额度（具体数字以 Firebase 定价页为准，目前是每天几万次）。一次同步大约 2 次读 + 1 次写，一份存档几 KB，小游戏用不完。超了也只是当天同步失败、本机照存，不会扣钱（Spark 方案不绑卡）。

中国大陆连不上 Google 服务：那边的玩家云同步会一直显示「连不上云端」，游戏照常玩、照常存在本机。

## 云端数据长什么样

一个玩家一份文档 `saves/{uid}`：

| 字段 | 说明 |
|---|---|
| `v` | 存档格式版本（`SAVE_V`） |
| `sid` | 存档线 id（每次「新的开始」换新的） |
| `rev` | 这条存档线写了第几次 |
| `at` / `text` / `game` | 存档时间、显示文字（季节·时辰·境界）、写存档的游戏版本 |
| `data` | 整份存档的 JSON 字符串（Firestore 不收「数组里套数组」，所以存成字符串） |
| `prev` | 被换掉的上一份（换了存档线，或在冲突里选了本机时） |
| `updated` | 服务器时间 |

本机：`lingtian-save-v1`（存档）、`.bak`（被云端覆盖前的）、`.bak-v<N>`（迁移前的原样）、`.cleared`（「重新开始」丢掉的存档线，不再从云端拉回来）、`lingtian-cloud-base`（上次和云端对上的 sid/rev）。

## 存档向后兼容（游戏会一直更新）

规则写在 `src/saveFormat.js` 开头，简单说：

- 改了任何模块 `save()` 的形状（改名、换结构、删字段）→ `SAVE_V` 加 1，在 `MIGRATIONS` 里写「上一版 → 这一版」的迁移。
- 迁移只能加，不能删、不能改已发布的；老存档会一步一步迁上来（v1→v2→v3…）。
- 只是**新加**字段：不用升版本，但 `load()` 要给缺的字段默认值。
- 每升一次版本，跑 `node tests/saves.browser.cjs --capture` 存一份 `tests/fixtures/save-v<N>.json`，永远不删。
- 读档时某个模块读坏了，不连累别的模块（那个模块用新开局的默认值，控制台有警告）。

## 测试

```sh
node --test tests/*.test.mjs        # 迁移、所有版本的 fixture、同步决策（不用浏览器）
node tests/saves.browser.cjs        # 每个版本的旧存档读进真的游戏
node tests/cloud.browser.cjs        # 模拟云端全流程：游客 → 登录 → 换设备 → 冲突 → 断网 → 未来版本

# 真的 Firebase SDK + 本机模拟器（要 Java）：测 firebase.js 和 firestore.rules
npx firebase-tools emulators:start --only auth,firestore --project demo-lingtian   # 在仓库根目录，另开一个终端
node tests/firebase-emulator.browser.cjs
#   连不上 gstatic 时：npm i firebase@12.19.0，再设 FIREBASE_SDK=<那个 node_modules/firebase>
```

网址参数：`?cloud=mock` 强制模拟 · `?cloud=mock-offline` 模拟断网 · `?cloud=off` 关掉 · `?cloud=emulator` 连本机 Firebase 模拟器（Google 登录改成输邮箱）。
作弊面板「☁ 云存档（模拟）」：模拟换一台设备、看云端状况、清空模拟云端。
