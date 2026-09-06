'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArtStyle, useApp } from '@/lib/context';
import { supabase } from '@/lib/supabase';
import ProgressDots from './ProgressDots';
import ExperienceComparison from './ExperienceComparison';
import { logResearchEvent } from '@/lib/research-log';
import { composeVisualGenerationInput } from '@/lib/visual-feedback';

const ART_STYLES: { id: ArtStyle; name: string; desc: string }[] = [
    { id: 'sumi', name: '水墨画', desc: '余白とにじみのある、静かな墨の表現' },
    { id: 'emaki', name: '絵巻', desc: '物語の一場面のような、連なる時間の表現' },
    { id: 'ukiyoe', name: '浮世絵', desc: '輪郭と色を生かした、版画のような表現' },
    { id: 'manga', name: '漫画', desc: '線と間で気配を描く、現代的な表現' },
    { id: 'dennou', name: '電脳', desc: 'ノイズと光を使った、現代の怪異の表現' },
];

export default function Phase3() {
    const { state, goToPhase, setVisualInput, setVisualNote, setImageFeedback, setArtStyle, reviseSelectedConcept, undoConceptRevision, requestImageGeneration, backOverrideRef } = useApp();
    const [step, setStep] = useState<'review' | 'style' | 'visual'>('review');
    const [name, setName] = useState(state.selectedConcept?.name ?? '');
    const [description, setDescription] = useState(state.selectedConcept?.description ?? '');
    const [kept, setKept] = useState(state.imageKept);
    const [changed, setChanged] = useState(state.imageChanged);
    const [visual, setVisual] = useState(state.visualNote ?? state.visualInput);
    const isEnglish = state.locale === 'en';
    const artStyles = isEnglish ? [
        { id: 'sumi' as const, name: 'Ink wash', desc: 'Quiet ink with space and soft bleeding edges' },
        { id: 'emaki' as const, name: 'Picture scroll', desc: 'A scene from a continuing story' },
        { id: 'ukiyoe' as const, name: 'Woodblock print', desc: 'Clear outlines and printed colour' },
        { id: 'manga' as const, name: 'Manga', desc: 'A contemporary presence drawn through line and pause' },
        { id: 'dennou' as const, name: 'Digital', desc: 'A contemporary strange presence made with noise and light' },
    ] : ART_STYLES;
    const copy = isEnglish ? {
        reviewTitle: 'Bring this yokai closer to your experience.', reviewBody: 'You can put its name and nature into your own words. It is fine to leave uncertain parts as they are.', name: 'Name', description: 'Nature and short story', undo: 'Undo the last edit', kept: 'What would you like to keep? (optional)', changed: 'What feels different or should change? (optional)', keptPlaceholder: 'For example: it stays still, always there', changedPlaceholder: 'For example: it does not chase me', chooseStyle: 'Choose an appearance', styleQuestion: 'How would you like it to appear?', visualQuestion: 'Would you like to add anything about its appearance?', visualBody: 'You can leave this blank. You can make one initial image and up to two remakes.', visualPlaceholder: 'For example: keep its outline misty', generate: 'Generate an image with this', completed: 'Return to your completed yokai', chooseAgain: 'Choose a concept again',
    } : {
        reviewTitle: 'この妖怪を、あなたの経験に近づけます。', reviewBody: '名前や性質は、ここで自分の言葉に直せます。分からないところは、そのままで大丈夫です。', name: '名前', description: '性質と短い物語', undo: '直前の編集を取り消す', kept: 'ここは残したいこと（任意）', changed: '違うところ・変えたいこと（任意）', keptPlaceholder: '例：動かずにずっといる感じ', changedPlaceholder: '例：追いかけてはこない', chooseStyle: '姿を選ぶ', styleQuestion: 'どんな姿で現れてほしいですか？', visualQuestion: '姿について、付け加えたいことはありますか？', visualBody: '空欄でも生成できます。画像は最初の一枚と、作り直し二回までです。', visualPlaceholder: '例：霧のように輪郭をはっきりさせない', generate: 'この内容で画像を生成する', completed: '完成した妖怪に戻る', chooseAgain: '概念を選び直す',
    };

    useEffect(() => {
        backOverrideRef.current = () => {
            if (step === 'visual') { setStep('style'); return true; }
            if (step === 'style') { setStep('review'); return true; }
            return false;
        };
        return () => { backOverrideRef.current = null; };
    }, [backOverrideRef, step]);

    const saveReview = useCallback(() => {
        const nextName = name.trim() || state.selectedConcept?.name || '';
        const nextDescription = description.trim() || state.selectedConcept?.description || '';
        const last = state.conceptRevisions.at(-1);
        const hasChanged = nextName !== state.selectedConcept?.name ||
            nextDescription !== state.selectedConcept?.description ||
            kept.trim() !== (last?.kept ?? '') ||
            changed.trim() !== (last?.changed ?? '');
        if (hasChanged) {
            reviseSelectedConcept({ name: nextName, description: nextDescription, kept: kept.trim(), changed: changed.trim() });
            void logResearchEvent(state.ticketId, {
                eventType: 'concept_revised',
                payload: {
                    name: nextName, description: nextDescription,
                    previousName: state.selectedConcept?.name ?? '', previousDescription: state.selectedConcept?.description ?? '',
                    kept: kept.trim(), changed: changed.trim(),
                },
            });
        }
        setImageFeedback(kept.trim(), changed.trim());
    }, [changed, description, kept, name, reviseSelectedConcept, setImageFeedback, state.conceptRevisions, state.selectedConcept, state.ticketId]);

    const chooseStyle = (style: ArtStyle) => {
        saveReview();
        setArtStyle(style);
        setStep('visual');
    };

    const generate = () => {
        saveReview();
        const freeVisual = visual.trim();
        setVisualNote(freeVisual);
        setVisualInput(composeVisualGenerationInput(freeVisual, kept, changed));
        if (requestImageGeneration()) goToPhase(3.5);
    };

    const undoLatestRevision = () => {
        const previous = state.conceptRevisions.at(-1);
        if (!previous) return;
        undoConceptRevision();
        void logResearchEvent(state.ticketId, {
            eventType: 'concept_revision_undone',
            payload: { restoredName: previous.previousName, restoredDescription: previous.previousDescription },
        });
        setName(previous.previousName);
        setDescription(previous.previousDescription);
        setKept(previous.kept);
        setChanged(previous.changed);
    };

    const returnToCompletedWork = async () => {
        const finalName = name.trim() || state.selectedConcept?.name || '';
        saveReview();
        if (state.ticketId) {
            const { error } = await supabase
                .from('surveys')
                .update({ yokai_name: finalName, yokai_desc: state.narrative })
                .eq('id', state.ticketId);
            if (error) console.warn('Could not synchronize final yokai text:', error.message);
        }
        goToPhase(3.5);
    };

    if (!state.selectedConcept) return null;

    if (step === 'review') {
        return (
            <div className="phase-scrollable phase-enter">
                <ExperienceComparison />
                <p className="voice" style={{ marginBottom: 10 }}>{copy.reviewTitle}</p>
                <p style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.8, marginBottom: 22 }}>
                    {copy.reviewBody}
                </p>
                <label className="label">{copy.name}</label>
                <input className="text-input" value={name} onChange={e => setName(e.target.value)} />
                <label className="label" style={{ marginTop: 18 }}>{copy.description}</label>
                <textarea className="text-input" style={{ minHeight: 120, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} />
                {state.conceptRevisions.length > 0 && (
                    <button className="button" style={{ alignSelf: 'flex-start', marginTop: 10 }} onClick={undoLatestRevision}>{copy.undo}</button>
                )}
                <label className="label" style={{ marginTop: 18 }}>{copy.kept}</label>
                <textarea className="text-input" style={{ minHeight: 72, resize: 'vertical' }} value={kept} onChange={e => setKept(e.target.value)} placeholder={copy.keptPlaceholder} />
                <label className="label" style={{ marginTop: 18 }}>{copy.changed}</label>
                <textarea className="text-input" style={{ minHeight: 72, resize: 'vertical' }} value={changed} onChange={e => setChanged(e.target.value)} placeholder={copy.changedPlaceholder} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                    <button className="button button-primary" onClick={() => { saveReview(); setStep('style'); }}>{copy.chooseStyle}</button>
                </div>
                <ProgressDots current={4} />
            </div>
        );
    }

    if (step === 'style') {
        return (
            <div className="phase-scrollable phase-enter">
                <p className="voice" style={{ marginBottom: 26 }}>{copy.styleQuestion}</p>
                {artStyles.map(style => (
                    <button key={style.id} className={`handle-option ${state.artStyle === style.id ? 'selected' : ''}`} onClick={() => chooseStyle(style.id)}>
                        <span style={{ fontSize: 18 }}>{style.name}</span><br />
                        <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{style.desc}</span>
                    </button>
                ))}
                <ProgressDots current={4} />
            </div>
        );
    }

    const remaining = 3 - state.imageGenerationCount;
    return (
        <div className="phase-scrollable phase-enter">
            <p className="question-text">{copy.visualQuestion}</p>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.8, marginBottom: 14 }}>
                {copy.visualBody}
            </p>
            <textarea className="text-input" style={{ minHeight: 100, resize: 'vertical' }} value={visual} onChange={e => setVisual(e.target.value)} placeholder={copy.visualPlaceholder} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                {remaining > 0 ? (
                    <button className="button button-primary" onClick={generate}>{copy.generate}</button>
                ) : state.generatedImageUrl ? (
                    <button className="button button-primary" onClick={() => void returnToCompletedWork()}>{copy.completed}</button>
                ) : (
                    <button className="button" onClick={() => goToPhase(2)}>{copy.chooseAgain}</button>
                )}
            </div>
            <ProgressDots current={4} />
        </div>
    );
}
