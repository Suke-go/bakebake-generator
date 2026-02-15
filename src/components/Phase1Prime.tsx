'use client';

import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/lib/context';
import ProgressDots from './ProgressDots';

/**
 * Phase 1' — 深堀り質問
 *
 * 具体→抽象のグラデーション:
 *   1. event (具体的な出来事)
 *   2. where (場所)
 *   3. when (時期)
 *   4. sensory (五感で気づいたこと)
 *   5. texture (体の感覚)
 *   6. alone (関係性)
 *   7. reaction (どうしたか)
 *   8. stance (どうしたいか)
 *   9. absence (姿の予感 — 最も抽象)
 */

interface StepDef {
    id: string;
    question: string;
    subtext?: string;
    type: 'choice' | 'text' | 'choice+text';
    options?: string[];
    placeholder?: string;
}

const STEPS: StepDef[] = [
    {
        id: 'event',
        question: 'それは、どんなときに起きましたか？',
        subtext: '具体的な場面を思い出してみてください',
        type: 'choice+text',
        options: [
            '夜中に目が覚めた',
            '誰もいない場所で',
            'ふとした瞬間に',
            '人混みの中で',
            '夢の中で',
        ],
        placeholder: 'そのときのことを…',
    },
    {
        id: 'where',
        question: 'そのとき、どこにいましたか？',
        type: 'choice+text',
        options: [
            '自分の部屋',
            '外を歩いていた',
            '電車やバスの中',
            '布団の中',
            '水の近く',
            '知らない場所',
        ],
        placeholder: 'ほかの場所…',
    },
    {
        id: 'when',
        question: 'それは、いつごろのことですか？',
        type: 'choice',
        options: [
            '今日のこと',
            'ここ数日のあいだ',
            'もうだいぶ前',
            'いつからか、ずっと',
        ],
    },
    {
        id: 'noticed',
        question: 'そのとき、何か気づいたことはありますか？',
        subtext: '音、匂い、光、空気の変化など',
        type: 'choice+text',
        options: [
            '音がした',
            '空気が変わった',
            '匂いがした',
            '温度が変わった',
            '何もないのに、わかった',
        ],
        placeholder: 'そのとき気づいたこと…',
    },
    {
        id: 'texture',
        question: '体で感じたことを、言葉にすると？',
        subtext: '考えずに、最初に浮かんだものを',
        type: 'choice+text',
        options: [
            '冷たい',
            '重い',
            'なつかしい',
            'チクチクする',
            '漂っている',
            '息苦しい',
            'あたたかい',
        ],
        placeholder: 'ほかの言葉で…',
    },
    {
        id: 'alone',
        question: 'そのとき、まわりに誰かいましたか？',
        type: 'choice',
        options: [
            'ひとりだった',
            '人はいたが、気づいていない',
            '誰かと一緒だった',
        ],
    },
    {
        id: 'reaction',
        question: 'そのとき、あなたはどうしましたか？',
        type: 'choice+text',
        options: [
            '動けなかった',
            'その場を離れた',
            'そのままじっとしていた',
            '誰かに話した',
            '忘れようとした',
        ],
        placeholder: 'そのほかに…',
    },
    {
        id: 'stance',
        question: 'いま思い返すと、それに対してどうしたいですか？',
        subtext: '正解はありません',
        type: 'choice+text',
        options: [
            '逃げたい',
            'じっと見ていたい',
            '話しかけたい',
            'そっとしておきたい',
            '触れてみたい',
        ],
        placeholder: 'ほかの気持ち…',
    },
    {
        id: 'absence',
        question: 'もしそれが姿を持っているとしたら——どんなふうに見えますか？',
        subtext: 'はっきりしなくても大丈夫です',
        type: 'choice',
        options: [
            '見えない。でもいる',
            'ぼんやりと、何かの形が',
            'はっきりと見える',
        ],
    },
];

