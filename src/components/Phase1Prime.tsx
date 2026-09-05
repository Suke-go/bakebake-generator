'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/lib/context';
import ProgressDots from './ProgressDots';

type Answers = Record<string, string>;
type StepId = 'experience' | 'context' | 'salientFeature' | 'duration' | 'explanation';
interface StepDef { id: StepId; question: string; subtext?: string; optional?: boolean; }

const JA_STEPS: StepDef[] = [
    { id: 'experience', question: 'どんなことがありましたか？', subtext: '一度だけの出来事でも、繰り返す感覚でも構いません。覚えていることを、短い言葉で書いてください。' },
    { id: 'context', question: 'どんな場面でしたか？', subtext: '場所や、そのときしていたことを、覚えている範囲で教えてください。', optional: true },
    { id: 'salientFeature', question: 'その経験で、特に気になったのはどんなところですか？', subtext: '最初の回答と同じことを書いても構いません。', optional: true },
    { id: 'duration', question: 'その経験は、どのように続きましたか？', subtext: '同じことが繰り返されたか、一度の経験がどのくらい続いたかを教えてください。', optional: true },
    { id: 'explanation', question: 'この経験について、すでに自分なりの説明はありますか？', subtext: 'ここで新しく考え出す必要はありません。', optional: true },
];
const EN_STEPS: StepDef[] = [
    { id: 'experience', question: 'What happened?', subtext: 'It can be a one-time event or a feeling that returns. Write a few words about what you remember.' },
    { id: 'context', question: 'What was the situation?', subtext: 'Tell us where you were and what you were doing, as much as you remember.', optional: true },
    { id: 'salientFeature', question: 'What part of the experience stayed with you most?', subtext: 'You can repeat something from your first answer.', optional: true },
    { id: 'duration', question: 'How did the experience continue?', subtext: 'Tell us whether it happened again, and how long a single occurrence lasted.', optional: true },
    { id: 'explanation', question: 'Do you already have your own explanation for this experience?', subtext: 'You do not need to come up with one now.', optional: true },
];

const JA_RECURRENCE = [['once', '今回だけ'], ['recurring', 'ほかにもある'], ['unknown', '分からない']] as const;
const EN_RECURRENCE = [['once', 'This time only'], ['recurring', 'It has happened before'], ['unknown', 'I’m not sure']] as const;
const JA_EXPLANATION = [['yes', 'ある'], ['no', '特にない'], ['skip', '回答しない']] as const;
const EN_EXPLANATION = [['yes', 'Yes'], ['no', 'Not really'], ['skip', 'Prefer not to say']] as const;
const valueIsYes = (value: string) => value === 'yes' || value === 'ある' || value === 'Yes';
const textValue = (answers: Answers, key: string) => answers[key] ?? '';
const choiceIsSelected = (currentValue: string, value: string) =>
    currentValue === value || (value === 'once' && currentValue === '今回だけ') || (value === 'recurring' && currentValue === 'ほかにもある') || (value === 'unknown' && currentValue === '分からない') || (value === 'no' && currentValue === '特にない') || (value === 'skip' && currentValue === '回答しない');

