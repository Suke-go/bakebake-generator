'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp, type AppraisalOption } from '@/lib/context';
import { generateEventAppraisal, searchByEventAndAppraisal } from '@/lib/api-client';
import { buildSearchQuery } from '@/lib/prompt-builder';
import { logResearchEvent } from '@/lib/research-log';
import ProgressDots from './ProgressDots';
import s from './Interpretation.module.css';

const OWN_ID = 'own';

const COPY = {
    ja: {
        reading: 'あなたの体験を読んでいます...',
        kicker: '解釈',
        title: 'あなたの体験を、ふたつに分けて読みました',
        lede: '「起きたこと」と「どう受け止めたか」。伝承はこの両方で探すので、出来事が似た記録も、受け止め方が似た記録も見つかります。',
        eventTitle: '起きたこと',
        eventNote: '原因には触れず、出来事だけを書き出しています。',
        takeTitle: 'どう受け止めたか',
        takeNote: 'そのときの感じ方にいちばん近いものを、ひとつ選んでください。しっくりこなければ、自分の言葉で書けます。',
        grounded: 'あなたの言葉から',
        possible: 'ひとつの読み方',
        own: '自分の言葉で',
        ownPrompt: 'どれも違うときは、ここに書いてください',
        ownPlaceholder: '例: 誰かに試されている気がした',
        sourceGrounded: 'あなたの体験のこの部分から読みました',
        sourcePossible: 'この部分から、一歩踏み込んで読みました',
        legendGrounded: 'あなたが書いたことの言い換えです。',
        legendPossible: 'あなたの言葉より一歩踏み込んだ読みです。合うときだけ選んでください。',
        search: 'この解釈で伝承を探す',
        chooseFirst: '解釈をひとつ選んでください',
        skip: '選ばずに進む',
        searching: 'ふたつの道で伝承を探しています',
        laneEvent: '起きたこと',
        laneTake: 'あなたの解釈',
        archive: '日文研 怪異・妖怪伝承データベース',
        slowSearch: '最初の検索は準備に1分ほどかかることがあります。このままお待ちください。',
        failed: '解釈の候補を作れませんでした。通信が切れたか、混み合っている可能性があります。',
        retry: 'もう一度試す',
    },
    en: {
        reading: 'Reading your account...',
        kicker: 'Interpretation',
        title: 'We read your account in two parts',
        lede: 'What happened, and how you took it. The archive is searched with both, so records with a similar event and records with a similar feeling can both turn up.',
        eventTitle: 'What happened',
        eventNote: 'Only the event, with no cause attached.',
        takeTitle: 'How you took it',
        takeNote: 'Choose the one closest to how it felt at the time. If none fits, write your own.',
        grounded: 'In your words',
        possible: 'A possible reading',
        own: 'Your own words',
        ownPrompt: 'If none of these fits, write it here',
        ownPlaceholder: 'For example: It felt like someone was testing me',
        sourceGrounded: 'Read from this part of your account',
        sourcePossible: 'This part of your account, read one step further',
        legendGrounded: 'Restates something you wrote.',
        legendPossible: 'Goes a step beyond what you wrote. Choose it only if it fits.',
        search: 'Search the archive with this interpretation',
        chooseFirst: 'Choose an interpretation first',
        skip: 'Skip this step',
        searching: 'Searching the archive two ways',
        laneEvent: 'What happened',
        laneTake: 'Your interpretation',
        archive: 'Nichibunken Kaii-Yokai Folklore Database',
        slowSearch: 'The first search can take about a minute to start. Please keep this page open.',
        failed: 'We could not prepare the interpretations. The connection may have dropped or the service may be busy.',
        retry: 'Try again',
    },
};

/** Splits the account around the quoted span so the span can be marked. */
function locateSpan(texts: string[], span: string): { before: string; match: string; after: string } | null {
    if (!span) return null;
    for (const text of texts) {
        const at = text.indexOf(span);
        if (at < 0) continue;
        // Keep the excerpt short on a phone: about 60 characters either side.
        const start = Math.max(0, at - 60);
        const end = Math.min(text.length, at + span.length + 60);
        return {
            before: (start > 0 ? '…' : '') + text.slice(start, at),
            match: span,
            after: text.slice(at + span.length, end) + (end < text.length ? '…' : ''),
        };
    }
    return null;
}

