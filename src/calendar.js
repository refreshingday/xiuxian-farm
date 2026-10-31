// 历法（GDD 第 3 节「时间与历法」）
// 一天 = 6:00 到次日 2:00，1 游戏小时 = 1 现实分钟（一天约 20 分钟）。
// 一季 14 天、一年 56 天、一周 7 天（一季正好两周）。月相 14 天一轮：每季第 1 天新月，第 8 天满月。
export const DAY_START = 6, DAY_END = 26;   // 小时从 6 走到 26（= 次日 2:00）
export const SEC_PER_HOUR = 60;
export const SEASON_DAYS = 14, YEAR_DAYS = 56;
export const SEASONS = ['春', '夏', '秋', '冬'];
export const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const MOON_ICON = ['🌑', '🌒', '🌒', '🌓', '🌓', '🌔', '🌔', '🌕', '🌖', '🌖', '🌗', '🌗', '🌘', '🌘'];
const MOON_NAME = ['新月', '娥眉月', '娥眉月', '上弦月', '上弦月', '盈凸月', '盈凸月', '满月', '亏凸月', '亏凸月', '下弦月', '下弦月', '残月', '残月'];

// 每周固定事件（GDD）：周一任务堂刷新、周三拍卖会、周五秘境开启、周日宗门大比
export const WEEK_EVENTS = { 0: '宗门任务堂刷新', 2: '青石坊市拍卖会', 4: '秘境开启', 6: '宗门大比' };

// day 从 1 开始（春季第 1 天，周一，新月）
export function dateOf(day) {
  const d = day - 1;
  const season = Math.floor(d / SEASON_DAYS) % 4, moon = d % SEASON_DAYS, weekday = d % 7;
  return {
    day, year: Math.floor(d / YEAR_DAYS) + 1, season, seasonName: SEASONS[season], dayOfSeason: d % SEASON_DAYS + 1,
    weekday, weekName: '周' + WEEKDAYS[weekday], moon, moonIcon: MOON_ICON[moon], moonName: MOON_NAME[moon],
    newMoon: moon === 0, fullMoon: moon === 7, event: WEEK_EVENTS[weekday] || '',
  };
}

// 小时（6..26）→「HH:MM」，按 10 分钟取整
export function clockText(h) {
  const hh = Math.floor(h) % 24, mm = Math.floor((h - Math.floor(h)) * 6) * 10;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// 当天的天气：按季节概率下雨（固定种子，读档后不变）
export function rollWeather(day) {
  const s = dateOf(day).season, x = Math.sin(day * 91.7 + 13.1) * 43758.5453, r = x - Math.floor(x);
  return r < [0.28, 0.35, 0.22, 0.12][s] ? 'rain' : 'clear';
}
