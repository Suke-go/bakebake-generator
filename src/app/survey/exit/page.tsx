"use client";

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/lib/context';
import { keepsakeFileName, loadDemoKeepsake, PROJECT_SITE_URL, type DemoKeepsake } from '@/lib/demo-keepsake';
import '@/app/globals.css';

const THEME_OPTIONS = [
    { value: 'A', label: '妖怪をキャラクターとして鑑賞する展示' },
    { value: 'B', label: 'AIで妖怪っぽい画像を作る体験' },
    { value: 'C', label: '地域の語りや場所と結びつく“妖怪文化”を扱う展示' },
    { value: 'D', label: 'デジタル技術を使った観光・地域PR' },
    { value: 'E', label: '人間の不安や恐怖を可視化する展示' },
    { value: 'F', label: '記憶や伝承の"消えゆく"性質を体感する展示' },
    { value: 'G', label: 'よくわからない' }
];

// Post yokai perception: disguised mirror of pre-survey Q7
// Wording and option order deliberately differ from pre-survey to avoid priming
const POST_YOKAI_PERCEPTION_OPTIONS = [
    { value: 'spiritual', label: '神仏や自然の中にある、目に見えない力' },
    { value: 'psychology', label: '人間が名前のつかない不安を形にしたもの' },
    { value: 'scary', label: 'なんとなく怖い、不気味なもの' },
    { value: 'culture', label: '地域や時代に根ざした文化的な営み' },
    { value: 'character', label: 'アニメやゲームでおなじみのキャラクター' },
    { value: 'none', label: '特に印象は変わらない' },
];

const SYSTEM_OPTIONS = [
    'VR体験',
    '地図へのマッピング（GIS）',
    '妖怪ジェネレーター',
    '投稿機能'
];

