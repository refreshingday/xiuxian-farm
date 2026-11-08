# NPC 立绘生成 prompt（v2 三维卡通版）

用于生成 `npc_sheet_5x5.3d.v2.png`，之后裁成 `portraits/` 下 25 张透明立绘。

## 参数

- 脚本：`scripts/gen-image.mjs`，环境变量 `TRANSPARENT=1`（透明背景 PNG）
- 模型：`gpt-image-2.5-sunburst`，quality `medium`，size `1024x1536`
- 不带参考图（不用 `REF=`，即纯文字生成）

## Prompt

```
A single 5x5 grid sheet of 25 separate 2D half-body character portraits for a Chinese xianxia farming game. Strict grid layout: 5 rows and 5 columns. Each character is centered inside its own invisible portrait cell (about 205 x 307 px). Each character occupies about 70% of the cell width and about 75% of the cell height, with at least 15% empty transparent space on all four sides, so no character touches or crosses a cell border. Transparent background everywhere outside the characters, no grid lines, no labels, no text, no shadows on the background.

Style: glossy 3D-rendered chibi xianxia toy-figure look, soft studio lighting, big expressive eyes, smooth skin, detailed embroidered hanfu / robes, consistent scale and head size across all 25 characters. Half-body, facing the viewer, seen from the waist up, relaxed poses that suit a conversation portrait.

Row 1 (left to right): a farmer woman holding wheat; a burly laughing man with crossed arms; an aloof swordsman with a sword on his back; a timid girl with hands clasped; a sly merchant holding an abacus.
Row 2: a white-bearded elder with a staff; a smiling grandmother with hands folded; a boy with hair buns; a girl with flowers; a wandering scholar holding a book.
Row 3: a blacksmith with a hammer; an herbalist with a basket of herbs; an alchemist holding a glowing lantern; a hunter with a bow; a fisherman in a straw hat holding a fish.
Row 4: a sect disciple with a hair ribbon; a female sword cultivator; a Taoist priest in a black hat; an innkeeper holding a jar; a village chief with a fur collar.
Row 5: a scarred rogue with arms crossed; a mother holding a basket; a dreamy girl with her chin on her hand; a father with a hoe; a young monk with prayer beads.
```

## 后处理

1. 按空白行切行（行与行之间有空带）。
2. 列边界：在每列期望位置附近找占用最少的列切开；列间粘连时以此为界。
3. 对每个格子做连通域过滤，只保留和主角色相连的部分，裁到轮廓外加 8px。
4. alpha 低于 25 的像素置 0、RGB 清零（模型输出在角色周围有 alpha 1–24 的雾）。
