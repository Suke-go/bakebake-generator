export default function LandingPage() {
    return (
        <div style={{
            height: '100dvh',
            width: '100vw',
            backgroundColor: 'var(--bg-main)',
            color: 'var(--text-main)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '2rem',
            overflowY: 'auto',
            fontFamily: '"Noto Serif JP", serif',
        }}>
            <div style={{
                maxWidth: '800px',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '3rem',
                paddingTop: '4rem',
                paddingBottom: '6rem'
            }}>
                {/* Hero */}
                <section style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
                    <h1 style={{
                        fontSize: '2.5rem',
                        fontWeight: 'normal',
                        letterSpacing: '0.1em',
                        color: 'var(--text-ghost)',
                    }}>
                        BAKEBAKE XR
                    </h1>
                    <p style={{ fontSize: '1rem', opacity: 0.7, letterSpacing: '0.15em' }}>
                        あなたの体験から、新たな妖怪が生まれる
                    </p>
                </section>

                {/* About */}
                <section style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                    <h2 style={{ fontSize: '1.3rem', fontWeight: 'normal', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                        About
                    </h2>
                    <p style={{ lineHeight: 1.9, opacity: 0.85, fontSize: '0.95rem' }}>
                        歴史上、日本の地域社会が生み出してきた「妖怪」は、単なる娯楽キャラクターではなく、説明のつかない現象や漠然とした不安に「名前」と「姿」を与え、腑に落とすための文化的実践でした。
                    </p>
                    <p style={{ lineHeight: 1.9, opacity: 0.85, fontSize: '0.95rem' }}>
                        BAKEBAKE XRは、この歴史的な生成プロセスを現代の計算機環境に再構築するインスタレーションです。国際日本文化研究センター（日文研）の「怪異・妖怪伝承データベース」を地層として参照し、あなたが抱いた名づけえぬ感覚を引き受け、新たな妖怪として像を結ばせます。
                    </p>
                </section>

                {/* Flow */}
                <section data-yokai-zone="landing-flow" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                    <h2 style={{ fontSize: '1.3rem', fontWeight: 'normal', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                        体験のプロセス
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.2rem' }}>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.2rem', borderRadius: '8px' }}>
                            <h3 style={{ fontSize: '1rem', marginBottom: '0.6rem', color: 'var(--text-bright)' }}>1. 事象の記述</h3>
                            <p style={{ fontSize: '0.9rem', opacity: 0.8, lineHeight: 1.6 }}>あなた自身が体験した、あるいは感じたことのある「説明のつかない感覚」をシステムに記述します。</p>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.2rem', borderRadius: '8px' }}>
                            <h3 style={{ fontSize: '1rem', marginBottom: '0.6rem', color: 'var(--text-bright)' }}>2. 伝承記録との照合</h3>
                            <p style={{ fontSize: '0.9rem', opacity: 0.8, lineHeight: 1.6 }}>あなたの体験をもとに日文研のデータベースを検索し、歴史的に語り継がれてきた類似の伝承記録を探し出します。</p>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.2rem', borderRadius: '8px' }}>
                            <h3 style={{ fontSize: '1rem', marginBottom: '0.6rem', color: 'var(--text-bright)' }}>3. 命名と視覚化</h3>
                            <p style={{ fontSize: '0.9rem', opacity: 0.8, lineHeight: 1.6 }}>民俗学的な名づけの作法（地名＋行動、擬音語など）に基づき名前が与えられ、伝統的な和の画風で姿が描き出されます。</p>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.2rem', borderRadius: '8px' }}>
                            <h3 style={{ fontSize: '1rem', marginBottom: '0.6rem', color: 'var(--text-bright)' }}>4. 記録と伝達</h3>
                            <p style={{ fontSize: '0.9rem', opacity: 0.8, lineHeight: 1.6 }}>最後に、生成された妖怪の記録を発行します。時間が経つとインクが消えゆく感熱紙は、口承伝承の変容と忘却の性質を表現しています。</p>
                        </div>
                    </div>
                </section>

                {/* Reference */}
                <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <h2 style={{ fontSize: '1.3rem', fontWeight: 'normal', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                        参考情報
                    </h2>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.2rem', borderRadius: '8px', fontSize: '0.9rem', lineHeight: 1.6, opacity: 0.85 }}>
                        <p style={{ marginBottom: '0.8rem' }}>主な参照: 国際日本文化研究センター（日文研）「怪異・妖怪伝承データベース」系譜を参照。</p>
                        <p style={{ marginBottom: '0.8rem' }}>実データ基盤は data/raw-folklore.json を使い、data/folklore-embeddings.json（ローカル優先）で検索。</p>
                        <p style={{ marginBottom: '0.8rem' }}>補助データとして CyberAgentAILab/YokaiEval（Wikipedia由来）を併用。</p>
                        <p>AI構成: 検索・類似度計算は Google Gemini（gemini-embedding-001）、生成は Gemini（gemini-2.5-flash、gemini-2.5-flash-image / gemini-3-pro-image-preview）。必要時に OpenAI（GPT-4o-mini / DALL-E 3）へフォールバック。</p>
                    </div>
                </section>

                {/* CTA: 参加登録 */}
                <section style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '1rem',
                    marginTop: '1rem',
                }}>
                    <a
                        href="/survey/enter"
                        style={{
                            display: 'inline-block',
                            padding: '1.2rem 3rem',
                            fontSize: '1.1rem',
                            fontFamily: '"Noto Serif JP", serif',
                            letterSpacing: '0.15em',
                            color: '#fff',
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.25)',
                            borderRadius: '6px',
                            textDecoration: 'none',
                            textAlign: 'center',
                            transition: 'background 0.3s ease, border-color 0.3s ease',
                            cursor: 'pointer',
                        }}
                    >
                        参加する
                    </a>
                    <p style={{ fontSize: '0.8rem', opacity: 0.45 }}>
                        事前アンケートに回答し、参加証を受け取ります
                    </p>
                </section>

                {/* Notice */}
                <section style={{ marginTop: '1rem', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.85rem', opacity: 0.45, lineHeight: 1.6 }}>
                        ※本システムは展示会場での限定公開です。
                    </p>
                </section>

                <footer style={{
                    marginTop: '3rem',
                    textAlign: 'center',
                    opacity: 0.35,
                    fontSize: '0.8rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    alignItems: 'center',
                }}>
                    <span>&copy; 2026 BAKEBAKE XR</span>
                    <a
                        href="/generator"
                        style={{
                            fontSize: '0.7rem',
                            color: 'rgba(255,255,255,0.15)',
                            textDecoration: 'none',
                        }}
                    >
                        展示端末
                    </a>
                </footer>
            </div>
        </div>
    );
}
