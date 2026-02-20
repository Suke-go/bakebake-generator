"use client";

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import '@/app/globals.css';

const THEME_OPTIONS = [
    { value: 'A', label: '妖怪をキャラクターとして鑑賞する展示' },
    { value: 'B', label: 'AIで妖怪っぽい画像を作る体験' },
    { value: 'C', label: '地域の語りや場所と結びつく“妖怪文化”を扱う展示' },
    { value: 'D', label: 'デジタル技術を使った観光・地域PR' },
    { value: 'E', label: '人間の不安や恐怖を可視化する展示' },
    { value: 'F', label: 'よくわからない' }
];

const SYSTEM_OPTIONS = [
    'VR体験',
    '地図へのマッピング（GIS）',
    '妖怪ジェネレーター',
    '投稿機能'
];

function ExitSurveyForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const id = searchParams.get('id');

    const [triggerSent, setTriggerSent] = useState(false);

    // Form fields
    const [systems, setSystems] = useState<string[]>([]);
    const [theme, setTheme] = useState("");
    const [impression, setImpression] = useState("");
    const [selections, setSelections] = useState<string[]>([]);
    const [actionLog, setActionLog] = useState<number | null>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [isComplete, setIsComplete] = useState(false);

    // アクセスした瞬間に印刷トリガーを引く（1回のみ）
    useEffect(() => {
        if (!id || triggerSent) return;

        const triggerPrint = async () => {
            try {
                // print_triggered がまだ false の場合のみ true に書き換える
                await supabase
                    .from('surveys')
                    .update({ print_triggered: true })
                    .eq('id', id)
                    .eq('print_triggered', false);
                setTriggerSent(true);
            } catch (e) {
                console.error("Failed to trigger print", e);
            }
        };

        triggerPrint();
    }, [id, triggerSent]);

    const handleSystemSelect = (sys: string) => {
        setSystems(prev => prev.includes(sys) ? prev.filter(s => s !== sys) : [...prev, sys]);
    };

    const handleSelectionSelect = (opt: string) => {
        setSelections(prev => {
            if (prev.includes(opt)) return prev.filter(o => o !== opt);
            if (prev.length >= 2) return prev; // 最大2つまで
            return [...prev, opt];
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!id) {
            setError("IDが存在しません。受付からやり直してください。");
            return;
        }

        if (!theme.trim()) {
            setError("「何についての作品だと思いましたか？」の回答は必須です。");
            return;
        }

        setIsSubmitting(true);

        try {
            const { error: dbError } = await supabase
                .from('surveys')
                .update({
                    post_completed: true,
                    post_completed_at: new Date().toISOString(),
                    post_theme: theme.trim(),
                    post_impression: impression.trim(),
                    post_selections: selections,
                    post_action: actionLog
                })
                .eq('id', id);

            if (dbError) throw dbError;

            setIsComplete(true);
        } catch (err: any) {
            console.error(err);
            setError("通信エラーが発生しました。");
            setIsSubmitting(false);
        }
    };

    if (!id) {
        return (
            <div style={{ color: 'red', textAlign: 'center', marginTop: '5rem' }}>
                有効な観測IDがありません。QRコードをもう一度スキャンしてください。
            </div>
        );
    }

    if (isComplete) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem'
            }}>
                <h1 className="title-text" style={{ fontSize: '2rem', marginBottom: '1rem' }}>
                    ご協力ありがとうございました
                </h1>
                <p className="body-text" style={{ textAlign: 'center', opacity: 0.8 }}>
                    印刷されたお札（レシート）は、記録としてお持ち帰りください。<br />
                    気をつけてお帰りください。
                </p>
                <button
                    onClick={() => router.push('/')}
                    className="interactive-button"
                    style={{ marginTop: '3rem', padding: '1rem 2rem' }}
                >
                    トップへ戻る
                </button>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh',
            padding: '2rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2rem'
        }}>
            <h1 className="title-text" style={{ fontSize: '2rem' }}>
                体験の総括
            </h1>

            <p className="body-text" style={{ textAlign: 'center', opacity: 0.8, maxWidth: '600px' }}>
                プリンターから記録が出力されるのを待ちながら、以下の質問にお答えください。
            </p>

            <form onSubmit={handleSubmit} style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2rem',
                width: '100%',
                maxWidth: '600px',
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '2rem',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>

                {error && <div style={{ color: '#ff6b6b', textAlign: 'center' }}>{error}</div>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    <label className="body-text">1. 本日利用・体験したシステム（複数選択）</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {SYSTEM_OPTIONS.map(sys => (
                            <label key={sys} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={systems.includes(sys)}
                                    onChange={() => handleSystemSelect(sys)}
                                    style={{ width: '1.2rem', height: '1.2rem' }}
                                />
                                {sys}
                            </label>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    <label className="body-text">2. この作品は、ズバリ「何について」の作品だと思いましたか？<span style={{ color: '#ff6b6b', fontSize: '0.8rem', marginLeft: '0.5rem' }}>必須</span></label>
                    <textarea
                        className="glass-input"
                        placeholder="自由にお書きください"
                        value={theme}
                        onChange={e => setTheme(e.target.value)}
                        rows={3}
                        style={{ padding: '1rem', width: '100%', resize: 'vertical' }}
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    <label className="body-text">3. 体験の中で、最も印象に残った場面や内容を1つ教えてください。</label>
                    <textarea
                        className="glass-input"
                        placeholder="任意入力"
                        value={impression}
                        onChange={e => setImpression(e.target.value)}
                        rows={3}
                        style={{ padding: '1rem', width: '100%', resize: 'vertical' }}
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    <label className="body-text">4. この作品の説明として、最も近いと感じるものを最大2つ選んでください</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {THEME_OPTIONS.map(opt => (
                            <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={selections.includes(opt.value)}
                                    onChange={() => handleSelectionSelect(opt.value)}
                                    disabled={!selections.includes(opt.value) && selections.length >= 2}
                                    style={{ width: '1.2rem', height: '1.2rem' }}
                                />
                                {opt.label}
                            </label>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    <label className="body-text">5. 帰った後に、地元の噂、怪談、あるいはお住まいの地域の言い伝えについて、誰かに聞いたり、調べたりしたいと思いますか？</label>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                        {[1, 2, 3, 4, 5].map(num => (
                            <button
                                key={num}
                                type="button"
                                className={`interactive-button ${actionLog === num ? 'active' : ''}`}
                                onClick={() => setActionLog(num)}
                                style={{
                                    flex: 1,
                                    padding: '0.8rem',
                                    background: actionLog === num ? 'rgba(255,255,255,0.2)' : 'transparent'
                                }}
                            >
                                {num}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', opacity: 0.6 }}>
                        <span>思わない</span>
                        <span>強く思う</span>
                    </div>
                </div>

                <button
                    type="submit"
                    className="interactive-button"
                    disabled={isSubmitting}
                    style={{ marginTop: '1rem', padding: '1.2rem', fontSize: '1.1rem' }}
                >
                    {isSubmitting ? '記録中...' : '送信する'}
                </button>
            </form>
        </div>
    );
}

export default function SurveyExitPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ExitSurveyForm />
        </Suspense>
    );
}
