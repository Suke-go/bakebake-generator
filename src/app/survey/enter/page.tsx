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
    { value: 'character', label: 'エンタメ・キャラクター（ゲゲゲの鬼太郎、妖怪ウォッチなど）' },
    { value: 'culture', label: '日本の伝統文化・民俗の一部' },
    { value: 'psychology', label: '人間の不安や恐怖の表れ' },
    { value: 'none', label: 'あまり考えたことがない' }
];

export default function SurveyEnterPage() {
    const router = useRouter();
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

    return (
        <div style={{
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
                            placeholder="例：ゲゲゲの鬼太郎、怖い、河童..."
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
