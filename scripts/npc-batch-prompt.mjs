// Print the 5x5 sheet prompt for one batch of assets/npc/plan.json.
//   node scripts/npc-batch-prompt.mjs b1 > prompt.txt
import fs from 'node:fs';

const id = process.argv[2];
const plan = JSON.parse(fs.readFileSync('assets/npc/plan.json', 'utf8'));
const b = plan.batches.find((x) => x.id === id);
if (!b) { console.error('no batch', id); process.exit(1); }

const head = `A single 5x5 grid sheet of 25 separate 2D half-body character portraits for a Chinese xianxia farming game. Strict grid layout: 5 rows and 5 columns. Each character is centered inside its own invisible portrait cell (about 205 x 307 px). Each character occupies about 65% of the cell width and about 72% of the cell height, with at least 15% empty transparent space on all four sides, so no character touches or crosses a cell border. Transparent background everywhere outside the characters, no grid lines, no labels, no text, no shadows on the background.

Style: glossy 3D-rendered chibi xianxia toy-figure look with a soft painterly finish, soft studio lighting, oversized chibi head (about 40% of the figure height), very large expressive glossy brown eyes even on adults and elders, small nose and mouth, smooth skin, detailed embroidered hanfu / robes, consistent scale and head size across all 25 characters. Half-body, facing the viewer, seen from the waist up, relaxed poses that suit a conversation portrait. Every character must look clearly different from the others (face, hairstyle, age, expression, prop): vary face shapes (round, oval, long, square, chubby, thin), show real age differences (children, teens, people in their twenties, forties with fine lines, wrinkled elders) and vary hairstyles (buns, braids, ponytails, half-up, short, headscarves, hats). Men and boys must read clearly as male (short hair, a top-knot or a tied ponytail, stronger brows and jaw; young men never have loose long flowing hair); women and girls clearly female.

${b.palette}`;

const names = ['Row 1 (left to right)', 'Row 2', 'Row 3', 'Row 4', 'Row 5'];
const rows = [0, 1, 2, 3, 4].map((r) => `${names[r]}: ${b.cells.slice(r * 5, r * 5 + 5).map((c) => c[3]).join('; ')}.`);
process.stdout.write(`${head}\n\n${rows.join('\n')}\n`);
