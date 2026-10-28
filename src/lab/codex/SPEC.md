# Codex prop models — spec

This folder holds **3D prop models authored by Codex** (not by Claude) for the 灵田问道 / 修仙农场 game.
Claude's own versions of the same props live in `src/lab/assets.js` (the `ASSETS` table). The lab (`lab.html`)
shows both side by side so a human can compare them. **Do not read-copy Claude's shapes** — design your own
models; you may skim `assets.js` only to learn the size/scale of a prop.

## The game and its art style

Cozy **xianxia (Chinese immortal-cultivation) farming game**, 3D **chibi** look, fixed high-angle camera
(about 45-60 degrees looking down), so tops and silhouettes matter most. Think Harvest-Moon / Ghibli warmth
with a Chinese-fantasy flavour: bamboo, stone lanterns, jade, spirit herbs, pavilions, talisman paper,
crystal veins, red-lacquer wood.

* Chunky, rounded, slightly exaggerated low-poly forms. No tiny fiddly detail; readable from far away.
* Warm, saturated, clean palette. Top surfaces lighter, undersides darker (the kit bakes a vertical gradient).
* Toon shading (`MeshToonMaterial`, 3-4 light steps) + a dark inverted-hull outline (added automatically).
* Hand-painted textures in "pixel-art style with soft painterly shading", even flat lighting, **no baked
  shadows or perspective in the texture**.
* 1 world unit is about 1 metre. The player chibi is about **1.5 units tall**. Ground is y = 0.
  Typical sizes: barrel 0.8, crate 0.7, well 1.6-2.4 tall, broad-leaf tree 4-6 tall, boulder 0.8-2.5,
  pavilion 4 wide, bamboo stalk 4-6 tall.

## What you must deliver

For the group you are assigned (list below) write ONE ES-module file `src/lab/codex/<group>.js`:

```js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Kit, G, grad, paint, lumpy, faceted, mulberry32 } from '../kit.js';
import { texMesh, finish, uvScale } from './lib.js';
import { vnoise, smooth, clamp } from '../../util.js';

export const TEXTURES = { 'codex/<group>_wood': { norm: 0.9 } };   // optional, see "Textures"
export const ASSETS = {
  barrel: { name: '木桶', n: 3, make: (v) => { /* return THREE.Group for variant v (0..n-1) */ } },
  ...
};
```

* Use **exactly** the ids, Chinese names and variant counts `n` from the table below. Every id of your group
  must be present. Variants `v = 0..n-1` must look clearly different (shape, size, colour, or detail).
* `make(v)` must be deterministic (use `mulberry32(seed)` for randomness, never `Math.random`) and return a
  `THREE.Group` whose origin is at the **centre of the footprint on the ground** (lowest point at y = 0),
  facing +Z. Keep each prop under about 4000 triangles and merge geometry into few meshes.
* These are real 3D models: proper volumes, thickness, silhouettes, parts that make sense from every side.
  Not flat cards, except foliage/grass blades where a few cross-quads are fine.
* Optional light: `group.userData.light = { color:'#ffb060', i:1.0, d:6, y:1.2, flicker:true, smoke:true }`
  (only for fire/lamp/glow props; `finish(group, { light })` sets it).

### Two ways to build (mix freely)

