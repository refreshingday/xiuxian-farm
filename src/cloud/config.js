// 云存档配置。
//
// FIREBASE_CONFIG = null → 用「模拟云端」（src/cloud/mock.js）：数据其实存在这台浏览器里，
//   但走的流程（游客自动登录、上传、拉取、Google 登录接续进度、冲突选择）和真的 Firebase 一模一样。
//
// 接真的 Firebase：照 docs/CLOUD_SAVE.md 建好项目，把 Firebase 控制台「项目设置 → 你的应用 → SDK 配置」
// 里的那段对象原样贴到下面（这些值是公开的，本来就会出现在网页里，安全靠 firestore.rules）。
//
// 网址参数：?cloud=mock 强制用模拟；?cloud=off 关掉云同步；?cloud=emulator 连本机的 Firebase 模拟器（开发用）。
export const FIREBASE_CONFIG = null;
/* 例：
export const FIREBASE_CONFIG = {
  apiKey: 'AIza...',
  authDomain: 'lingtian-xxxx.firebaseapp.com',
  projectId: 'lingtian-xxxx',
  storageBucket: 'lingtian-xxxx.firebasestorage.app',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abcdef',
};
*/
