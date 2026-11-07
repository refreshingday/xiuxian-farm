// 背景音乐文件（放在 assets/music/）。文件不在就自动用合成古筝顶上（sound.js）。
// moods：在哪些情况放 —— title 标题 · village 村里白天 · wild 野外 · night 夜里 · snow 雪峰 · desert 沙漠 · dark 沼泽/古战场/火山 · mine 矿洞 · fight 打架 · boss 妖王
// 加文件时把文件名也写进 assets/music/index.json（游戏只读清单里有的，免得 404）。
// 同一情况有好几首就轮流放。音量读进来时自动统一（按响度归一化），不用手动调。
// credit：要署名的曲子写在这里，声音面板底下会列出来。
export const MUSIC = [
  { file: 'assets/music/wuxia2_guzheng_pipa.mp3', moods: ['wild', 'snow', 'desert', 'fight'], credit: 'Wuxia2 Guzheng Pipa — PeriTune（CC BY 4.0，peritune.com）' },
  { file: 'assets/music/chinese_game_music_1.mp3', moods: ['village', 'title'] },
  { file: 'assets/music/serene_slow_guzheng.mp3', moods: ['night', 'dark', 'mine'] },
  { file: 'assets/music/stocktune_guzheng_1.mp3', moods: ['village', 'wild'] },
  { file: 'assets/music/stocktune_guzheng_2.mp3', moods: ['night', 'snow'] },
];
