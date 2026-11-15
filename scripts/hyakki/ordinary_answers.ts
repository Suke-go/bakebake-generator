// Who answers under the ordinary construction (unit means and pictures)? Plays 300 sessions with five yokai drawn
// at random from one region, as scripts/hyakki/simulate_echoes.py does, and writes the caller-answer pairs.
// Run: npx tsx scripts/hyakki/ordinary_answers.ts   ->  paper/hyakki/ordinary_answers.json
import { writeFileSync } from 'node:fs';
import { hyakkiOrdinaryAnswers, hyakkiPlayable } from '../../src/lib/hyakki-server';

// A small seeded generator, so that the sample can be drawn again.
let seed = 12345;
const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];

async function main() {
    const units = await hyakkiPlayable();
    const regions = [...new Set(units.map(u => u.region))].sort();
    const out: { caller: string; answer: string }[] = [];
    for (let n = 0; n < 300; n++) {
        const region = pick(regions);
        const pool = units.filter(u => u.region === region);
        const chosen: typeof units = [];
        while (chosen.length < 5) {
            const u = pick(pool);
            if (!chosen.some(c => c.kind === u.kind)) chosen.push(u);
        }
        out.push(...await hyakkiOrdinaryAnswers(chosen.map(c => c.key)));
    }
    writeFileSync('paper/hyakki/ordinary_answers.json', JSON.stringify(out));
    console.log(out.length, 'answers');
}
void main();
