export type Option = { v: string; label: string; hint: string };

export const POSITION: Option[] = [
    { v: 'kin', label: '身内', hint: '家族・親族・夫婦・親子' },
    { v: 'inside', label: '内側の他人', hint: '同じ村・近所・職場など、同じ集団の中の他人や家（犬神筋・狐持ちとされる家、恨んだ近所の人、生霊を飛ばす知り合い）' },
    { v: 'outside', label: '外から来た者', hint: '旅人・六部・巡礼・よそ者・見知らぬ人' },
    { v: 'group', label: '集団', hint: '特定の人や家を指さない、集団そのもの（村の決まり、世間のうわさ、大勢）' },
    { v: 'nature', label: '自然', hint: '自然・天候・場所・動物としてふるまう動物や水' },
    { v: 'self', label: '本人の行い', hint: '本人の行い（禁を破る、約束を守らない、殺生する）が出来事のもとだと書かれているときだけ' },
    { v: 'unknown', label: '正体不明', hint: '名のある存在に帰されているが、裏に人間も自然も書かれていない（化かされた、さらわれた、声だけ）。人の姿で現れた存在や、化かす・憑く動物もここ' },
];

export const DISTURBANCE: Option[] = [
    { v: 'demand', label: '1 負担を求められる', hint: '負担・犠牲・役目を、断れない形で求められる（人身御供、輪番、無理な頼み）' },
    { v: 'exclude', label: '2 避けられる・外される', hint: '避けられる・差別される・仲間から外される（家筋の婚姻忌避、村八分、うわさで孤立）' },
    { v: 'violate', label: '3 決まりを破る', hint: '決まり・禁・約束・義理を破る、または果たさない' },
    { v: 'deceive', label: '4 欺かれる', hint: 'だまされる・惑わされる・道を失う・偽りを見せられる' },
    { v: 'seize', label: '5 とらわれる', hint: 'とらわれる・取り憑かれる・やめられない・人が変わる' },
    { v: 'harm', label: '6 害される', hint: '害される・病む・けがをする・奪われる（上のどれでもないもの）' },
    { v: 'loss', label: '7 失う', hint: '死別・喪失・いなくなる' },
    { v: 'fortune', label: '8 盛衰', hint: '急に富む・急に衰える・家が栄える／絶える' },
    { v: 'omen', label: '9 兆し', hint: '兆しや知らせを受け取る（夢、音、鳴き声）' },
    { v: 'encounter', label: '10 出会う', hint: '異様なものに出会う・見る・聞くだけで、上のどれでもない' },
    { v: 'origin', label: '11 由来', hint: '由来・名残・地名の説明だけ' },
    { v: 'none', label: '12 なし', hint: '出来事がない（まじないの方法だけ、など）' },
];

export const HANDLING: Option[] = [
    { v: 'avoid', label: '避ける・禁じる', hint: '慎む・避ける・禁じる' },
    { v: 'ritual', label: '祓う・祀る', hint: '祓う・祀る・供養する' },
    { v: 'origin', label: '由来として受け入れる', hint: '由来として受け入れる' },
    { v: 'counter', label: '対抗する・退治する', hint: '対抗する・退治する' },
    { v: 'none', label: 'なし', hint: '書かれていない' },
];

export type CodingItem = { id: string; no: number; name: string; pref: string; summary: string };
export type CodingAnswer = { A1: string | null; B: string | null; H: string | null; memo: string };

const has = (list: Option[], v: unknown) => typeof v === 'string' && list.some((o) => o.v === v);

export function parseAnswer(v: unknown): CodingAnswer | null {
    if (!v || typeof v !== 'object') return null;
    const a = v as Record<string, unknown>;
    const pick = (list: Option[], x: unknown) => (x === null || x === undefined ? null : has(list, x) ? (x as string) : undefined);
    const A1 = pick(POSITION, a.A1); const B = pick(DISTURBANCE, a.B); const H = pick(HANDLING, a.H);
    if (A1 === undefined || B === undefined || H === undefined) return null;
    const memo = typeof a.memo === 'string' ? a.memo.slice(0, 500) : '';
    return { A1, B, H, memo };
}
