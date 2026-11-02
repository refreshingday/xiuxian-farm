# 贴图生成提示词（复制给 Codex）

生成后请保存为 PNG，放到 `休闲农场/assets/textures/`，文件名用每段标题里的名字。
所有贴图共同要求已写进每段提示词里，直接整段复制即可。

---

## 1. grass_ground.png — 草地地面

```
Seamless tileable texture, 512x512 PNG, top-down orthographic view of lush grass ground for a cozy xianxia (Chinese immortal cultivation) farming game. Hand-painted pixel-art style with soft painterly shading, bright spring greens (#5fa83a to #a8d058) with small yellow-green highlights, tiny clover and grass-blade strokes, a few very small white and yellow flower specks. Even flat lighting, no cast shadows, no perspective, no text, no border. Edges must tile seamlessly on all four sides.
```

## 2. dirt_path.png — 土路

```
Seamless tileable texture, 512x512 PNG, top-down orthographic view of a warm packed-earth village path for a cozy xianxia farming game. Hand-painted pixel-art style, warm sandy ochre tones (#d8a868 to #b88450), small pebbles and subtle footprint-worn patches, soft painterly shading. Even flat lighting, no cast shadows, no perspective, no text, no border. Edges must tile seamlessly on all four sides.
```

## 3. stone_plaza.png — 青石板广场

```
Seamless tileable texture, 512x512 PNG, top-down orthographic view of an ancient Chinese bluestone slab pavement (青石板) for a cozy xianxia village plaza. Irregular rectangular grey-blue stone slabs (#a8acb0 to #c8c4bc) with thin dark mortar gaps, a little moss in some cracks, slightly worn rounded edges. Hand-painted pixel-art style, soft shading, even flat lighting, no cast shadows, no perspective, no text. Edges must tile seamlessly on all four sides.
```

## 4. roof_tiles.png — 青瓦屋顶

```
Seamless tileable texture, 512x512 PNG, straight-on orthographic view of traditional Chinese grey clay roof tiles (青瓦) for a cozy xianxia game house roof. Rows of curved overlapping tiles running vertically, dark slate grey-blue (#5a6070 to #7a8294) with lighter top highlights and darker gaps, slight weathering. Hand-painted pixel-art style, even flat lighting, no perspective, no text. Must tile seamlessly; tile rows repeat evenly horizontally and vertically.
```

## 5. wood_planks.png — 木板墙

```
Seamless tileable texture, 512x512 PNG, straight-on orthographic view of horizontal warm brown wooden wall planks for a cozy xianxia village house. Planks about 1/8 of the image tall, visible wood grain, small knots, darker seams between planks, colors #8a5a34 to #c08a52. Hand-painted pixel-art style, soft shading, even flat lighting, no perspective, no text. Edges must tile seamlessly on all four sides.
```

## 6. cliff_rock.png — 仙山岩壁

```
Seamless tileable texture, 512x512 PNG, straight-on side view of a xianxia fairy-mountain cliff face (karst limestone peak like Zhangjiajie). Horizontal layered rock strata in cool grey and warm beige (#8a8c8e to #c8c0b0), deep dark cracks between layers, patches of green moss and tiny ferns growing on the ledges. Hand-painted pixel-art style with painterly shading, even flat lighting, no cast shadows, no sky, no text. Must tile seamlessly left-right and top-bottom.
```

## 7. foliage.png — 树叶团

```
Seamless tileable texture, 512x512 PNG, close-up of dense rounded leaf clusters for stylized tree canopies in a cozy xianxia farming game. Clumps of small leaves forming soft bumps, each clump lighter on top (#a8d858) and darker underneath (#3f7a2a), small yellow-green rim highlights. Hand-painted pixel-art style like a cozy farming game, no sky gaps, no branches, even lighting, no text. Edges must tile seamlessly on all four sides.
```

## 8. peach_foliage.png — 桃花树冠

```
Seamless tileable texture, 512x512 PNG, close-up of dense peach-blossom tree canopy for a cozy xianxia game. Clusters of small pink five-petal blossoms (#ffb6d0 to #f07aa8) mixed with a few fresh green leaves, clumps lighter on top and darker pink-mauve underneath. Hand-painted pixel-art style, even lighting, no sky gaps, no branches, no text. Edges must tile seamlessly on all four sides.
```

---

