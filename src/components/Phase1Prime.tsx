'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/context';
import ProgressDots from './ProgressDots';

type Answers = Record<string, string>;
type StepId = 'experience' | 'context' | 'salientFeature' | 'duration' | 'explanation';

interface StepDef {
    id: StepId;
    question: string;
    subtext?: string;
    optional?: boolean;
}

const STEPS: StepDef[] = [
    { id: 'experience', question: 'どんなことがありましたか？', subtext: '一度だけの出来事でも、繰り返す感覚でも構いません。覚えていることを、短い言葉で書いてください。' },
    { id: 'context', question: 'どんな場面でしたか？', subtext: '場所や、そのときしていたことを、覚えている範囲で教えてください。', optional: true },
    { id: 'salientFeature', question: 'その経験で、特に気になったのはどんなところですか？', subtext: '最初の回答と同じことを書いても構いません。', optional: true },
    { id: 'duration', question: 'その経験は、どのように続きましたか？', subtext: '同じことが繰り返されたか、一度の経験がどのくらい続いたかを教えてください。', optional: true },
    { id: 'explanation', question: 'この経験について、すでに自分なりの説明はありますか？', subtext: 'ここで新しく考え出す必要はありません。', optional: true },
];

const RECURRENCE_OPTIONS = ['今回だけ', 'ほかにもある', '分からない'];
const EXPLANATION_OPTIONS = ['ある', '特にない', '回答しない'];

function textValue(answers: Answers, key: string) {
    return answers[key] ?? '';
}