1. **`Kit` (vertex-coloured, the game's pipeline)** — `const k = new Kit(); k.add(geometry, color | paintFn, {at,rot,s,kind}); return k.build();`
   Shape helpers `G.box/cyl/cone/sph/ico/tor/tube/lathe/blobs`, colour helpers `grad(color, lo, hi)`,
   `paint(geo, (p, n, out) => out.set('#hex'))`. Kinds: `solid` (default), `leaf`/`bloom` (wind-sway foliage),
   `plant` (grass, double-sided, sways), `glow` (unlit emissive), `gem` (crystal, slightly bright), `ice`
   (translucent). Kit applies outlines for you.
2. **Textured parts** — build a `THREE.BufferGeometry` (with `uv`), then
   `texMesh(geo, 'myTextureName', '#tintHex', { vc: true })` returns a toon-shaded, outlined, shadow-casting
   `THREE.Mesh`; add it to the group you return. If the PNG failed to load it silently falls back to a flat
   colour, so always choose a sensible tint. Use `uvScale(geo, u, v)` to tile a texture over big parts.

Combine both: e.g. Kit for painted bits (leaves, metal bands) + `texMesh` for wood planks, stone, tile.

### Textures (you must generate them)

Use your **image generation tool** to create the textures your group needs: **2-4 PNGs, 512x512, seamlessly
tileable**, saved as `assets/textures/codex/<group>_<name>.png`. Reference them from `make()` by
`<group>_<name>` (the lab preloads everything listed in your `TEXTURES` export into `PNG['codex/<group>_<name>']`).
Prompt wording to use (adapt colours / subject):

> Seamless tileable texture, 512x512 PNG, straight-on orthographic view of <subject> for a cozy xianxia
> farming game. Hand-painted pixel-art style with soft painterly shading, colours <#hex to #hex>. Even flat
> lighting, no cast shadows, no perspective, no text, no border. Edges must tile seamlessly on all four sides.

Typical textures: weathered wood planks / bark, grey-blue stone blocks, mossy rock, roof tile, red lacquer,
woven straw / thatch, clay pottery, sand, ice, lava rock, jade. Good textures are mid-tone and low contrast
because the vertex/tint colour multiplies them (the lab normalises each map's average to `norm` x 255).
Write the exact image prompts you used to `src/lab/codex/prompts_<group>.md` (numbered).

## Hard rules

* Create/modify **only**: `src/lab/codex/<group>.js`, `src/lab/codex/prompts_<group>.md`, and
  `assets/textures/codex/<group>_*.png`. Do NOT touch `lib.js`, `index.js`, `assets.js`, `kit.js`, `lab.js`
  or anything else.
* Prefer baking transforms into geometry so child meshes sit at identity (position 0, rotation 0, scale 1);
  props whose child objects carry transforms still work but are placed by cloning instead of GPU instancing.
* No network, no `document`/canvas use at module top level (it is loaded inside the browser but must also
  parse in Node), no `Math.random`, no external model files.
* After writing, run `node --check src/lab/codex/<group>.js` and fix syntax errors. Then re-read your code
  once looking for runtime mistakes (undefined helpers, wrong imports, NaN sizes, missing ids).
* Final reply: list every id you implemented, the textures you generated, and anything you were unsure about.

## Groups and props (id — 中文名 — n variants)

**g1_village (11)** — well 水井 2 · scarecrow 稻草人 2 · fence 篱笆 4 · barrel 木桶 3 · crate 木箱 3 · jar 陶罐 4 ·
sign 路牌 2 · stoneLan 石灯笼 3 · lanPost 灯笼柱 2 · steps 踏脚石 3 · bridge 拱桥 2

**g2_plants (17)** — tree 阔叶树 5 · fruitTree 果树 3 · peach 桃花树 3 · bush 灌木 4 · berryBush 浆果丛 3 · flower 花丛 6 ·
grass 草丛 4 · mushroom 蘑菇 4 · crop 作物 5 · bamboo 竹丛 4 · pumpkin 南瓜 3 · flowerTree 花树 3 · wisteria 紫藤 2 ·
flowerBed 花圃 4 · herbRack 晒药架 2 · lingzhi 灵芝 3 · herb 灵草 4

**g3_wild (18)** — maple 枫树 4 · ginkgo 银杏 2 · leafPile 落叶堆 3 · autumnBush 红叶灌木 4 · autumnGrass 枯草 4 ·
snowPine 雪松 4 · pineTree 松树 4 · bareBush 枯枝丛 3 · deadTree 枯树 3 · stormPine 雷击松 3 · dryShrub 旱生灌丛 3 ·
swampTree 沼泽气根树 3 · bogPlant 沼泽植物 3 · bogShroom 毒菇 4 · swampGrass 沼草 4 · desertGrass 沙草 4 ·
ashGrass 焦草 4 · duneGrass 沙丘草 4

**g4_rocks (18)** — rock 岩石 5 · beachRock 礁石 5 · mossRock 苔石 5 · snowRock 雪岩 5 · caveRock 洞岩 5 · bogRock 沼石 5 ·
sandRock 砂岩 5 · lavaRock 熔岩石 5 · redRock 赤砂岩 5 · obsidian 黑曜石 3 · drift 雪堆 3 · ice 冰晶 3 · karst 石峰 4 ·
floatRock 浮空石 4 · jade 玉石 3 · vein 矿脉 8 · stump 树桩/倒木 4 · driftwood 浮木 3

**g5_places (18)** — palm 椰树 3 · reeds 芦苇 3 · lily 荷叶/荷花 3 · shell 贝壳/海星 4 · dock 码头 2 · crystal 灵晶簇 5 ·
ore 矿石 4 · stalag 石笋 4 · cart 矿车 2 · beam 支撑木架 2 · torch 火把 2 · glowShroom 荧光菇 4 · bonsai 迎客松 3 ·
lotus 莲花灯 2 · incense 香炉 2 · stele 石碑 3 · pavilion 亭子 2 · cloud 祥云 3

**g6_ruins (17)** — cactus 仙人掌 4 · pillar 遗迹石柱 4 · ruinWall 遗迹残墙 3 · statue 半埋石像 2 · sword 残剑 4 ·
banner 残旗 3 · shield 盾/盔 3 · grave 坟冢 3 · wreck 破战车 2 · formation 渡劫法阵 2 · stairs 石阶 2 ·
logSteps 木桩台阶 2 · ladder 木梯 2 · bones 兽骨 2 · fireFlower 火焰花 3 · vent 地火/硫磺口 2 · snowman 雪人 2

### Notes on a few props

* `vein` 矿脉: ore seam in a rock wall/outcrop; 8 variants = 8 different mineral colours (iron, copper, tin,
  silver, gold, spirit-crystal, jade, dark-iron) — mostly the same outcrop with different glowing/metal inclusions.
* `stairs` 石阶 / `logSteps` / `ladder`: climb a ~1.5-unit height step; the **top** is toward -Z, the bottom
  toward +Z; footprint about 2 x 3 units for stairs.
* `bridge` 拱桥 spans along X about 4-5 units, arched, with rails.
* `dock` 码头 is a plank pier about 6 units long along Z (end is over water at +Z).
* `cloud` 祥云 floats (the lab bobs it); `floatRock` is a floating island rock with hanging roots/crystals.
* `formation` 渡劫法阵: flat ground disc ~5 units across with glowing rune rings (use `kind:'glow'`).
* `torch`, `lotus`, `incense`, `vent`, `crystal`, `ore`, `glowShroom`, `bogShroom` etc. may carry a `light`.
* Trees: crowns may use `foliage(k, parts, color, accent, seed)` from kit.js (leaf-card crowns) or your own
  puffy blobs / textured clusters — your choice, but they must look good from above.
