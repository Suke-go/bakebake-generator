'use client';

import { useApp } from '@/lib/context';

export default function ExperienceComparison() {
    const { state } = useApp();
    const experience = state.answers.experience?.trim();
    const folklore = state.folkloreResults ?? [];
    const supplements = [
        ['場所', state.answers.location],
        ['そのときしていたこと', state.answers.activity],
        ['特に気になったこと', state.answers.salientFeature],
        ['同じような経験', state.answers.recurrence],
        ['一回の続き方', state.answers.duration],
        ['変化', state.answers.change],
        ['本人の説明', state.answers.explanation],
    ].filter(([, value]) => value?.trim()) as Array<[string, string]>;

    return (
        <section aria-label="経験と参考伝承の見比べ" style={{ display: 'grid', gap: 10, margin: '18px 0', padding: 14, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.025)' }}>
            <div>
                <p className="label" style={{ marginBottom: 5 }}>あなたが書いた経験</p>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.7, color: 'var(--text-dim)', fontFamily: 'var(--font-main)' }}>
                    {experience || '入力された経験はありません。'}
                </p>
            </div>

            {supplements.length > 0 && (
                <details>
                    <summary style={{ cursor: 'pointer', color: 'var(--text-dim)' }}>補足回答を見る</summary>
                    <dl style={{ margin: '8px 0 0', display: 'grid', gap: 5, fontSize: 13 }}>
                        {supplements.map(([label, value]) => (
                            <div key={label} style={{ display: 'grid', gridTemplateColumns: '9em 1fr', gap: 8 }}>
                                <dt style={{ color: 'var(--text-ghost)' }}>{label}</dt>
                                <dd style={{ margin: 0, color: 'var(--text-dim)', whiteSpace: 'pre-wrap' }}>{value}</dd>
                            </div>
                        ))}
                    </dl>
                </details>
            )}

            <div>
                <p className="label" style={{ marginBottom: 3 }}>作った妖怪</p>
                <p style={{ margin: 0, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                    {state.selectedConcept?.name || 'まだ決まっていません'}
                    {state.selectedConcept?.description ? ` — ${state.selectedConcept.description}` : ''}
                </p>
            </div>

            {folklore.length > 0 && (
                <details>
                    <summary style={{ cursor: 'pointer', color: 'var(--text-dim)' }}>関連する伝承を読む（{folklore.length}件）</summary>
                    <p style={{ fontSize: 12, color: 'var(--text-ghost)', lineHeight: 1.65, margin: '8px 0' }}>
                        これはあなたの経験の正解ではなく、考えるための参考です。
                    </p>
                    <div style={{ display: 'grid', gap: 10 }}>
                        {folklore.map(item => {
                            const isFallback = item.source === 'fallback';
                            return (
                                <article key={item.id} style={{ borderLeft: '2px solid rgba(255,255,255,0.2)', paddingLeft: 10 }}>
                                    <p style={{ margin: 0, color: 'var(--text-bright)' }}>{item.kaiiName}</p>
                                    <p style={{ margin: '3px 0', color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.65 }}>{item.content}</p>
                                    <p style={{ margin: 0, color: 'var(--text-ghost)', fontSize: 11 }}>
                                        {isFallback ? '検索未実施の仮データ' : `出典: ${item.source || 'アーカイブ情報'}`}
                                        {item.location ? ` ／ ${item.location}` : ''}
                                    </p>
                                </article>
                            );
                        })}
                    </div>
                </details>
            )}
        </section>
    );
}
