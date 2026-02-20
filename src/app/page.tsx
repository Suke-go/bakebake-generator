export default function LandingPage() {
    return (
        <div style={{
            minHeight: '100dvh',
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
                gap: '4rem',
                paddingTop: '4rem',
                paddingBottom: '6rem'
            }}>
                {/* Hero Section */}
                <section style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '2rem' }}>
                    <h1 style={{
                        fontSize: '2.5rem',
                        fontWeight: 'normal',
                        letterSpacing: '0.1em',
                        color: 'var(--text-ghost)',
                        textShadow: '0 0 20px rgba(255,255,255,0.2)'
                    }}>
                        BAKEBAKE XR
                    </h1>
                    <p style={{ fontSize: '1.1rem', lineHeight: 1.8, opacity: 0.9 }}>
                        あなたの空間の「気配」を、名前のない怪異にする。
                    </p>
                </section>

                {/* Concept Section */}
                <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '2rem' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 'normal', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                        Concept
                    </h2>
                    <p style={{ lineHeight: 1.9, opacity: 0.85, fontSize: '0.95rem' }}>
                        かつて人々は、ふとした不可解な現象や、背筋が寒くなるような気配に対して名前を与え、「妖怪」や「怪異」として解釈してきました。
                        これは恐怖を制御し、自然環境への畏怖を形にするための装置でした。（柳田國男『妖怪談義』）
                    </p>
                    <p style={{ lineHeight: 1.9, opacity: 0.85, fontSize: '0.95rem' }}>
                        本プロジェクトは、国際日本文化研究センターの「怪異・妖怪伝承データベース」の記録構造と、古くからの命名規則をベースに、皆様が感じた「名状しがたい気配」を、現在のLLMと生成AI技術によって「新たな怪異」としてXR空間へ定着させるインスタレーション作品です。
                    </p>
                </section>

                {/* System Section */}
                <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 'normal', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                        System
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.5rem', borderRadius: '8px' }}>
                            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: 'var(--text-ghost)' }}>1. 気配のスキャン</h3>
                            <p style={{ fontSize: '0.9rem', opacity: 0.8, lineHeight: 1.6 }}>体験の場所や時間、肌で感じた感覚を入力し、気配を抽出します。</p>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.5rem', borderRadius: '8px' }}>
                            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: 'var(--text-ghost)' }}>2. 伝承からの探求</h3>
                            <p style={{ fontSize: '0.9rem', opacity: 0.8, lineHeight: 1.6 }}>データベース上の実在の伝承を探索し、類似する記録を参照します。</p>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.5rem', borderRadius: '8px' }}>
                            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: 'var(--text-ghost)' }}>3. 命名と顕現</h3>
                            <p style={{ fontSize: '0.9rem', opacity: 0.8, lineHeight: 1.6 }}>伝統的な命名則に従い名を与え、その姿を描き出します。</p>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.5rem', borderRadius: '8px' }}>
                            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: 'var(--text-ghost)' }}>4. 記録の定着</h3>
                            <p style={{ fontSize: '0.9rem', opacity: 0.8, lineHeight: 1.6 }}>観測した怪異はQRチケットとして印刷され、記録として保存されます。</p>
                        </div>
                    </div>
                </section>

                {/* Notice Section */}
                <section style={{ marginTop: '2rem', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.9rem', opacity: 0.5, lineHeight: 1.6 }}>
                        ※本システムは展示会場での限定公開となります。<br />生成体験には会場で提供される専用デバイスが必要です。
                    </p>
                </section>

                <footer style={{ marginTop: '4rem', textAlign: 'center', opacity: 0.4, fontSize: '0.8rem' }}>
                    &copy; 2026 BAKEBAKE XR Project.
                </footer>
            </div>
        </div>
    );
}
