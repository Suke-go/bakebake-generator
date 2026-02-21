import { Handle } from './context';

export const HANDLES: Handle[] = [
    {
        id: 'A',
        text: '夜道を歩いているのに\n背後に足音だけがする',
        shortText: '背後に足音',
    },
    {
        id: 'B',
        text: '静かな部屋で視線だけがして\n振り向いても誰もいない',
        shortText: '視線だけがする',
    },
    {
        id: 'C',
        text: '寝入りばなに声を聞いた\n目覚めると静かだった',
        shortText: '声を聞いた',
    },
    {
        id: 'D',
        text: 'なくした物が戻るのに\n置いた覚えがない',
        shortText: '物の位置が変わる',
    },
    {
        id: 'E',
        text: '写真を見返したあと\n写っていないものを感じる',
        shortText: '写真に違和感',
    },
];

export const TEXTURE_OPTIONS = ['冷たい', '重い', '湿っている', 'ざらつく'];

export const STANCE_OPTIONS = ['避けたい', '近づいてみたい', '話しかけたい', '見届けたい'];

export const ABSENCE_OPTIONS = [
    { value: 'invisible' as const, label: '見えなかった' },
    { value: 'blurry' as const, label: '輪郭だけ見えた' },
    { value: 'clear' as const, label: 'はっきり見えた' },
];

export const MOCK_FOLKLORE: Array<{
    id: string;
    kaiiName: string;
    content: string;
    location: string;
    similarity: number;
}> = [
        {
            id: 'f001',
            kaiiName: 'ベトベトサン',
            content: '夜道で後ろから足音がついてくる。「ベトベトサン、お先にどうぞ」と言うと止む。',
            location: '奈良県',
            similarity: 0.82,
        },
        {
            id: 'f002',
            kaiiName: 'ヌリカベ',
            content: '夜道を歩いていると急に前に進めなくなる。見えない壁が立ちはだかるという。',
            location: '福岡県',
            similarity: 0.76,
        },
        {
            id: 'f003',
            kaiiName: '呼子',
            content: '山中で名前を呼ばれるが誰もいない。返事をすると災いがあるとされる。',
            location: '各地',
            similarity: 0.71,
        },
    ];

export const MOCK_CONCEPTS = [
    {
        source: 'db' as const,
        name: '視返し',
        reading: 'みかえし',
        description: '人の気配を残し、角や廊下で過去の視線を再現する。',
        label: '伝承に近い',
    },
    {
        source: 'db' as const,
        name: '背追い',
        reading: 'せおい',
        description: '背後の足音が近づき、振り向くと停止する現象。',
        label: '伝承に近い',
    },
    {
        source: 'llm' as const,
        name: '残気',
        reading: 'ざんき',
        description: '体験者の入力をもとにAIが生成した名前。',
        label: 'AI生成',
    },
];