function ChoiceButton({ label, selected, onSelect, selectedLabel }: { label: string; selected: boolean; onSelect: () => void; selectedLabel: string }) {
    return <button type="button" className={`chip${selected ? ' selected' : ''}`} aria-pressed={selected} onClick={onSelect} style={{ minHeight: 42, border: selected ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.16)', background: selected ? 'rgba(204, 74, 55, 0.2)' : 'transparent', color: selected ? 'var(--text-bright)' : undefined, fontWeight: selected ? 700 : 400, boxShadow: selected ? 'inset 0 0 0 1px rgba(255,255,255,0.16)' : 'none' }}>
        {selected && <span aria-hidden="true">✓ </span>}<span>{label}</span>{selected && <span style={{ display: 'block', fontSize: 10, marginTop: 2, opacity: 0.82 }}>{selectedLabel}</span>}
    </button>;
}

export default function Phase1Prime() {
    const { state, goToPhase, setAnswers: saveAnswersToContext, setHandle, backOverrideRef } = useApp();
    const isEnglish = state.locale === 'en';
    const steps = isEnglish ? EN_STEPS : JA_STEPS;
    const recurrenceOptions = isEnglish ? EN_RECURRENCE : JA_RECURRENCE;
    const explanationOptions = isEnglish ? EN_EXPLANATION : JA_EXPLANATION;
    const displayChoice = (value: string, options: readonly (readonly [string, string])[]) => options.find(([id]) => id === value)?.[1] ?? value;
    const copy = useMemo(() => isEnglish ? {
        selected: 'Selected', notAnswered: 'Not answered', location: 'Where were you?', locationPlaceholder: 'A place or setting', activity: 'What were you doing?', activityPlaceholder: 'What was happening at the time', recurrence: 'Has something like this happened at another time?', duration: 'How long did one occurrence last?', durationPlaceholder: 'For example, a moment, all night, or I am not sure', change: 'Did anything change during it or afterwards? (optional)', explanationPrompt: 'What is your explanation?', skip: 'Skip for now', next: 'Next', create: 'Find a yokai', experiencePlaceholder: 'Write what happened, in the words that feel right to you.', salientPlaceholder: 'Describe it in your own words.',
    } : {
        selected: '選択中', notAnswered: '回答なし', location: 'どこでのことでしたか？', locationPlaceholder: '場所や、その場の様子', activity: 'そのとき、何をしていましたか？', activityPlaceholder: 'していたことがあれば', recurrence: '同じような経験は、ほかにもありますか？', duration: '一回の経験は、どのくらい続きましたか？', durationPlaceholder: '今も続いている、分からない、でも構いません', change: '途中や、その後に変わったことがあれば教えてください（任意）', explanationPrompt: 'どのように考えていますか？', skip: 'このまま進む', next: '次へ', create: '妖怪を探す', experiencePlaceholder: 'たとえば、気になったことや、説明しにくかった感覚をそのまま書いてください', salientPlaceholder: '気になったことを、自分の言葉で',
    }, [isEnglish]);
    const [currentStep, setCurrentStep] = useState(0);
    const [answers, setAnswers] = useState<Answers>(() => state.answers);
    const [visible, setVisible] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const hasExplanation = valueIsYes(textValue(answers, 'hasExplanation'));
    const updateAnswer = useCallback((key: string, value: string) => setAnswers(previous => key === 'hasExplanation' && !valueIsYes(value) ? { ...previous, hasExplanation: value, explanation: '' } : { ...previous, [key]: value }), []);
    const goBackToStep = useCallback((targetStep: number) => { if (isTransitioning || targetStep < 0 || targetStep >= currentStep) return; setVisible(false); setIsTransitioning(true); window.setTimeout(() => { setCurrentStep(targetStep); setIsTransitioning(false); }, 220); }, [currentStep, isTransitioning]);
    const goBackStep = useCallback(() => { if (currentStep > 0) goBackToStep(currentStep - 1); }, [currentStep, goBackToStep]);
    useEffect(() => { backOverrideRef.current = currentStep > 0 ? () => { goBackStep(); return true; } : null; return () => { backOverrideRef.current = null; }; }, [backOverrideRef, currentStep, goBackStep]);
    useEffect(() => { const timer = window.setTimeout(() => setVisible(true), 140); return () => clearTimeout(timer); }, [currentStep]);
    useEffect(() => { scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }, [currentStep]);
    const finish = useCallback(() => { const experience = textValue(answers, 'experience').trim(); if (!experience) return; saveAnswersToContext({ ...answers, experience }); setHandle({ id: 'free', text: experience, shortText: experience.slice(0, 24) }); goToPhase(2); }, [answers, goToPhase, saveAnswersToContext, setHandle]);
    const advance = useCallback(() => { if (isTransitioning || (steps[currentStep].id === 'experience' && !textValue(answers, 'experience').trim())) return; setVisible(false); setIsTransitioning(true); window.setTimeout(() => { if (currentStep === steps.length - 1) finish(); else { setCurrentStep(index => index + 1); setIsTransitioning(false); } }, 220); }, [answers, currentStep, finish, isTransitioning, steps]);
    const step = steps[currentStep];
    const canAdvance = step.optional || Boolean(textValue(answers, 'experience').trim());
    const history = steps.slice(0, currentStep).map((previousStep, index) => {
        const summary = previousStep.id === 'context' ? [textValue(answers, 'location'), textValue(answers, 'activity')].filter(Boolean).join(' / ') : previousStep.id === 'duration' ? [displayChoice(textValue(answers, 'recurrence'), recurrenceOptions), textValue(answers, 'duration')].filter(Boolean).join(' / ') : previousStep.id === 'explanation' ? hasExplanation ? textValue(answers, 'explanation') || displayChoice(textValue(answers, 'hasExplanation'), explanationOptions) : displayChoice(textValue(answers, 'hasExplanation'), explanationOptions) : textValue(answers, previousStep.id);
        return { index, question: previousStep.question, answer: summary || copy.notAnswered };
    });

    return <div ref={scrollRef} className="phase-scrollable" style={{ display: 'flex', flexDirection: 'column' }}>
        {history.length > 0 && <div style={{ marginBottom: 24 }}>{history.map(item => <button key={item.index} type="button" onClick={() => goBackToStep(item.index)} style={{ display: 'block', width: '100%', padding: '8px 0', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.42 }}><p style={{ fontSize: 11, color: 'var(--text-ghost)', marginBottom: 2, letterSpacing: '0.05em' }}>{item.question}</p><p style={{ fontSize: 14, color: 'var(--text-dim)', fontFamily: 'var(--font-main)' }}>{item.answer}</p></button>)}</div>}
        <div className="question-block" style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(8px)', transition: 'all 0.28s ease' }}>
            <p style={{ fontSize: 10, color: 'var(--text-ghost)', letterSpacing: '0.15em', marginBottom: 8 }}>{currentStep + 1} / {steps.length}</p><p className="question-text">{step.question}</p>{step.subtext && <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '-6px 0 14px', fontFamily: 'var(--font-main)', lineHeight: 1.8 }}>{step.subtext}</p>}
            {step.id === 'experience' && <textarea className="text-input" value={textValue(answers, 'experience')} onChange={event => updateAnswer('experience', event.target.value)} placeholder={copy.experiencePlaceholder} rows={5} autoFocus style={{ width: '100%', minHeight: 116, resize: 'vertical' }} />}
            {step.id === 'context' && <div style={{ display: 'grid', gap: 14 }}><label style={{ display: 'grid', gap: 6 }}><span className="label">{copy.location}</span><input className="text-input" value={textValue(answers, 'location')} onChange={event => updateAnswer('location', event.target.value)} placeholder={copy.locationPlaceholder} /></label><label style={{ display: 'grid', gap: 6 }}><span className="label">{copy.activity}</span><input className="text-input" value={textValue(answers, 'activity')} onChange={event => updateAnswer('activity', event.target.value)} placeholder={copy.activityPlaceholder} /></label></div>}
            {step.id === 'salientFeature' && <textarea className="text-input" value={textValue(answers, 'salientFeature')} onChange={event => updateAnswer('salientFeature', event.target.value)} placeholder={copy.salientPlaceholder} rows={4} style={{ width: '100%', minHeight: 96, resize: 'vertical' }} />}
            {step.id === 'duration' && <div style={{ display: 'grid', gap: 18 }}><div><p className="label" style={{ marginBottom: 8 }}>{copy.recurrence}</p><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{recurrenceOptions.map(([value, label]) => <ChoiceButton key={value} label={label} selected={choiceIsSelected(textValue(answers, 'recurrence'), value)} onSelect={() => updateAnswer('recurrence', value)} selectedLabel={copy.selected} />)}</div></div><label style={{ display: 'grid', gap: 6 }}><span className="label">{copy.duration}</span><input className="text-input" value={textValue(answers, 'duration')} onChange={event => updateAnswer('duration', event.target.value)} placeholder={copy.durationPlaceholder} /></label><label style={{ display: 'grid', gap: 6 }}><span className="label">{copy.change}</span><textarea className="text-input" value={textValue(answers, 'change')} onChange={event => updateAnswer('change', event.target.value)} rows={3} style={{ width: '100%', minHeight: 76, resize: 'vertical' }} /></label></div>}
            {step.id === 'explanation' && <div style={{ display: 'grid', gap: 14 }}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{explanationOptions.map(([value, label]) => <ChoiceButton key={value} label={label} selected={choiceIsSelected(textValue(answers, 'hasExplanation'), value)} onSelect={() => updateAnswer('hasExplanation', value)} selectedLabel={copy.selected} />)}</div>{hasExplanation && <label style={{ display: 'grid', gap: 6 }}><span className="label">{copy.explanationPrompt}</span><textarea className="text-input" value={textValue(answers, 'explanation')} onChange={event => updateAnswer('explanation', event.target.value)} rows={4} autoFocus style={{ width: '100%', minHeight: 96, resize: 'vertical' }} /></label>}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>{step.optional && <button type="button" className="button" disabled={isTransitioning} onClick={advance}>{copy.skip}</button>}<button type="button" className="button button-primary" disabled={!canAdvance || isTransitioning} onClick={advance} style={{ opacity: canAdvance && !isTransitioning ? 1 : 0.45 }}>{currentStep === steps.length - 1 ? copy.create : copy.next}</button></div>
        </div><div style={{ height: 60 }} /><ProgressDots current={2} />
    </div>;
}