/**
 * The Interpretation step. The account is read into an event statement and
 * candidate interpretations; the participant picks the one closest to their
 * own sense-making (or writes their own), then folklore is retrieved via the
 * combined event+interpretation pipeline. If generation fails or returns no
 * candidates, the participant sees why and can retry or continue to Phase 2,
 * which falls back to its own direct search. Only a paused paid API skips
 * silently, since retrying cannot help.
 */
export default function Phase1Appraisal() {
    const { state, goToPhase, completeEventAppraisalSearch, backOverrideRef } = useApp();
    const isEnglish = state.locale === 'en';
    const copy = isEnglish ? COPY.en : COPY.ja;
    const [status, setStatus] = useState<'reading' | 'choosing' | 'searching' | 'skipped' | 'failed'>('reading');
    const [attempt, setAttempt] = useState(0);
    const [slow, setSlow] = useState(false);
    const [eventText, setEventText] = useState('');
    const [appraisals, setAppraisals] = useState<AppraisalOption[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [ownText, setOwnText] = useState('');
    const [searchingText, setSearchingText] = useState('');
    const mountedRef = useRef(false);
    const abortRef = useRef<AbortController | null>(null);

    const proceedWithoutAppraisal = useCallback(() => {
        goToPhase(2);
    }, [goToPhase]);

    useEffect(() => {
        mountedRef.current = true;
        backOverrideRef.current = null;
        // Start the reranker's cold start now, while the participant reads the choices.
        void fetch('/api/rerank-warm', { method: 'POST' }).catch(() => {});
        if (!state.selectedHandle) {
            proceedWithoutAppraisal();
            return;
        }
        setStatus('reading');
        const controller = new AbortController();
        abortRef.current = controller;
        (async () => {
            try {
                const result = await generateEventAppraisal(
                    { id: state.selectedHandle!.id, text: state.selectedHandle!.text },
                    state.answers,
                    controller.signal,
                    state.locale,
                );
                if (!mountedRef.current || controller.signal.aborted) return;
                if (!result.event.text || result.appraisals.length === 0) {
                    if (result.usedModel === 'paid-api-paused') {
                        setStatus('skipped');
                        proceedWithoutAppraisal();
                    } else {
                        console.warn('Phase1Appraisal: no candidates returned:', result.usedModel);
                        setStatus('failed');
                    }
                    return;
                }
                setEventText(result.event.text);
                // Words the participant wrote come before readings that go beyond them.
                setAppraisals([...result.appraisals].sort((a, b) => Number(b.basis === 'grounded') - Number(a.basis === 'grounded')));
                setSelectedId(null);
                setStatus('choosing');
            } catch (error) {
                if (!mountedRef.current || controller.signal.aborted) return;
                console.warn('Phase1Appraisal: generation failed:', error);
                setStatus('failed');
            }
        })();
        return () => {
            mountedRef.current = false;
            controller.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt]);

    const accountTexts = useMemo(() => {
        if (!state.selectedHandle) return [];
        const experience = state.answers.experience?.trim() ?? '';
        const full = buildSearchQuery({ id: state.selectedHandle.id, text: state.selectedHandle.text }, state.answers);
        return experience ? [experience, full] : [full];
    }, [state.selectedHandle, state.answers]);

    const selected: AppraisalOption | null = useMemo(() => {
        if (selectedId === OWN_ID) {
            const text = ownText.trim();
            return text ? { id: OWN_ID, text, sourceSpan: '', basis: 'own' } : null;
        }
        return appraisals.find((a) => a.id === selectedId) ?? null;
    }, [selectedId, ownText, appraisals]);

    const excerpt = useMemo(
        () => (selected && selected.basis !== 'own' ? locateSpan(accountTexts, selected.sourceSpan) : null),
        [selected, accountTexts],
    );

    const handleSearch = useCallback(async () => {
        const appraisal = selected;
        if (!state.selectedHandle || status !== 'choosing' || !appraisal) return;
        setSearchingText(appraisal.text);
        setStatus('searching');
        setSlow(false);
        const slowTimer = setTimeout(() => setSlow(true), 12_000);
        const controller = new AbortController();
        abortRef.current = controller;
        void logResearchEvent(state.ticketId, {
            eventType: 'appraisal_selected',
            payload: { locale: state.locale, eventText, appraisal },
        });
        try {
            const searchResult = await searchByEventAndAppraisal(
                { id: state.selectedHandle.id, text: state.selectedHandle.text },
                state.answers,
                eventText,
                appraisal.text,
                controller.signal,
                5,
            );
            if (!mountedRef.current) return;
            const folklore = searchResult.ranked.map((record) => ({
                id: record.id,
                kaiiName: record.name,
                content: record.summary,
                location: record.prefecture,
                similarity: 1 / record.rank,
                route: record.route,
                source: record.route === 'both' ? '日文研（event・appraisal両経路）' : record.route === 'event' ? '日文研（event経路）' : '日文研（appraisal経路）',
            }));
            void logResearchEvent(state.ticketId, {
                eventType: 'event_appraisal_search_completed',
                payload: { corpusVersion: searchResult.corpusVersion, branchSizes: searchResult.branchSizes, results: searchResult.ranked },
            });
            const candidates = appraisal.basis === 'own' ? [...appraisals, appraisal] : appraisals;
            completeEventAppraisalSearch(eventText, candidates, appraisal.id, folklore);
            goToPhase(2);
        } catch (error) {
            if (!mountedRef.current) return;
            console.warn('Phase1Appraisal: search failed, falling back to direct search:', error);
            proceedWithoutAppraisal();
        } finally {
            clearTimeout(slowTimer);
        }
    }, [selected, state.selectedHandle, state.answers, state.locale, state.ticketId, status, eventText, appraisals, completeEventAppraisalSearch, goToPhase, proceedWithoutAppraisal]);

    if (status === 'reading' || status === 'skipped') {
        return (
            <div className="phase" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                <p className="voice" style={{ animation: 'breathe 3s ease-in-out infinite' }}>{copy.reading}</p>
            </div>
        );
    }

    if (status === 'failed') {
        return (
            <div className="phase" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                <p className="voice" style={{ marginBottom: 24 }}>{copy.failed}</p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button type="button" className="button button-primary" onClick={() => setAttempt((n) => n + 1)}>{copy.retry}</button>
                    <button type="button" className="button" onClick={proceedWithoutAppraisal}>{copy.skip}</button>
                </div>
            </div>
        );
    }

    if (status === 'searching') {
        return (
            <div className="phase" style={{ justifyContent: 'center' }}>
                <div className={s.searchWrap} role="status" aria-live="polite">
                    <p className={s.searchTitle}>{copy.searching}</p>
                    <div className={s.lanes}>
                        <div className={s.lane}>
                            <p className={s.laneLabel}>{copy.laneEvent}</p>
                            <p className={s.laneText}>{eventText}</p>
                        </div>
                        <div className={s.lane}>
                            <p className={s.laneLabel}>{copy.laneTake}</p>
                            <p className={s.laneText}>{searchingText}</p>
                        </div>
                    </div>
                    <div className={s.merge} aria-hidden="true" />
                    <p className={s.archive}>{copy.archive}</p>
                    {slow && <p className={s.slow}>{copy.slowSearch}</p>}
                </div>
            </div>
        );
    }

    const quoteClass = `${s.quote} ${isEnglish ? '' : s.quoteJa}`;
    const tagFor = (basis: AppraisalOption['basis']) => basis === 'grounded'
        ? <span className={`${s.tag} ${s.tagGrounded}`}>{copy.grounded}</span>
        : basis === 'own'
            ? <span className={`${s.tag} ${s.tagOwn}`}>{copy.own}</span>
            : <span className={`${s.tag} ${s.tagPossible}`}>{copy.possible}</span>;
    const hasPossible = appraisals.some((a) => a.basis === 'interpretation');

    return (
        <div className="phase-scrollable">
            <div className={`${s.wrap} float-up`}>
                <p className={s.kicker}>{copy.kicker}</p>
                <h2 className={s.title}>{copy.title}</h2>
                <p className={s.lede}>{copy.lede}</p>

                <section className={s.layer} aria-labelledby="interp-event">
                    <div className={s.layerHead}>
                        <span className={s.layerNum}>1</span>
                        <span id="interp-event" className={s.layerTitle}>{copy.eventTitle}</span>
                    </div>
                    <p className={s.eventText}>{eventText}</p>
                    <p className={s.layerNote} style={{ margin: 0 }}>{copy.eventNote}</p>
                </section>

                <div className={s.join} aria-hidden="true">+</div>

                <section className={s.layer} aria-labelledby="interp-take">
                    <div className={s.layerHead}>
                        <span className={s.layerNum}>2</span>
                        <span id="interp-take" className={s.layerTitle}>{copy.takeTitle}</span>
                    </div>
                    <p className={s.layerNote}>{copy.takeNote}</p>

                    <div className={s.options} role="radiogroup" aria-labelledby="interp-take">
                        {appraisals.map((appraisal) => {
                            const isSelected = selectedId === appraisal.id;
                            return (
                                <button
                                    key={appraisal.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={isSelected}
                                    className={`${s.option} ${appraisal.basis === 'interpretation' ? s.possible : ''} ${isSelected ? s.selected : ''}`}
                                    onClick={() => setSelectedId(appraisal.id)}
                                >
                                    <span className={s.radio} aria-hidden="true" />
                                    <span className={s.optionBody}>
                                        <span className={s.optionText}>{appraisal.text}</span>
                                        <span className={s.basisRow}>
                                            {tagFor(appraisal.basis)}
                                            {!(isSelected && excerpt) && <span className={quoteClass}>{appraisal.sourceSpan}</span>}
                                        </span>
                                        {isSelected && excerpt && (
                                            <span className={s.source} aria-live="polite">
                                                <span className={s.sourceLabel}>{appraisal.basis === 'grounded' ? copy.sourceGrounded : copy.sourcePossible}</span>
                                                <span className={s.sourceText}>{excerpt.before}<mark>{excerpt.match}</mark>{excerpt.after}</span>
                                            </span>
                                        )}
                                    </span>
                                </button>
                            );
                        })}

                        <div
                            role="radio"
                            aria-checked={selectedId === OWN_ID}
                            tabIndex={-1}
                            className={`${s.option} ${selectedId === OWN_ID ? s.selected : ''}`}
                            onClick={() => setSelectedId(OWN_ID)}
                        >
                            <span className={s.radio} aria-hidden="true" />
                            <span className={s.optionBody}>
                                <span className={s.basisRow}>
                                    {tagFor('own')}
                                    <span>{copy.ownPrompt}</span>
                                </span>
                                <textarea
                                    className={s.ownInput}
                                    value={ownText}
                                    maxLength={300}
                                    placeholder={copy.ownPlaceholder}
                                    aria-label={copy.ownPrompt}
                                    onFocus={() => setSelectedId(OWN_ID)}
                                    onChange={(e) => { setOwnText(e.target.value); setSelectedId(OWN_ID); }}
                                />
                            </span>
                        </div>
                    </div>

                    <ul className={s.legend}>
                        <li>{tagFor('grounded')}<span>{copy.legendGrounded}</span></li>
                        {hasPossible && <li>{tagFor('interpretation')}<span>{copy.legendPossible}</span></li>}
                    </ul>
                </section>

                <div className={s.actions}>
                    <button type="button" className={s.primary} disabled={!selected} onClick={handleSearch}>
                        {selected ? `${copy.search} →` : copy.chooseFirst}
                    </button>
                    <button type="button" className={s.skip} onClick={proceedWithoutAppraisal}>{copy.skip}</button>
                </div>
            </div>
            <div style={{ height: 60 }} />
            <ProgressDots current={2} />
        </div>
    );
}
