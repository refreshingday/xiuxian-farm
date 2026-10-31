// 版本号：每次提交都要改这一行（格式 年.月.日.当天第几次），右下角小字显示，用来确认线上页面是不是最新。
export const VERSION = '2026.10.31.6';

const d = document.createElement('div');
d.id = 'ver'; d.textContent = 'v' + VERSION;
d.style.cssText = 'position:fixed;right:6px;bottom:3px;z-index:60;font:10px/1 sans-serif;color:#fff;opacity:.45;pointer-events:none;text-shadow:0 1px 2px #000;user-select:none';
document.body.append(d);