function ExitSurveyForm() {
    const router = useRouter();
    const { resetState, setLocale } = useApp();
    const searchParams = useSearchParams();
    const id = searchParams.get('id');
    const isEnglish = searchParams.get('lang') === 'en';
    // Reached from /demo: the participant's own phone, away from the venue
    // printer and the shared terminal.
    const isDemo = searchParams.get('from') === 'demo';
    const localizedPath = React.useCallback((path: string) => `${path}${isEnglish ? `${path.includes('?') ? '&' : '?'}lang=en` : ''}`, [isEnglish]);
    const returnToStart = React.useCallback(() => {
        resetState();
        setLocale(isEnglish ? 'en' : 'ja');
        router.push(isDemo ? '/demo' : localizedPath('/generator'));
    }, [isDemo, isEnglish, localizedPath, resetState, router, setLocale]);

    const [triggerSent, setTriggerSent] = useState(false);

    // /demo: the yokai to hand back on the final screen. The full image comes
    // from this tab; the saved record is the fallback (e.g. after a reload).
    const [keepsake, setKeepsake] = useState<DemoKeepsake | null>(() => loadDemoKeepsake());
    useEffect(() => {
        if (!isDemo || !id || keepsake) return;
        let cancelled = false;
        void supabase.from('surveys').select('yokai_name, yokai_image_b64').eq('id', id).single().then(({ data }) => {
            if (!cancelled && data?.yokai_image_b64) setKeepsake({ name: data.yokai_name || '', image: data.yokai_image_b64 });
        });
        return () => { cancelled = true; };
    }, [id, isDemo, keepsake]);

    // Form fields
    const [systems, setSystems] = useState<string[]>([]);
    const [theme, setTheme] = useState("");
    const [impression, setImpression] = useState("");
    const [pastYokaiImpression, setPastYokaiImpression] = useState("");
    const [selections, setSelections] = useState<string[]>([]);
    const [actionLog, setActionLog] = useState<number | null>(null);
    const [postYokaiPerception, setPostYokaiPerception] = useState("");

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [isComplete, setIsComplete] = useState(false);

    // アクセスした瞬間に印刷トリガーを引く（1回のみ）
    // オンライン: Supabase の print_triggered を true に → print_daemon がポーリングで検知
    // オフライン: Supabase 失敗時 → /api/local-print に直接 POST
    useEffect(() => {
        if (!id || triggerSent || isDemo) return;

        const triggerPrint = async () => {
            try {
                // まず Supabase 経由を試す（オンラインモード）
                const { error } = await supabase
                    .from('surveys')
                    .update({ print_triggered: true })
                    .eq('id', id);

                if (error) throw error;
                setTriggerSent(true);
            } catch (e) {
                console.warn("Supabase print trigger failed, trying local daemon...", e);
                // オフラインモード: ローカルの print daemon に直接送信
                try {
                    const { data: record } = await supabase
                        .from('surveys')
                        .select('yokai_name, yokai_desc, yokai_image_b64')
                        .eq('id', id)
                        .single();

                    if (record) {
                        await fetch('/api/local-print', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id,
                                yokai_name: record.yokai_name,
                                yokai_desc: record.yokai_desc,
                                yokai_image_b64: record.yokai_image_b64,
                            }),
                        });
                    }
                    setTriggerSent(true);
                } catch (localErr) {
                    console.error("Local print also failed:", localErr);
                }
            }
        };

        triggerPrint();
    }, [id, triggerSent, isDemo]);

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
            setError(isEnglish ? 'No observation ID was found. Please start again at reception.' : 'IDが存在しません。受付からやり直してください。');
            return;
        }

        if (!theme.trim()) {
            setError(isEnglish ? 'Please answer what you think this work was about.' : '「何についての作品だと思いましたか？」の回答は必須です。');
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
                    post_past_yokai_impression: pastYokaiImpression.trim() || null,
                    post_selections: selections,
                    post_action: actionLog,
                    post_systems: systems,
                    post_yokai_perception: postYokaiPerception || null
                })
                .eq('id', id);

            if (dbError) throw dbError;

            // 提出完了したら、次の参加（周回）ができるようにローカルストレージのIDをクリア
            localStorage.removeItem('yokai_ticket_id');

            setIsComplete(true);
        } catch (err: unknown) {
            console.error(err);
            setError(isEnglish ? 'A network error occurred.' : '通信エラーが発生しました。');
            setIsSubmitting(false);
        }
    };

    // Auto-reset idle timer for completion screen
    const [showIdlePrompt, setShowIdlePrompt] = useState(false);
    const idleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const resetTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    // Completion screen phased reveal
    const [showThankTitle, setShowThankTitle] = useState(false);
    const [showThankBody, setShowThankBody] = useState(false);
    const [showThankButtons, setShowThankButtons] = useState(false);

    const clearIdleTimers = React.useCallback(() => {
        if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
        if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null; }
        setShowIdlePrompt(false);
    }, []);

    const startIdleTimers = React.useCallback(() => {
        clearIdleTimers();
        idleTimerRef.current = setTimeout(() => {
            setShowIdlePrompt(true);
            resetTimerRef.current = setTimeout(() => {
                returnToStart();
            }, 10000);
        }, 30000);
    }, [clearIdleTimers, returnToStart]);

    useEffect(() => {
        if (!isComplete) return;
        const t1 = setTimeout(() => setShowThankTitle(true), 400);
        const t2 = setTimeout(() => setShowThankBody(true), 1600);
        const t3 = setTimeout(() => setShowThankButtons(true), 2800);
        if (isDemo) return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
        startIdleTimers();
        const restart = () => startIdleTimers();
        window.addEventListener('pointerdown', restart);
        window.addEventListener('pointermove', restart);
        window.addEventListener('keydown', restart);
        return () => {
            clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
            clearIdleTimers();
            window.removeEventListener('pointerdown', restart);
            window.removeEventListener('pointermove', restart);
            window.removeEventListener('keydown', restart);
        };
    }, [isComplete, isDemo, startIdleTimers, clearIdleTimers]);

    if (!id) {
        return (
            <div data-yokai-zone="survey-exit-missing-id" style={{ color: 'red', textAlign: 'center', marginTop: '5rem' }}>
                {isEnglish ? 'No valid observation ID was found. Please scan the QR code again.' : '有効な観測IDがありません。QRコードをもう一度スキャンしてください。'}
            </div>
        );
    }

    if (isComplete) {
        return (
            <div data-yokai-zone="survey-exit-complete" style={{
                minHeight: '100dvh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem',
                textAlign: 'center',
            }}>
                {showThankTitle && (
                    <h1 className="title-text float-up" style={{
                        fontSize: '2.2rem',
                        marginBottom: '1.5rem',
                        letterSpacing: '0.15em',
                    }}>
                        {isEnglish ? 'Thank you for taking part' : 'ご体験ありがとうございました'}
                    </h1>
                )}

                {showThankBody && !isDemo && (
                    <div className="float-up" style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '1rem',
                    }}>
                        <p className="body-text" style={{
                            fontSize: '1.1rem',
                            opacity: 0.85,
                            lineHeight: 2.0,
                            letterSpacing: '0.08em',
                        }}>
                            {isEnglish ? 'Please collect both printed copies.' : '印刷された2枚をお受け取りください。'}
                        </p>
                        <p className="body-text" style={{ fontSize: '1rem', lineHeight: 1.9, maxWidth: '32rem' }}>
                            {isEnglish ? <><strong>Exhibition copy:</strong> Write your thoughts, then stick it beside a yokai that feels similar to yours.<br /><strong>Take-home copy:</strong> Keep it as a souvenir.</> : <><strong>お札（展示に貼る用）：</strong>感想を書いて、似ていると思う妖怪のそばに貼ってください。<br /><strong>お土産（持ち帰り用）：</strong>お持ち帰りください。</>}
                        </p>
                        <p className="body-text" style={{
                            fontSize: '0.85rem',
                            opacity: 0.5,
                            lineHeight: 1.8,
                        }}>
                            {isEnglish ? <>This record is printed on thermal paper.<br />It may fade over time.<br />Have a safe journey home.</> : <>この記録は感熱紙に印刷されています。<br />時間が経てば、この記憶も消えます。<br />気をつけてお帰りください。</>}
                        </p>
                    </div>
                )}

                {showThankBody && isDemo && (
                    <p className="body-text float-up" style={{ fontSize: '1rem', opacity: 0.85, lineHeight: 2.0, letterSpacing: '0.08em', maxWidth: '32rem' }}>
                        {isEnglish ? <>Your yokai has been recorded.<br />Have a safe journey home.</> : <>あなたの妖怪は記録されました。<br />気をつけてお帰りください。</>}
                    </p>
                )}

                {showThankButtons && (
                    <div className="float-up" style={{
                        marginTop: '2.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.8rem',
                    }}>
                        {isDemo && keepsake && (
                            <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={keepsake.image} alt={keepsake.name} style={{ width: 'min(240px, 70vw)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.2)' }} />
                                {keepsake.name && <p className="title-text" style={{ fontSize: '1.3rem', margin: '0.3rem 0 0.6rem' }}>{keepsake.name}</p>}
                                <a href={keepsake.image} download={keepsakeFileName(keepsake)} className="interactive-button" style={{ padding: '1rem 2rem', textDecoration: 'none' }}>
                                    {isEnglish ? 'Download your yokai' : '妖怪の画像をダウンロード'}
                                </a>
                            </>
                        )}
                        {isDemo && (
                            <a href="/collection" className="interactive-button" style={{ padding: '1rem 2rem', textDecoration: 'none' }}>
                                {isEnglish ? 'See the yokai others have made' : 'ほかの人が作った妖怪を見る'}
                            </a>
                        )}
                        {isDemo && (
                            <a href={PROJECT_SITE_URL} className="interactive-button" style={{ padding: '1rem 2rem', textDecoration: 'none' }}>
                                {isEnglish ? 'Go to bakebake.org' : 'bakebake.org へ進む'}
                            </a>
                        )}
                        <button
                            onClick={returnToStart}
                            className="interactive-button"
                            style={isDemo ? { padding: '0.7rem 1.5rem', opacity: 0.5, fontSize: '0.85rem' } : { padding: '1rem 2rem' }}
                        >
                            {isEnglish ? 'Return to start' : '初期画面へ戻る'}
                        </button>
                        {!isDemo && <button
                            onClick={() => router.push(localizedPath('/survey/enter'))}
                            className="interactive-button"
                            style={{ padding: '0.7rem 1.5rem', opacity: 0.5, fontSize: '0.85rem' }}
                        >
                            {isEnglish ? 'Take part again' : 'もう一度参加する'}
                        </button>}
                    </div>
                )}

                {showIdlePrompt && (
                    <p className="body-text" style={{
                        marginTop: '2rem',
                        fontSize: '0.9rem',
                        opacity: 0.6,
                        animation: 'breathe 2s ease-in-out infinite',
                    }}>
                        {isEnglish ? 'No activity. Returning to the start shortly…' : '操作がありません。まもなく初期画面に戻ります…'}
                    </p>
                )}
            </div>
        );
    }

    return (
        <div data-yokai-zone="survey-exit-form" style={{
            minHeight: '100dvh',
            padding: '2rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2rem',
            overflowY: 'auto',
            width: '100%',
        }}>
            <h1 className="title-text" style={{ fontSize: '2rem' }}>
                {isEnglish ? 'Reflect on the experience' : '体験のふりかえり'}
            </h1>

            <p className="body-text" style={{ textAlign: 'center', opacity: 0.8, maxWidth: '600px' }}>
                {isDemo
                    ? (isEnglish ? 'To finish, please answer the following questions.' : '最後に、以下の質問にお答えください。')
                    : (isEnglish ? 'While your record is printing, please answer the following questions.' : 'プリンターから記録が出力されるのを待ちながら、以下の質問にお答えください。')}
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
                    <label className="body-text">{isEnglish ? '1. Which systems did you use today? (Select all that apply)' : '1. 本日利用・体験したシステム（複数選択）'}</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {SYSTEM_OPTIONS.map(sys => (
                            <label key={sys} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={systems.includes(sys)}
                                    onChange={() => handleSystemSelect(sys)}
                                    style={{ width: '1.2rem', height: '1.2rem' }}
                                />
                                {isEnglish ? ({ 'VR体験': 'VR experience', '地図へのマッピング（GIS）': 'Map (GIS)', '妖怪ジェネレーター': 'Yokai generator', '投稿機能': 'Contribution feature' }[sys] || sys) : sys}
                            </label>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    <label className="body-text">{isEnglish ? '2. What do you think this work was about?' : '2. この作品は、「何について」の作品だと思いましたか？'}<span style={{ color: '#ff6b6b', fontSize: '0.8rem', marginLeft: '0.5rem' }}>{isEnglish ? 'Required' : '必須'}</span></label>
                    <textarea
                        className="glass-input"
                        placeholder={isEnglish ? 'Write freely' : '自由にお書きください'}
                        value={theme}
                        onChange={e => setTheme(e.target.value)}
                        rows={3}
                        style={{ padding: '1rem', width: '100%', resize: 'vertical' }}
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    <label className="body-text">{isEnglish ? '3. What moment or part of the experience stayed with you most?' : '3. 体験の中で、最も印象に残った場面や内容を1つ教えてください。'}</label>
                    <textarea
                        className="glass-input"
                        placeholder={isEnglish ? 'Optional' : '任意入力'}
                        value={impression}
                        onChange={e => setImpression(e.target.value)}
                        rows={3}
                        style={{ padding: '1rem', width: '100%', resize: 'vertical' }}
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    <label className="body-text">{isEnglish ? '4. Select up to two descriptions that feel closest to this work.' : '4. この作品の説明として、最も近いと感じるものを最大2つ選んでください'}</label>
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
                                {isEnglish ? ({ A: 'An exhibition where yokai are appreciated as characters', B: 'An experience of making yokai-like images with AI', C: 'An exhibition about yokai culture connected with local stories and places', D: 'Tourism or local promotion using digital technology', E: 'An exhibition that makes human anxiety and fear visible', F: 'An experience of the fading nature of memory and oral tradition', G: 'I am not sure' }[opt.value] || opt.label) : opt.label}
                            </label>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    <label className="body-text">{isEnglish ? '5. After you leave, would you like to look into or ask someone about local folklore or ghost stories?' : '5. 帰った後に、地元の伝承や怪談について調べたり、誰かに聞いてみたいと思いますか？'}</label>
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
                            <span>{isEnglish ? 'Not at all' : '思わない'}</span>
                            <span>{isEnglish ? 'Very much' : '強く思う'}</span>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    <label className="body-text">
                        {isEnglish ? '6. After this experience, which description is closest to your impression of yokai?' : '6. この体験を通じて、「妖怪」に対するあなたの印象に最も近いものはどれですか？'}
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {POST_YOKAI_PERCEPTION_OPTIONS.map(opt => (
                            <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    name="post_yokai_perception"
                                    value={opt.value}
                                    checked={postYokaiPerception === opt.value}
                                    onChange={() => setPostYokaiPerception(opt.value)}
                                    style={{ width: '1.2rem', height: '1.2rem', accentColor: 'var(--accent)' }}
                                />
                                <span className="body-text" style={{ fontSize: '0.9rem' }}>{isEnglish ? ({ spiritual: 'An invisible force in deities or nature', psychology: 'A form people give to unnamed anxieties', scary: 'Something vaguely frightening or eerie', culture: 'A cultural practice rooted in a place or time', character: 'A familiar character from anime or games', none: 'My impression has not changed' }[opt.value] || opt.label) : opt.label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    <label htmlFor="past-yokai-impression" className="body-text">
                        {isEnglish ? '7. What did you think or feel when you saw the yokai from the past?' : '7. 過去の妖怪を見て、どのようなことを思ったり感じたりしましたか？'}
                    </label>
                    <textarea
                        id="past-yokai-impression"
                        className="glass-input"
                        placeholder={isEnglish ? 'Optional — write freely' : '自由にお書きください（任意）'}
                        value={pastYokaiImpression}
                        onChange={e => setPastYokaiImpression(e.target.value)}
                        rows={3}
                        style={{ padding: '1rem', width: '100%', resize: 'vertical' }}
                    />
                </div>

                <button
                    type="submit"
                    className="interactive-button"
                    disabled={isSubmitting}
                    style={{ marginTop: '1rem', padding: '1.2rem', fontSize: '1.1rem' }}
                >
                    {isSubmitting ? (isEnglish ? 'Saving...' : '記録中...') : (isEnglish ? 'Submit' : '送信する')}
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
