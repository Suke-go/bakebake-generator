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
                        妖怪生成装置
                    </p>
                </section>

                {/* About */}
                <section style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                    <h2 style={{ fontSize: '1.3rem', fontWeight: 'normal', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                        About
                    </h2>
                    <p style={{ lineHeight: 1.9, opacity: 0.85, fontSize: '0.95rem' }}>
                        日本の各地には、説明のつかない不思議な体験が「妖怪」や「怪異」として語り継がれてきました。本システムは、あなた自身の体験をもとに、まだ名前のない新しい妖怪を生み出す装置です。
                    </p>
                    <p style={{ lineHeight: 1.9, opacity: 0.85, fontSize: '0.95rem' }}>
                        国際日本文化研究センター（日文研）の怪異・妖怪伝承データベースに収録された実在の民話記録と、柳田國男の妖怪命名分類をもとに、AIが新たな妖怪の名前・姿・伝承を生成します。
                    </p>
                </section>

                {/* Flow */}
                <section style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                    <h2 style={{ fontSize: '1.3rem', fontWeight: 'normal', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                        体験の流れ
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.2rem' }}>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.2rem', borderRadius: '8px' }}>
                            <h3 style={{ fontSize: '1rem', marginBottom: '0.4rem', color: 'var(--text-ghost)' }}>1. 体験の入力</h3>
                            <p style={{ fontSize: '0.9rem', opacity: 0.8, lineHeight: 1.6 }}>いつ・どこで・どんな体験をしたかを、いくつかの質問に答える形で入力します。</p>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.2rem', borderRadius: '8px' }}>
                            <h3 style={{ fontSize: '1rem', marginBottom: '0.4rem', color: 'var(--text-ghost)' }}>2. 類似伝承の検索</h3>
                            <p style={{ fontSize: '0.9rem', opacity: 0.8, lineHeight: 1.6 }}>入力された体験に似た妖怪の伝承記録を、日文研のデータベースから検索します。</p>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.2rem', borderRadius: '8px' }}>
                            <h3 style={{ fontSize: '1rem', marginBottom: '0.4rem', color: 'var(--text-ghost)' }}>3. 命名と画像生成</h3>
                            <p style={{ fontSize: '0.9rem', opacity: 0.8, lineHeight: 1.6 }}>柳田國男の命名分類に基づき、AIが3つの名前候補を提案。選んだ名前で妖怪の姿と伝承テキストを生成します。</p>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.2rem', borderRadius: '8px' }}>
                            <h3 style={{ fontSize: '1rem', marginBottom: '0.4rem', color: 'var(--text-ghost)' }}>4. 記録の保存</h3>
                            <p style={{ fontSize: '0.9rem', opacity: 0.8, lineHeight: 1.6 }}>生成された妖怪はQRコードを通じてお手持ちのスマートフォンに転送・保存されます。</p>
                        </div>
                    </div>
                </section>

                {/* Notice */}
                <section style={{ marginTop: '1rem', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.85rem', opacity: 0.45, lineHeight: 1.6 }}>
                        ※本システムは展示会場での限定公開です。
                    </p>
                </section>

                <footer style={{ marginTop: '3rem', textAlign: 'center', opacity: 0.35, fontSize: '0.8rem' }}>
                    &copy; 2026 BAKEBAKE XR
                </footer>
            </div>
        </div>
    );
}
