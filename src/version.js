// 版本号：每次提交都要改这一行（格式 年.月.日.当天第几次），右下角小字显示，用来确认线上页面是不是最新。
export const VERSION = '2026.11.03.4';

const d = document.createElement('div');
d.id = 'ver'; d.textContent = 'v' + VERSION;
d.style.cssText = 'position:fixed;right:8px;bottom:6px;z-index:60;font:bold 15px/1 monospace;color:#ffe9a0;background:rgba(0,0,0,.65);padding:4px 8px;border-radius:5px;border:1px solid rgba(255,233,160,.6);pointer-events:none;';
document.body.append(d);