# 第二批：树叶卡片（树冠用很多随机朝向的叶片拼成）

这两张**必须是透明背景**。如果生成器做不了透明，就用纯品红色 #FF00FF 当背景，我会自动抠掉。

## 9. leaf_cards.png — 绿叶簇贴图集

（2026-11-01 由 Claude 经 Codex CLI 生成，模型 gpt-6.1-sol，已放入 assets/textures/；森林树 / 灌木 / 竹子的叶卡用它）

```
Game texture atlas, 1024x1024 PNG with TRANSPARENT background (if transparency is impossible, use a solid flat pure magenta #FF00FF background with no gradient). The image is split into a 2x2 grid of four equal 512x512 cells. Each cell contains ONE isolated cluster of small rounded leaves for stylized cozy tree foliage (like Ghibli / cozy farming game trees): about 8-15 overlapping leaves fanning out from the cell center, the cluster fills roughly 85% of the cell and stays fully inside it, with clean crisp edges and no leaves touching the cell borders. Four different cluster shapes, one per cell. Hand-painted style, bright fresh greens (#4f9a34 to #b8e068), each leaf lighter at the tip with a darker center vein, soft painterly shading, no stems, no branches, no drop shadow, no outline, no text, no grid lines.
```

## 10. blossom_cards.png — 桃花簇贴图集

（2026-11-01 由 Claude 经 Codex CLI 生成，模型 gpt-6.1-sol，已放入 assets/textures/；用于野外桃花林（`world.js` 的 `M.blossom`））

```
Game texture atlas, 1024x1024 PNG with TRANSPARENT background (if transparency is impossible, use a solid flat pure magenta #FF00FF background with no gradient). The image is split into a 2x2 grid of four equal 512x512 cells. Each cell contains ONE isolated cluster of peach blossoms for stylized cozy tree canopies in a xianxia game: 6-10 small pink five-petal flowers packed together with a few small fresh green leaves peeking out, the cluster fills roughly 85% of the cell and stays fully inside it, crisp edges, nothing touching the cell borders. Four different cluster shapes, one per cell. Hand-painted style, soft pinks (#ffd0e0 to #ef7aa6) with tiny yellow centers, lighter petal tips, soft painterly shading, no branches, no drop shadow, no outline, no text, no grid lines.
```

---

# 第三批：3D 草卡

## 11. grass_blades.png — 草叶条（3D 草丛用）

透明背景；做不了透明就用纯品红 #FF00FF 背景。

```
Game texture, 1024x512 PNG with TRANSPARENT background (if transparency is impossible, use a solid flat pure magenta #FF00FF background with no gradient). A single row of about 25-35 stylized grass blades growing straight up from the BOTTOM edge of the image, like a cozy hand-painted farming game. Blades are slender, tapered to sharp tips, slightly curved and leaning in different directions, varying heights from 40% to 95% of the image height, some overlapping. Every blade must touch the bottom edge; nothing touches the top or the left/right edges. Fresh greens (#4f9a34 at the base to #c4e870 at the tips), darker at the base, lighter at the tips, soft painterly shading, a few blades slightly yellow-green. No flowers, no soil, no ground line, no drop shadow, no outline, no text.
```

---

# 第四批：松树

## 12. pine_needles.png — 松针（松树每层圆锥用，三向投影平铺）

实验场（lab.html）会自动加载这张；没有时用程序生成的松针贴图代替。（2026-10-28 由 Claude 经 Codex CLI 生成，模型 gpt-6.1-sol，已放入 assets/textures/）

```
Seamless tileable texture, 512x512 PNG, close-up of dense evergreen pine / fir needle foliage for stylized cozy tree canopies in a xianxia farming game. Many small sprays of short thin needles growing from twigs that angle DOWNWARD and outward (like layered fir branches seen from the side), overlapping in soft rows, each spray lighter at its tips and darker toward its base and underneath. Neutral desaturated mid-grey-green values only (the game tints it with vertex color), medium contrast, no bright highlights, no pure black. Hand-painted painterly style (NOT pixel art), even flat lighting, no sky gaps, no trunk, no cones, no snow, no text, no border. Edges must tile seamlessly on all four sides.
```

---

# 第五批：农田（Claude 经 Codex CLI 直接生成，模型 gpt-6.1-sol）

## 13. tilled_soil.png — 开垦后的田土

