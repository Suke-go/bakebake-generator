'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArtStyle, useApp } from '@/lib/context';
import { supabase } from '@/lib/supabase';
import ProgressDots from './ProgressDots';
import ExperienceComparison from './ExperienceComparison';

const ART_STYLES: { id: ArtStyle; name: string; desc: string }[] = [
    { id: 'sumi', name: '水墨画', desc: '余白とにじみのある、静かな墨の表現' },
    { id: 'emaki', name: '絵巻', desc: '物語の一場面のような、連なる時間の表現' },
    { id: 'ukiyoe', name: '浮世絵', desc: '輪郭と色を生かした、版画のような表現' },
    { id: 'manga', name: '漫画', desc: '線と間で気配を描く、現代的な表現' },
    { id: 'dennou', name: '電脳', desc: 'ノイズと光を使った、現代の怪異の表現' },
];

export default function Phase3() {
    const { state, goToPhase, setVisualInput, setArtStyle, reviseSelectedConcept, undoConceptRevision, requestImageGeneration, backOverrideRef } = useApp();
    const [step, setStep] = useState<'review' | 'style' | 'visual'>('review');
    const [name, setName] = useState(state.selectedConcept?.name ?? '');
    const [description, setDescription] = useState(state.selectedConcept?.description ?? '');
    const [kept, setKept] = useState(state.imageKept);
    const [changed, setChanged] = useState(state.imageChanged);
    const [visual, setVisual] = useState(state.visualInput);

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
        }
    }, [changed, description, kept, name, reviseSelectedConcept, state.conceptRevisions, state.selectedConcept]);

    const chooseStyle = (style: ArtStyle) => {
        saveReview();
        setArtStyle(style);
        setStep('visual');
    };

    const generate = () => {
        saveReview();
        setVisualInput([visual.trim(), kept.trim() ? `残す: ${kept.trim()}` : '', changed.trim() ? `変える: ${changed.trim()}` : ''].filter(Boolean).join('\n'));
        if (requestImageGeneration()) goToPhase(3.5);
    };

    const undoLatestRevision = () => {
        const previous = state.conceptRevisions.at(-1);
        if (!previous) return;
        undoConceptRevision();
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
                <p className="voice" style={{ marginBottom: 10 }}>この妖怪を、あなたの経験に近づけます。</p>
                <p style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.8, marginBottom: 22 }}>
                    名前や性質は、ここで自分の言葉に直せます。分からないところは、そのままで大丈夫です。
                </p>
                <label className="label">名前</label>
                <input className="text-input" value={name} onChange={e => setName(e.target.value)} />
                <label className="label" style={{ marginTop: 18 }}>性質と短い物語</label>
                <textarea className="text-input" style={{ minHeight: 120, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} />
                {state.conceptRevisions.length > 0 && (
                    <button className="button" style={{ alignSelf: 'flex-start', marginTop: 10 }} onClick={undoLatestRevision}>直前の編集を取り消す</button>
                )}
                <label className="label" style={{ marginTop: 18 }}>ここは残したいこと（任意）</label>
                <textarea className="text-input" style={{ minHeight: 72, resize: 'vertical' }} value={kept} onChange={e => setKept(e.target.value)} placeholder="例：動かずにずっといる感じ" />
                <label className="label" style={{ marginTop: 18 }}>違うところ・変えたいこと（任意）</label>
                <textarea className="text-input" style={{ minHeight: 72, resize: 'vertical' }} value={changed} onChange={e => setChanged(e.target.value)} placeholder="例：追いかけてはこない" />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                    <button className="button button-primary" onClick={() => { saveReview(); setStep('style'); }}>姿を選ぶ</button>
                </div>
                <ProgressDots current={4} />
            </div>
        );
    }

    if (step === 'style') {
        return (
            <div className="phase-scrollable phase-enter">
                <p className="voice" style={{ marginBottom: 26 }}>どんな姿で現れてほしいですか？</p>
                {ART_STYLES.map(style => (
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
            <p className="question-text">姿について、付け加えたいことはありますか？</p>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.8, marginBottom: 14 }}>
                空欄でも生成できます。画像は最初の一枚と、作り直し二回までです。
            </p>
            <textarea className="text-input" style={{ minHeight: 100, resize: 'vertical' }} value={visual} onChange={e => setVisual(e.target.value)} placeholder="例：霧のように輪郭をはっきりさせない" />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                {remaining > 0 ? (
                    <button className="button button-primary" onClick={generate}>この内容で画像を生成する</button>
                ) : state.generatedImageUrl ? (
                    <button className="button button-primary" onClick={() => void returnToCompletedWork()}>完成した妖怪に戻る</button>
                ) : (
                    <button className="button" onClick={() => goToPhase(2)}>概念を選び直す</button>
                )}
            </div>
            <ProgressDots current={4} />
        </div>
    );
}
