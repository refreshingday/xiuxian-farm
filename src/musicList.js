// 背景音乐文件（assets/music/，全部是下载来的真人 / 现成曲子，不用合成的）。
// moods：在哪些情况放 —— title 标题 · village 村里白天 · wild 野外 · night 夜里 · snow 雪峰 · desert 沙漠 · dark 沼泽/古战场/火山 · mine 矿洞 · fight 打架 · boss 妖王
// 同一情况有好几首就轮流放（随机）。文件已经用 ffmpeg 统一到 -18 LUFS、峰值 -1.5 dB，游戏读进来时还会再按响度对齐一次。
// 加文件时把文件名也写进 assets/music/index.json（游戏只读清单里有的，免得 404）。
// credit：要署名的（CC BY）写在这里，声音面板底下会列出来；CC0 的也记一下来源。
const BP = '（BudgetPixel AI，budgetpixel.com，CC BY 4.0）';
export const MUSIC = [
  { file: 'assets/music/lotus_pond.mp3', moods: ['village', 'title', 'wild'], src: 'Lotus Pond — BiteMe Games「Chinese Game Music」（itch.io，CC0）' },
  { file: 'assets/music/dragon_dance.mp3', moods: ['fight', 'boss'], src: 'Dragon Dance — BiteMe Games「Chinese Game Music」（itch.io，CC0）' },
  { file: 'assets/music/fools_philosophy.mp3', moods: ['village', 'wild', 'desert'], src: "Fool's Philosophy — iamoneabe（OpenGameArt，CC0）" },
  { file: 'assets/music/asian_oriental_1.mp3', moods: ['wild', 'title', 'desert'], src: 'Asianoriental1 — Tozan（OpenGameArt，CC0）' },
  { file: 'assets/music/asian_oriental_2.mp3', moods: ['night', 'snow', 'mine', 'dark'], src: 'Asianoriental2 — Tozan（OpenGameArt，CC0）' },
  { file: 'assets/music/chipnese.mp3', moods: ['fight'], src: 'Chipnese — Spring Spring（OpenGameArt，CC0）' },
  { file: 'assets/music/serene_guzheng.mp3', moods: ['night', 'snow', 'mine'], credit: '“Serene Guzheng Melody”' + BP },
  { file: 'assets/music/flowing_guzheng.mp3', moods: ['village', 'wild'], credit: '“Flowing Guzheng Elegance”' + BP },
  { file: 'assets/music/delicate_erhu.mp3', moods: ['dark', 'night', 'desert'], credit: '“Silk Road Reverie”' + BP },
];