```
Seamless tileable texture, 512x512 PNG, top-down orthographic view of freshly tilled farm soil for a cozy xianxia (Chinese immortal cultivation) farming game. Neat parallel furrow rows running horizontally, about 8 rows across the image, raised ridges lighter on top and darker moist soil in the grooves. Rich dark brown tones (#5a3a22 to #8a5a36) with small clods and a few tiny pebbles, no plants, no grass. Hand-painted pixel-art style with soft painterly shading, matching a warm ochre dirt path texture. Even flat lighting, no cast shadows, no perspective, no text, no border. Edges must tile seamlessly on all four sides; rows must line up across the top and bottom edges.
```

---

# 第六批：Claude 版 3D 素材缺的材质（2026-11-01，Claude 经 Codex CLI 生成，模型 gpt-6.1-sol）

通用后缀（每条都带）：`Hand-painted pixel-art style with soft painterly shading, matching a cozy xianxia farming game texture set (like a warm brown wood plank texture and a layered cliff-rock texture). Even flat lighting, no cast shadows, no perspective, no text, no border. Edges must tile seamlessly on all four sides.` 开头统一为 `Seamless tileable texture, 512x512 PNG, `。

## 14. tree_bark.png — 树皮（树干 / 树桩 / 倒木 / 盆景）
```
straight-on orthographic view of rough tree trunk bark for stylized trees. Vertical ridged furrows with irregular deep grooves and a few small knots, warm brown (#6a4a32 to #a07850) with darker crevices (#3a2616) and lighter ridge highlights.
```
## 15. stone_carved.png — 凿石砖（石灯笼 / 石碑 / 石柱 / 残墙 / 水井 / 石阶）
```
straight-on orthographic view of carved grey stone blocks (stone lanterns, steles, ruined pillars and walls) for a xianxia game: neat rectangular blocks with thin dark seams, weathered rounded edges, subtle chisel marks and a little pale moss in the cracks, cool grey (#8a8c90 to #c0bcb4).
```
## 16. sandstone.png — 砂岩（砂岩 / 赤砂岩 / 沙漠）
```
straight-on orthographic view of desert sandstone rock for a xianxia game: soft horizontal sediment banding, small pits and fine cracks, warm tan to orange-ochre (#c8a070 to #e0b888) with darker bands (#a07848).
```
## 17. thatch_straw.png — 茅草（渔屋 / 稻草人 / 晒药架）
```
straight-on orthographic view of golden thatched straw roofing for a xianxia fishing hut and scarecrow: dense overlapping straw bundles in slightly diagonal strands, darker gaps, golden yellow to tan (#d8b45a to #f0d888) with darker underside strands (#8a6a30).
```
## 18. cloth_canvas.png — 粗麻布（残旗 / 帆 / 布条，灰白可被顶点色染色）
```
straight-on orthographic view of coarse woven linen canvas cloth for banners, sails and cloth wraps: visible plain weave threads, slight wrinkles and fraying, neutral light cream-beige (#d8cdb0 to #efe6cc), designed to be tinted by vertex colour, no pattern, no stripes.
```
## 19. rusty_iron.png — 锈铁板（矿车 / 残剑 / 盾盔 / 破战车）
```
straight-on orthographic view of worn dark iron metal plates for a mine cart, broken swords and shields: dark steel grey (#4a4c52 to #7a7c84) with scattered orange-brown rust patches (#8a4a28), scratches, tiny rivets and edge wear.
```

## 20. plaster_wall.png — 粉墙（门派殿宇 / 院墙）
```
straight-on orthographic view of a traditional Chinese whitewashed lime-plaster wall for xianxia sect halls and courtyard walls: smooth off-white plaster (#e8e6e0 to #f6f4ee) with very soft uneven trowel marks, faint hairline cracks, a few small chipped spots showing grey under-layer, very subtle water stains near the bottom, no bricks, no pattern, designed to be tinted by colour.
```
## 21. lacquer_wood.png — 漆木（殿柱 / 额枋 / 牌坊）
```
straight-on orthographic view of lacquered wooden pillar and beam surface for Chinese temple architecture: vertical wood grain under a glossy lacquer coat, slightly worn lacquer on edges revealing lighter wood, a few fine cracks in the lacquer, neutral mid-tone reddish-grey (#8a6a5a to #b08a78) so it can be tinted blue or red by colour, no carvings.
```
