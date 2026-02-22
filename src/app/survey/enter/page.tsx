"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import '@/app/globals.css';

const PREFECTURES = [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
    "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
    "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
    "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
    "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
    "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県", "海外"
];

const YOKAI_PERCEPTION_OPTIONS = [
    { value: 'character', label: 'アニメやゲームに出てくるキャラクター' },
    { value: 'scary', label: '夜道や暗い場所で感じる「怖いもの」' },
    { value: 'culture', label: '昔話や言い伝えに出てくる、土地にまつわる存在' },
    { value: 'psychology', label: '説明できないものに人間がつけた名前' },
    { value: 'spiritual', label: '神社やお寺、祭りなどに関係する存在' },
    { value: 'none', label: 'あまり考えたことがない' }
];

function ConsentScreen({ onAccept, onDecline, isDeclining }: { onAccept: () => void; onDecline: () => void; isDeclining: boolean }) {

    const infoItems = [
        {
            title: '研究の目的',
            body: '本アンケートは、「BAKEBAKE XR」の体験評価の一環として実施されます。'
        },
        {
            title: '回答の取扱い',
            body: '回答は匿名で収集され、個人を特定する情報は取得しません。収集したデータは統計的に処理し、研究・体験評価・改善目的以外には使用しません。'
        },
        {
            title: '所要時間',
            body: 'アンケートは体験前・体験後の2回に分かれており、それぞれ1〜2分程度です。'
        },
        {
            title: '参加の任意性',
            body: '参加は任意です。途中で回答をやめることもできます。回答しなくても体験には一切影響しません。'
        },
    ];

    return (
        <div data-yokai-zone="survey-enter-consent" style={{
            minHeight: '100dvh',
            padding: '2rem 1rem 4rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: '2rem',
            overflowY: 'auto',
            width: '100%'
        }}>
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2rem',
                width: '100%',
                maxWidth: '600px',
                marginTop: 'auto',
                marginBottom: 'auto'
            }}>
                <h1 className="title-text" style={{ fontSize: '1.8rem', textAlign: 'center', letterSpacing: '0.1em' }}>
                    研究参加のご案内
                </h1>

                <p className="body-text" style={{ textAlign: 'center', opacity: 0.8, lineHeight: 1.8 }}>
                    アンケートへのご協力をお願いするにあたり、<br />
                    以下の内容をご確認ください。
                </p>

                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.2rem',
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.03)',
                    padding: '1.5rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                    {infoItems.map((item, i) => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <span className="body-text" style={{ fontSize: '0.85rem', opacity: 0.6 }}>
                                {item.title}
                            </span>
                            <p className="body-text" style={{ fontSize: '0.95rem', lineHeight: 1.7, margin: 0 }}>
                                {item.body}
                            </p>
                        </div>
                    ))}
                </div>

                {/* 研究者情報 */}
                <div style={{
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.02)',
                    padding: '1.2rem 1.5rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.06)'
                }}>
                    <span className="body-text" style={{ fontSize: '0.8rem', opacity: 0.5, display: 'block', marginBottom: '0.6rem' }}>
                        研究実施者
                    </span>
                    <div className="body-text" style={{ fontSize: '0.85rem', lineHeight: 1.9, opacity: 0.75 }}>
                        <p style={{ margin: '0 0 0.2rem 0' }}>一倉 弘毅（筑波大学大学院 システム情報工学研究群）</p>
                        <p style={{ margin: '0 0 0.2rem 0' }}>干川 未来（筑波大学 システム情報工学研究群）</p>
                        <p style={{ margin: '0 0 0.2rem 0' }}>清水 紘輔（筑波大学 情報学群 情報メディア創成学類）</p>
                        <p style={{ margin: '0 0 0.6rem 0' }}>池辺 莉々（日本女子大学 文学部 史学科）</p>
                        <p style={{ margin: 0, fontSize: '0.8rem' }}>
                            担当連絡先：清水（shimizu@ai.iit.tsukuba.ac.jp）
                        </p>
                    </div>
                </div>

                {/* CTA */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '1rem',
                    marginTop: '0.5rem',
                    width: '100%'
                }}>
                    <button
                        onClick={onAccept}
                        className="interactive-button"
                        style={{ padding: '1.2rem', fontSize: '1.1rem', width: '100%' }}
                    >
                        同意してアンケートに進む
                    </button>
                    <button
                        onClick={onDecline}
                        disabled={isDeclining}
                        className="body-text"
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'inherit',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            opacity: 0.4,
                            textDecoration: 'underline',
                            padding: '0.5rem'
                        }}
                    >
                        {isDeclining ? '処理中...' : 'アンケートには回答せず体験に進む'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function SurveyEnterPage() {
    const router = useRouter();
    const [consentAccepted, setConsentAccepted] = useState(false);
    const [isDeclining, setIsDeclining] = useState(false);
    const [visitorType, setVisitorType] = useState("");
    const [origin, setOrigin] = useState("");
    const [familiarity, setFamiliarity] = useState<number | null>(null);
    const [preImage, setPreImage] = useState("");
    // New fields for SIGGRAPH evaluation
    const [age, setAge] = useState("");
    const [gender, setGender] = useState("");
    const [yokaiPerception, setYokaiPerception] = useState("");
    const [aiExperience, setAiExperience] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [isCheckingSession, setIsCheckingSession] = useState(true);

    // 以前のセッション（ID）が残っていれば復帰する
    useEffect(() => {
        const savedId = localStorage.getItem('yokai_ticket_id');
        if (savedId) {
            router.push(`/survey/ticket/${savedId}`);
        } else {
            setIsCheckingSession(false);
        }
    }, [router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!visitorType || !origin || !familiarity || !preImage.trim() || !age || !yokaiPerception) {
            setError("必須項目をすべて入力してください。");
            return;
        }

        setIsSubmitting(true);

        try {
            const { data, error: dbError } = await supabase
                .from('surveys')
                .insert([
                    {
                        visitor_type: visitorType,
                        pre_origin: origin,
                        pre_familiarity: familiarity,
                        pre_image: preImage.trim(),
                        pre_age: age,
                        pre_gender: gender || null,
                        pre_yokai_perception: yokaiPerception,
                        pre_ai_experience: aiExperience
                    }
                ])
                .select();

            if (dbError) throw dbError;

            if (data && data.length > 0) {
                const newId = data[0].id;
                // スマホのローカルストレージにIDを保存（誤って閉じた時の復帰用）
                localStorage.setItem('yokai_ticket_id', newId);
                // Navigate to the ticket page
                router.push(`/survey/ticket/${newId}`);
            } else {
                throw new Error("Failed to create record");
            }
        } catch (err: any) {
            console.error(err);
            setError("通信エラーが発生しました。もう一度お試しください。");
            setIsSubmitting(false);
        }
    };

    if (isCheckingSession) {
        return (
            <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
                <p className="body-text" style={{ opacity: 0.5 }}>以前の記録を確認中...</p>
            </div>
        );
    }

    const handleDecline = async () => {
        setIsDeclining(true);
        try {
            const { data, error: dbError } = await supabase
                .from('surveys')
                .insert([{ survey_declined: true }])
                .select();
            if (dbError) throw dbError;
            if (data && data.length > 0) {
                const newId = data[0].id;
                localStorage.setItem('yokai_ticket_id', newId);
                router.push(`/survey/ticket/${newId}`);
            }
        } catch (err) {
            console.error(err);
            setIsDeclining(false);
        }
    };

    if (!consentAccepted) {
        return (
            <ConsentScreen
                onAccept={() => setConsentAccepted(true)}
                onDecline={handleDecline}
                isDeclining={isDeclining}
            />
        );
    }

    return (
        <div data-yokai-zone="survey-enter-page" style={{
            minHeight: '100dvh',
            padding: '2rem 1rem 4rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start', // Changed from center to allow scrolling top
            gap: '2rem',
            overflowY: 'auto', // Explicitly allow scrolling
            width: '100%'
        }}>
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2rem',
                width: '100%',
                maxWidth: '600px',
                marginTop: 'auto', // Push to center if screen is taller
                marginBottom: 'auto'
            }}>
                <h1 className="title-text" style={{ fontSize: '2rem', textAlign: 'center' }}>
                    参加者アンケート
                </h1>

                <p className="body-text" style={{ textAlign: 'center', opacity: 0.8, maxWidth: '100%' }}>
                    妖怪生成体験の前に、いくつか質問にお答えください。回答は研究目的でのみ利用されます。
                </p>

                <form data-yokai-zone="survey-enter-form" onSubmit={handleSubmit} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2rem',
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.03)',
                    padding: '2rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>

                    {error && <div style={{ color: '#ff6b6b', textAlign: 'center' }}>{error}</div>}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        <label className="body-text">1. あなたについて</label>
                        <select
                            className="glass-input"
                            value={visitorType}
                            onChange={e => setVisitorType(e.target.value)}
                            style={{ padding: '1rem', width: '100%' }}
                        >
                            <option value="" disabled>選択してください</option>
                            <option value="一般来場者">一般来場者</option>
                            <option value="妖怪・怪談の愛好家">妖怪・怪談の愛好家</option>
                            <option value="研究者・教育・文化関係者">研究者・教育・文化関係者</option>
                            <option value="展示・クリエイティブ関係者">展示・クリエイティブ関係者</option>
                            <option value="その他">その他</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        <label className="body-text">2. どちらからお越しですか？</label>
                        <select
                            className="glass-input"
                            value={origin}
                            onChange={e => setOrigin(e.target.value)}
                            style={{ padding: '1rem', width: '100%' }}
                        >
                            <option value="" disabled>選択してください</option>
                            {PREFECTURES.map(pref => (
                                <option key={pref} value={pref}>{pref}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        <label className="body-text">3. 「妖怪」や「伝承」にどれくらい馴染みがありますか？</label>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                            {[1, 2, 3, 4, 5].map(num => (
                                <button
                                    key={num}
                                    type="button"
                                    className={`interactive-button ${familiarity === num ? 'active' : ''}`}
                                    onClick={() => setFamiliarity(num)}
                                    style={{
                                        flex: 1,
                                        padding: '0.8rem',
                                        background: familiarity === num ? 'rgba(255,255,255,0.2)' : 'transparent'
                                    }}
                                >
                                    {num}
                                </button>
                            ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', opacity: 0.6 }}>
                            <span>全くない</span>
                            <span>非常にある</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        <label className="body-text">
                            4. 「妖怪」と聞いて、最初に思い浮かぶイメージや言葉を1つだけ教えてください。
                        </label>
                        <input
                            type="text"
                            className="glass-input"
                            placeholder="例：怖い、河童、不思議な音..."
                            value={preImage}
                            onChange={e => setPreImage(e.target.value)}
                            style={{ padding: '1rem', width: '100%' }}
                        />
                    </div>

                    {/* Q5: 年齢 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        <label className="body-text">5. 年齢層<span style={{ color: '#ff6b6b', fontSize: '0.8rem', marginLeft: '0.5rem' }}>必須</span></label>
                        <select
                            className="glass-input"
                            value={age}
                            onChange={e => setAge(e.target.value)}
                            style={{ padding: '1rem', width: '100%' }}
                        >
                            <option value="" disabled>選択してください</option>
                            <option value="10代">10代</option>
                            <option value="20代">20代</option>
                            <option value="30代">30代</option>
                            <option value="40代">40代</option>
                            <option value="50代以上">50代以上</option>
                        </select>
                    </div>

                    {/* Q6: 性別 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        <label className="body-text">6. 性別（任意）</label>
                        <select
                            className="glass-input"
                            value={gender}
                            onChange={e => setGender(e.target.value)}
                            style={{ padding: '1rem', width: '100%' }}
                        >
                            <option value="">回答しない</option>
                            <option value="男性">男性</option>
                            <option value="女性">女性</option>
                            <option value="その他">その他</option>
                        </select>
                    </div>

                    {/* Q7: 妖怪の知覚ベースライン (CRITICAL for paper §4.1) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        <label className="body-text">
                            7. 「妖怪」をひとことで表すなら、最も近いものはどれですか？
                            <span style={{ color: '#ff6b6b', fontSize: '0.8rem', marginLeft: '0.5rem' }}>必須</span>
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {YOKAI_PERCEPTION_OPTIONS.map(opt => (
                                <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        name="yokai_perception"
                                        value={opt.value}
                                        checked={yokaiPerception === opt.value}
                                        onChange={() => setYokaiPerception(opt.value)}
                                        style={{ width: '1.2rem', height: '1.2rem', accentColor: 'var(--accent)' }}
                                    />
                                    <span className="body-text" style={{ fontSize: '0.9rem' }}>{opt.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Q8: 生成AI経験 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        <label className="body-text">8. 生成AI（ChatGPT, 画像生成AIなど）の利用経験はありますか？</label>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                            {[1, 2, 3, 4, 5].map(num => (
                                <button
                                    key={num}
                                    type="button"
                                    className={`interactive-button ${aiExperience === num ? 'active' : ''}`}
                                    onClick={() => setAiExperience(num)}
                                    style={{
                                        flex: 1,
                                        padding: '0.8rem',
                                        background: aiExperience === num ? 'rgba(255,255,255,0.2)' : 'transparent'
                                    }}
                                >
                                    {num}
                                </button>
                            ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', opacity: 0.6 }}>
                            <span>全くない</span>
                            <span>日常的に使う</span>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="interactive-button"
                        disabled={isSubmitting}
                        style={{ marginTop: '1rem', padding: '1.2rem', fontSize: '1.1rem' }}
                    >
                        {isSubmitting ? '処理中...' : 'アンケートを完了する'}
                    </button>
                </form>
            </div>
        </div>
    );
}
