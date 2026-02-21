'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
        id: 'where',
        question: 'どんな場所での体験ですか。',
        subtext: '夢で見たこと、日常のふとした違和感——なんでも構いません。',
        type: 'choice+text',
        options: ['自宅', '通勤・通学路', '職場・学校', '旅先', '水辺', '決まっていない'],
        placeholder: '自由に入力する',
    },
    {
        id: 'when',
        question: 'いつ頃のことですか。',
        type: 'choice',
        options: ['夜', '夕方', '明け方', '時間はばらばら'],
    },
    {
        id: 'noticed',
        question: '最初に気づいたのは何でしたか。',
        subtext: '音、匂い、温度、光、視線……',
        type: 'choice+text',
        options: ['音', '匂い', '温度', '光', '視線'],
        placeholder: '自由に入力する',
    },
    {
        id: 'texture',
        question: 'その体験の質感に近いものはどれですか。',
        subtext: '身体の感覚として最も近いものを選んでください。',
        type: 'choice+text',
        options: ['冷たい', '重い', '湿っている', 'ざらつく', '乾いている'],
        placeholder: '自由に入力する',
    },
    {
        id: 'emotion',
        question: 'そのとき、どんな気持ちになりましたか。',
        type: 'choice+text',
        options: ['怖かった', '不思議だった', '懐かしかった', '心細かった', '惹かれた'],
        placeholder: '自由に入力する',
    },
    {
        id: 'nature',
        question: 'もしそれが妖怪のしわざだとしたら——',
        subtext: '現象だと思いますか、それとも何か実体があると思いますか。',
        type: 'choice',
        options: ['目に見えない現象だと思う', '気配はあるが姿はない', '何か実体があると思う'],
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
        backOverrideRef,
    } = useApp();

    const [currentStep, setCurrentStep] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [customText, setCustomText] = useState('');
    const [visible, setVisible] = useState(false);
    const [history, setHistory] = useState<Array<{ question: string; answer: string }>>([]);
    const scrollRef = useRef<HTMLDivElement>(null);

    // サブステップを1つ戻す
    const goBackStep = useCallback(() => {
        if (currentStep <= 0) return;
        setVisible(false);
        setCustomText('');
        setTimeout(() => {
            const stepToUndo = STEPS[currentStep - 1];
            setAnswers(prev => {
                const next = { ...prev };
                delete next[stepToUndo.id];
                return next;
            });
            setHistory(prev => prev.slice(0, -1));
            if (stepToUndo.id === 'texture') setTexture('');
            if (stepToUndo.id === 'emotion') setStance('');
            if (stepToUndo.id === 'nature') setAbsenceQuality(null);
            setCurrentStep(currentStep - 1);
        }, 320);
    }, [currentStep, setTexture, setStance, setAbsenceQuality]);

    // ページレベルの戻るボタンにサブステップ戻りを登録
    useEffect(() => {
        if (currentStep > 0) {
            backOverrideRef.current = () => {
                goBackStep();
                return true;
            };
        } else {
            backOverrideRef.current = null;
        }
        return () => { backOverrideRef.current = null; };
    }, [currentStep, goBackStep, backOverrideRef]);

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
        if (!value.trim()) return;
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        const step = STEPS[currentStep];
        const nextAnswers = { ...answers, [step.id]: value };
        setAnswers(nextAnswers);

        if (step.id === 'texture') setTexture(value);
        if (step.id === 'emotion') setStance(value);
        if (step.id === 'nature') {
            if (value === '目に見えない現象だと思う') {
                setAbsenceQuality('invisible');
            } else if (value === '気配はあるが姿はない') {
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
                <p style={{
                    fontSize: 10,
                    color: 'var(--text-ghost)',
                    letterSpacing: '0.15em',
                    marginBottom: 8,
                }}>
                    {currentStep + 1} / {STEPS.length}
                </p>

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