export default function Phase1Prime() {
    const { state, goToPhase, setTexture, setStance, setAbsenceQuality } = useApp();
    const [currentStep, setCurrentStep] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [customText, setCustomText] = useState('');
    const [visible, setVisible] = useState(false);
    const [history, setHistory] = useState<Array<{ question: string; answer: string }>>([]);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const t = setTimeout(() => setVisible(true), 200);
        return () => clearTimeout(t);
    }, [currentStep]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [history, currentStep]);

    const answerStep = (value: string) => {
        const step = STEPS[currentStep];
        const newAnswers = { ...answers, [step.id]: value };
        setAnswers(newAnswers);

        if (step.id === 'texture') setTexture(value);
        if (step.id === 'stance') setStance(value);
        if (step.id === 'absence') {
            const q = value.includes('見えない') ? 'invisible'
                : value.includes('ぼんやり') ? 'blurry' : 'clear';
            setAbsenceQuality(q);
        }

        setHistory(prev => [...prev, { question: step.question, answer: value }]);
        setVisible(false);
        setCustomText('');

        setTimeout(() => {
            if (currentStep < STEPS.length - 1) {
                setCurrentStep(currentStep + 1);
            } else {
                goToPhase(2);
            }
        }, 400);
    };

    const step = STEPS[currentStep];
    const handleText = state.selectedHandle?.text || '';

    return (
        <div
            ref={scrollRef}
            className="phase-scrollable"
            style={{ display: 'flex', flexDirection: 'column' }}
        >
            {/* Answered history */}
            {history.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                    {history.map((h, i) => (
                        <div
                            key={i}
                            style={{
                                padding: '8px 0',
                                opacity: Math.max(0.15, 0.5 - (history.length - 1 - i) * 0.06),
                            }}
                        >
                            <p style={{
                                fontSize: 11, color: 'var(--text-ghost)',
                                marginBottom: 2, letterSpacing: '0.05em',
                            }}>
                                {h.question}
                            </p>
                            <p style={{
                                fontSize: 14, color: 'var(--text-dim)',
                                fontFamily: 'var(--font-main)',
                            }}>
                                {h.answer}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {/* Current question */}
            <div
                className="question-block"
                style={{
                    opacity: visible ? 1 : 0,
                    transform: visible ? 'translateY(0)' : 'translateY(8px)',
                    transition: 'all 0.4s ease',
                }}
            >
                {currentStep === 0 && (
                    <p className="question-context">
                        {handleText.split('\n').map((line, i) => (
                            <span key={i}>
                                {line}
                                {i === 0 && <br />}
                            </span>
                        ))}
                    </p>
                )}

                <p className="question-text">{step.question}</p>

                {step.subtext && (
                    <p style={{
                        fontSize: 13,
                        color: 'var(--text-dim)',
                        marginBottom: 16,
                        marginTop: -8,
                        fontFamily: 'var(--font-main)',
                    }}>
                        {step.subtext}
                    </p>
                )}

                {(step.type === 'choice' || step.type === 'choice+text') && step.options && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                        {step.options.map((opt) => (
                            <button key={opt} className="chip" onClick={() => answerStep(opt)}>
                                {opt}
                            </button>
                        ))}
                    </div>
                )}

                {(step.type === 'text' || step.type === 'choice+text') && (
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                            type="text"
                            className="text-input"
                            placeholder={step.placeholder || '自由に入力…'}
                            value={customText}
                            onChange={(e) => setCustomText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && customText.trim()) {
                                    answerStep(customText.trim());
                                }
                            }}
                            style={{ flex: 1, maxWidth: 'none' }}
                        />
                        {customText.trim() && (
                            <button
                                className="button button-primary"
                                style={{ padding: '10px 16px', fontSize: 13 }}
                                onClick={() => answerStep(customText.trim())}
                            >
                                →
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div style={{ height: 60 }} />
            <ProgressDots current={2} />
        </div>
    );
}