export default function Phase1Prime() {
    const { state, goToPhase, setAnswers: saveAnswersToContext, setHandle, backOverrideRef } = useApp();
    const [currentStep, setCurrentStep] = useState(0);
    const [answers, setAnswers] = useState<Answers>(() => state.answers);
    const [visible, setVisible] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const updateAnswer = useCallback((key: string, value: string) => {
        setAnswers(previous => (
            key === 'hasExplanation' && value !== 'ある'
                ? { ...previous, hasExplanation: value, explanation: '' }
                : { ...previous, [key]: value }
        ));
    }, []);

    const goBackToStep = useCallback((targetStep: number) => {
        if (isTransitioning || targetStep < 0 || targetStep >= currentStep) return;
        setVisible(false);
        setIsTransitioning(true);
        window.setTimeout(() => {
            setCurrentStep(targetStep);
            setIsTransitioning(false);
        }, 220);
    }, [currentStep, isTransitioning]);

    const goBackStep = useCallback(() => {
        if (currentStep > 0) goBackToStep(currentStep - 1);
    }, [currentStep, goBackToStep]);

    useEffect(() => {
        backOverrideRef.current = currentStep > 0
            ? () => {
                goBackStep();
                return true;
            }
            : null;
        return () => { backOverrideRef.current = null; };
    }, [backOverrideRef, currentStep, goBackStep]);

    useEffect(() => {
        const timer = window.setTimeout(() => setVisible(true), 140);
        return () => clearTimeout(timer);
    }, [currentStep]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }, [currentStep]);

    const finish = useCallback(() => {
        const experience = textValue(answers, 'experience').trim();
        if (!experience) return;
        const completedAnswers = { ...answers, experience };
        saveAnswersToContext(completedAnswers);
        // The participant's own experience supplies Phase 2's search source.
        setHandle({ id: 'free', text: experience, shortText: experience.slice(0, 24) });
        goToPhase(2);
    }, [answers, goToPhase, saveAnswersToContext, setHandle]);

    const advance = useCallback(() => {
        if (isTransitioning || (STEPS[currentStep].id === 'experience' && !textValue(answers, 'experience').trim())) return;
        setVisible(false);
        setIsTransitioning(true);
        window.setTimeout(() => {
            if (currentStep === STEPS.length - 1) finish();
            else {
                setCurrentStep(stepIndex => stepIndex + 1);
                setIsTransitioning(false);
            }
        }, 220);
    }, [answers, currentStep, finish, isTransitioning]);

    const step = STEPS[currentStep];
    const canAdvance = step.optional || Boolean(textValue(answers, 'experience').trim());
    const history = STEPS.slice(0, currentStep).map((previousStep, index) => {
        const summary = previousStep.id === 'context'
            ? [textValue(answers, 'location'), textValue(answers, 'activity')].filter(Boolean).join(' / ')
            : previousStep.id === 'duration'
                ? [textValue(answers, 'recurrence'), textValue(answers, 'duration')].filter(Boolean).join(' / ')
                : previousStep.id === 'explanation'
                    ? textValue(answers, 'hasExplanation') === 'ある'
                        ? textValue(answers, 'explanation') || 'ある'
                        : textValue(answers, 'hasExplanation')
                    : textValue(answers, previousStep.id);
        return { index, question: previousStep.question, answer: summary || '回答なし' };
    });

    return (
        <div ref={scrollRef} className="phase-scrollable" style={{ display: 'flex', flexDirection: 'column' }}>
            {history.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                    {history.map(item => (
                        <button key={item.index} type="button" onClick={() => goBackToStep(item.index)} style={{ display: 'block', width: '100%', padding: '8px 0', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.42 }}>
                            <p style={{ fontSize: 11, color: 'var(--text-ghost)', marginBottom: 2, letterSpacing: '0.05em' }}>{item.question}</p>
                            <p style={{ fontSize: 14, color: 'var(--text-dim)', fontFamily: 'var(--font-main)' }}>{item.answer}</p>
                        </button>
                    ))}
                </div>
            )}

            <div className="question-block" style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(8px)', transition: 'all 0.28s ease' }}>
                <p style={{ fontSize: 10, color: 'var(--text-ghost)', letterSpacing: '0.15em', marginBottom: 8 }}>{currentStep + 1} / {STEPS.length}</p>
                <p className="question-text">{step.question}</p>
                {step.subtext && <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '-6px 0 14px', fontFamily: 'var(--font-main)', lineHeight: 1.8 }}>{step.subtext}</p>}

                {step.id === 'experience' && (
                    <textarea className="text-input" value={textValue(answers, 'experience')} onChange={event => updateAnswer('experience', event.target.value)} placeholder="たとえば、気になったことや、説明しにくかった感覚をそのまま書いてください" rows={5} autoFocus style={{ width: '100%', minHeight: 116, resize: 'vertical' }} />
                )}

                {step.id === 'context' && (
                    <div style={{ display: 'grid', gap: 14 }}>
                        <label style={{ display: 'grid', gap: 6 }}><span className="label">どこでのことでしたか？</span><input className="text-input" value={textValue(answers, 'location')} onChange={event => updateAnswer('location', event.target.value)} placeholder="場所や、その場の様子" /></label>
                        <label style={{ display: 'grid', gap: 6 }}><span className="label">そのとき、何をしていましたか？</span><input className="text-input" value={textValue(answers, 'activity')} onChange={event => updateAnswer('activity', event.target.value)} placeholder="していたことがあれば" /></label>
                    </div>
                )}

                {step.id === 'salientFeature' && (
                    <textarea className="text-input" value={textValue(answers, 'salientFeature')} onChange={event => updateAnswer('salientFeature', event.target.value)} placeholder="気になったことを、自分の言葉で" rows={4} style={{ width: '100%', minHeight: 96, resize: 'vertical' }} />
                )}

                {step.id === 'duration' && (
                    <div style={{ display: 'grid', gap: 18 }}>
                        <div><p className="label" style={{ marginBottom: 8 }}>同じような経験は、ほかにもありますか？</p><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {RECURRENCE_OPTIONS.map(option => <button key={option} type="button" className={'chip' + (textValue(answers, 'recurrence') === option ? ' selected' : '')} onClick={() => updateAnswer('recurrence', option)}>{option}</button>)}
                        </div></div>
                        <label style={{ display: 'grid', gap: 6 }}><span className="label">一回の経験は、どのくらい続きましたか？</span><input className="text-input" value={textValue(answers, 'duration')} onChange={event => updateAnswer('duration', event.target.value)} placeholder="今も続いている、分からない、でも構いません" /></label>
                        <label style={{ display: 'grid', gap: 6 }}><span className="label">途中や、その後に変わったことがあれば教えてください（任意）</span><textarea className="text-input" value={textValue(answers, 'change')} onChange={event => updateAnswer('change', event.target.value)} rows={3} style={{ width: '100%', minHeight: 76, resize: 'vertical' }} /></label>
                    </div>
                )}

                {step.id === 'explanation' && (
                    <div style={{ display: 'grid', gap: 14 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {EXPLANATION_OPTIONS.map(option => <button key={option} type="button" className={'chip' + (textValue(answers, 'hasExplanation') === option ? ' selected' : '')} onClick={() => updateAnswer('hasExplanation', option)}>{option}</button>)}
                        </div>
                        {textValue(answers, 'hasExplanation') === 'ある' && <label style={{ display: 'grid', gap: 6 }}><span className="label">どのように考えていますか？</span><textarea className="text-input" value={textValue(answers, 'explanation')} onChange={event => updateAnswer('explanation', event.target.value)} rows={4} autoFocus style={{ width: '100%', minHeight: 96, resize: 'vertical' }} /></label>}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
                    {step.optional && <button type="button" className="button" disabled={isTransitioning} onClick={advance}>このまま進む</button>}
                    <button type="button" className="button button-primary" disabled={!canAdvance || isTransitioning} onClick={advance} style={{ opacity: canAdvance && !isTransitioning ? 1 : 0.45 }}>{currentStep === STEPS.length - 1 ? '妖怪を探す' : '次へ'}</button>
                </div>
            </div>
            <div style={{ height: 60 }} />
            <ProgressDots current={2} />
        </div>
    );
}
