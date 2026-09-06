'use client';

import { useApp } from '@/lib/context';
import { logResearchEvent } from '@/lib/research-log';

export default function ExperienceComparison() {
    const { state } = useApp();
    const isEnglish = state.locale === 'en';
    const experience = state.answers.experience?.trim();
    const folklore = state.folkloreResults ?? [];
    const labels = isEnglish ? {
        aria: 'Compare your experience with related folklore', experience: 'What you wrote', noExperience: 'No experience was entered.', supplements: 'See your additional answers', yokai: 'Your yokai', undecided: 'Not decided yet', folklore: `Read related folklore (${folklore.length})`, reference: 'These are references for thinking about your experience, not its one correct explanation.', translation: 'English summary (generated from the Japanese original)', original: 'Japanese original', source: 'Source', archive: 'Archive information', fallback: 'Placeholder data; no archive search was run',
        supplement: [['Location', state.answers.location], ['What you were doing', state.answers.activity], ['What stood out', state.answers.salientFeature], ['Similar experiences', state.answers.recurrence], ['Duration of one occurrence', state.answers.duration], ['Changes', state.answers.change], ['Your explanation', state.answers.explanation]],
    } : {
        aria: '経験と参考伝承の見比べ', experience: 'あなたが書いた経験', noExperience: '入力された経験はありません。', supplements: '補足回答を見る', yokai: '作った妖怪', undecided: 'まだ決まっていません', folklore: `関連する伝承を読む（${folklore.length}件）`, reference: 'これはあなたの経験の正解ではなく、考えるための参考です。', translation: '', original: '', source: '出典', archive: 'アーカイブ情報', fallback: '検索未実施の仮データ',
        supplement: [['場所', state.answers.location], ['そのときしていたこと', state.answers.activity], ['特に気になったこと', state.answers.salientFeature], ['同じような経験', state.answers.recurrence], ['一回の続き方', state.answers.duration], ['変化', state.answers.change], ['本人の説明', state.answers.explanation]],
    };
    const displayValue = (value: string) => {
        const values: Record<string, string> = isEnglish
            ? { once: 'This time only', recurring: 'It has happened before', unknown: 'I’m not sure', yes: 'Yes', no: 'Not really', skip: 'Prefer not to say' }
            : { once: '今回だけ', recurring: 'ほかにもある', unknown: '分からない', yes: 'ある', no: '特にない', skip: '回答しない' };
        return values[value] ?? value;
    };
    const supplements = labels.supplement.filter(([, value]) => value?.trim()).map(([label, value]) => [label, displayValue(value)]) as Array<[string, string]>;

    return <section aria-label={labels.aria} style={{ display: 'grid', gap: 10, margin: '18px 0', padding: 14, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.025)' }}>
        <div><p className="label" style={{ marginBottom: 5 }}>{labels.experience}</p><p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.7, color: 'var(--text-dim)', fontFamily: 'var(--font-main)' }}>{experience || labels.noExperience}</p></div>
        {supplements.length > 0 && <details><summary style={{ cursor: 'pointer', color: 'var(--text-dim)' }}>{labels.supplements}</summary><dl style={{ margin: '8px 0 0', display: 'grid', gap: 5, fontSize: 13 }}>{supplements.map(([label, value]) => <div key={label} style={{ display: 'grid', gridTemplateColumns: '9em 1fr', gap: 8 }}><dt style={{ color: 'var(--text-ghost)' }}>{label}</dt><dd style={{ margin: 0, color: 'var(--text-dim)', whiteSpace: 'pre-wrap' }}>{value}</dd></div>)}</dl></details>}
        <div><p className="label" style={{ marginBottom: 3 }}>{labels.yokai}</p><p style={{ margin: 0, color: 'var(--text-dim)', lineHeight: 1.6 }}>{state.selectedConcept?.name || labels.undecided}{state.selectedConcept?.description ? ` — ${state.selectedConcept.description}` : ''}</p></div>
        {folklore.length > 0 && <details onToggle={(event) => { if (event.currentTarget.open) void logResearchEvent(state.ticketId, { eventType: 'folklore_references_opened', payload: { locale: state.locale, folkloreIds: folklore.map(item => item.id) } }); }}><summary style={{ cursor: 'pointer', color: 'var(--text-dim)' }}>{labels.folklore}</summary><p style={{ fontSize: 12, color: 'var(--text-ghost)', lineHeight: 1.65, margin: '8px 0' }}>{labels.reference}</p><div style={{ display: 'grid', gap: 10 }}>{folklore.map(item => {
            const isFallback = item.source === 'fallback';
            return <article key={item.id} style={{ borderLeft: '2px solid rgba(255,255,255,0.2)', paddingLeft: 10 }}><p style={{ margin: 0, color: 'var(--text-bright)' }}>{item.kaiiName}</p>{isEnglish && item.englishSummary && <><p style={{ margin: '5px 0 2px', color: 'var(--text-ghost)', fontSize: 11 }}>{labels.translation}</p><p style={{ margin: '0 0 3px', color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.65 }}>{item.englishSummary}</p></>}<p lang="ja" style={{ margin: '3px 0', color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.65 }}>{item.content}</p>{isEnglish && <p style={{ margin: '2px 0', color: 'var(--text-ghost)', fontSize: 11 }}>{labels.original}</p>}<p style={{ margin: 0, color: 'var(--text-ghost)', fontSize: 11 }}>{isFallback ? labels.fallback : `${labels.source}: ${item.source || labels.archive}`}{item.location ? ` ／ ${item.location}` : ''}</p></article>;
        })}</div></details>}
    </section>;
}
