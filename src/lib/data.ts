import { Handle } from './context';

export const HANDLES: Handle[] = [
    {
        id: 'A',
        text: '同じ道を歩いているのに、\n今日だけ空気が変わった気がする',
        shortText: '空気が変わった',
    },
    {
        id: 'B',
        text: 'しずかな部屋で気配がして、\n息をひそめる',
        shortText: '気配がする',
    },
    {
        id: 'C',
        text: 'ずっと聞こえていた音が止まって、\n静けさが重くなる',
        shortText: '音が止まる',
    },
    {
        id: 'D',
        text: 'なくしたはずのものの手触りが、\nまだ指に残っている',
        shortText: '手触りが残る',
    },
    {
        id: 'E',
        text: '画面を閉じたあとも、\n画面の中のことが頭から離れない',
        shortText: '頭から離れない',
    },
];

export const TEXTURE_OPTIONS = ['冷たい', '重い', 'なつかしい', 'ぬるい'];

export const STANCE_OPTIONS = ['逃げたい', 'じっと見ている', '話しかけたい', 'そっとしておく'];

export const ABSENCE_OPTIONS = [
    { value: 'invisible' as const, label: '見えない' },
    { value: 'blurry' as const, label: 'ぼんやりと' },
    { value: 'clear' as const, label: 'はっきりと' },
];

// Mock folklore results for prototype
export const MOCK_FOLKLORE: Array<{
    id: string;
    kaiiName: string;
    content: string;
    location: string;
    similarity: number;
}> = [
        {
            id: 'f001',
            kaiiName: '送り狼',
            content: '夜、山道を歩いていると後ろから足音がついてくる。振り返ると誰もいない。',
            location: '岩手県遠野',
            similarity: 0.82,
        },
        {
            id: 'f002',
            kaiiName: '枕返し',
            content: '寝ていると枕元に何かが立つ気配がする。目を開けても何もいない。',
            location: '長野県',
            similarity: 0.76,
        },
        {
            id: 'f003',
            kaiiName: '家鳴り',
            content: '夜中に家の中で音がする。柱が鳴り、天井がきしむ。誰もいないのに。',
            location: '京都府',
            similarity: 0.71,
        },
    ];

export const MOCK_CONCEPTS = [
    {
        source: 'db1' as const,
        name: '枕返し',
        reading: 'まくらがえし',
        description: '眠りの中に現れる存在。寝ている人の枕をひっくり返す。',
        label: '伝承に残る名',
    },
    {
        source: 'db2' as const,
        name: '座敷わらし',
        reading: 'ざしきわらし',
        description: '家の中に棲む気配。姿は見えないが、いることがわかる。',
        label: '伝承に残る名',
    },
    {
        source: 'llm' as const,
        name: '残り影',
        reading: 'のこりかげ',
        description: 'あなたの体験から生まれた名前。',
        label: 'あなたの体験から',
    },
];
