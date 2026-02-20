'use client';

import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/lib/context';
import ProgressDots from './ProgressDots';

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
        question: 'どのような体験でしたか。',
        subtext: '最も近いものを選ぶか、自由に記述してください。',
        type: 'choice+text',
        options: ['背後に気配を感じた', '視線だけを感じた', '声を聞いた', '物の位置が変わった', '写真に違和感があった'],
        placeholder: '自由に入力する',
    },
    {
        id: 'where',
        question: 'どこで起きましたか。',
        type: 'choice+text',
        options: ['自宅', '通勤・通学路', '職場・学校', '旅先', '水辺', '決まっていない'],
        placeholder: '自由に入力する',
    },
    {
        id: 'when',
        question: 'いつ起きることが多いですか。',
        type: 'choice',
        options: ['夜', '夕方', '明け方', '時間はばらばら'],
    },
    {
        id: 'noticed',
        question: '最初に気づいたのは何でしたか。',
        subtext: '音・匂い・温度・光・視線など',
        type: 'choice+text',
        options: ['音', '匂い', '温度', '光', '視線'],
        placeholder: '自由に入力する',
    },
    {
        id: 'texture',
        question: 'その体験の質感に近いものは。',
        subtext: '身体感覚として最も近いものを選んでください。',
        type: 'choice+text',
        options: ['冷たい', '重い', '湿っている', 'ざらつく', '乾いている'],
        placeholder: '自由に入力する',
    },
    {
        id: 'alone',
        question: 'その時、あなたは一人でしたか。',
        type: 'choice',
        options: ['一人だった', '人はいたが気づいていない', '誰かと一緒だった'],
    },
    {
        id: 'reaction',
        question: 'その時、どうしましたか。',
        type: 'choice+text',
        options: ['動けなかった', 'その場を離れた', '確かめた', '誰かに話した', '見ないふりをした'],
        placeholder: '自由に入力する',
    },
    {
        id: 'stance',
        question: 'その体験に対して、どのような態度をとりますか。',
        subtext: '',
        type: 'choice+text',
        options: ['避けたい', '見届けたい', '話しかけたい', '忘れたい', '知りたい'],
        placeholder: '自由に入力する',
    },
    {
        id: 'absence',
        question: 'その気配の姿は、見えましたか。',
        subtext: '近い感覚を選んでください。',
        type: 'choice',
        options: ['見えなかった', '輪郭だけ見えた', 'はっきり見えた'],
    },
];

export default function Phase1Prime() {
    const {
        state,
        goToPhase,
        setTexture,
        setStance,
        setAbsenceQuality,
        setAnswers: saveAnswersToContext,
    } = useApp();

    const [currentStep, setCurrentStep] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [customText, setCustomText] = useState('');
    const [visible, setVisible] = useState(false);
    const [history, setHistory] = useState<Array<{ question: string; answer: string }>>([]);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const t = setTimeout(() => setVisible(true), 180);
        return () => clearTimeout(t);
    }, [currentStep]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [history, currentStep]);

    const answerStep = (value: string) => {
        const step = STEPS[currentStep];
        const nextAnswers = { ...answers, [step.id]: value };
        setAnswers(nextAnswers);

        if (step.id === 'texture') setTexture(value);
        if (step.id === 'stance') setStance(value);
        if (step.id === 'absence') {
            if (value === '見えなかった') {
                setAbsenceQuality('invisible');
            } else if (value === '輪郭だけ見えた') {
                setAbsenceQuality('blurry');
            } else {
                setAbsenceQuality('clear');
            }
        }

        setHistory((prev) => [...prev, { question: step.question, answer: value }]);
        setVisible(false);
        setCustomText('');

        setTimeout(() => {
            if (currentStep < STEPS.length - 1) {
                setCurrentStep((prev) => prev + 1);
            } else {
                saveAnswersToContext(nextAnswers);
                goToPhase(2);
            }
        }, 320);
    };

    const step = STEPS[currentStep];
    const handleText = state.selectedHandle?.text || '';

    return (
        <div
            ref={scrollRef}
            className="phase-scrollable"
            style={{ display: 'flex', flexDirection: 'column' }}
        >
            {history.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                    {history.map((h, i) => (
                        <div
                            key={i}
                            style={{
                                padding: '8px 0',
                                opacity: Math.max(0.16, 0.52 - (history.length - 1 - i) * 0.06),
                            }}
                        >
                            <p
                                style={{
                                    fontSize: 11,
                                    color: 'var(--text-ghost)',
                                    marginBottom: 2,
                                    letterSpacing: '0.05em',
                                }}
                            >
                                {h.question}
                            </p>
                            <p
                                style={{
                                    fontSize: 14,
                                    color: 'var(--text-dim)',
                                    fontFamily: 'var(--font-main)',
                                }}
                            >
                                {h.answer}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            <div
                className="question-block"
                style={{
                    opacity: visible ? 1 : 0,
                    transform: visible ? 'translateY(0)' : 'translateY(8px)',
                    transition: 'all 0.35s ease',
                }}
            >
                {currentStep === 0 && handleText && (
                    <p className="question-context">
                        {handleText.split('\n').map((line, i) => (
                            <span key={i}>
                                {line}
                                {i < handleText.split('\n').length - 1 && <br />}
                            </span>
                        ))}
                    </p>
                )}

                <p className="question-text">{step.question}</p>

                {step.subtext && (
                    <p
                        style={{
                            fontSize: 13,
                            color: 'var(--text-dim)',
                            marginBottom: 14,
                            marginTop: -6,
                            fontFamily: 'var(--font-main)',
                        }}
                    >
                        {step.subtext}
                    </p>
                )}

                {(step.type === 'text' || step.type === 'choice+text') && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                            type="text"
                            className="text-input"
                            placeholder={step.placeholder || '自由に入力する'}
                            value={customText}
                            onChange={(e) => setCustomText(e.target.value)}
                            onFocus={(e) => {
                                setTimeout(() => {
                                    e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }, 300);
                            }}
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
                                送信
                            </button>
                        )}
                    </div>
                )}

                {(step.type === 'choice' || step.type === 'choice+text') && step.options && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                        {step.options.map((opt) => (
                            <button key={opt} className="chip" onClick={() => answerStep(opt)}>
                                {opt}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div style={{ height: 60 }} />
            <ProgressDots current={2} />
        </div>
    );
}