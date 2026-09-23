'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import styles from './Experiment.module.css';
import {
  actionPayload,
  API_PATH,
  GRADE_OPTIONS,
  gradeMap,
  officialCardUrl,
  parseResponseForRequest,
  parseStoredSession,
  resumePayload,
  STORAGE_KEY,
  type Action,
  type FolkloreCard,
  type Grade,
  type SessionSnapshot,
  type StoredSession,
} from './protocol';

const REQUEST_TIMEOUT_MS = 120_000;
const STEPS = ['経験を入力', '最初の候補', '接点を記述', '異なる候補', '追加の候補'];

async function request(payload: object): Promise<SessionSnapshot> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'same-origin',
    });
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error('サーバーから有効な応答がありませんでした。');
    }
    if (!response.ok) {
      const detail = data && typeof data === 'object' && 'error' in data &&
        typeof data.error === 'string' ? data.error : '';
      throw new Error(detail || `サーバーが回答を受け付けませんでした（${response.status}）。`);
    }
    // Only start returns the bearer token. Authenticated responses inherit
    // it from the request; the server does not store it in action receipts.
    return parseResponseForRequest(data, payload);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('応答がありませんでした。通信を確認して、再開してください。');
    }
    if (error instanceof TypeError) {
      throw new Error('サーバーに接続できません。時間をおいて再開してください。');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function stepFor(phase: SessionSnapshot['phase'] | 'start'): number {
  switch (phase) {
    case 'start': return 1;
    case 'initial': return 2;
    case 'contact': return 3;
    case 'foil': return 4;
    case 'final':
    case 'complete': return 5;
  }
}

function Candidate({ card, children }: {
  card: FolkloreCard;
  children?: React.ReactNode;
}) {
  return (
    <article className={styles.candidate}>
      {card.name && <h3 className={styles.candidateName}>{card.name}</h3>}
      <p className={styles.summary}>{card.summary}</p>
      {card.prefecture && <p className={styles.metadata}>{card.prefecture}</p>}
      <a className={styles.sourceLink} href={officialCardUrl(card.id)} target="_blank" rel="noopener noreferrer">
        日文研の出典カードを見る <span aria-hidden="true">↗</span>
        <span className={styles.srOnly}>（新しいタブで開きます）</span>
      </a>
      {children}
    </article>
  );
}

function RatingCard({ card, index, value, onChange, disabled, final }: {
  card: FolkloreCard;
  index: number;
  value: Grade | undefined;
  onChange: (grade: Grade) => void;
  disabled: boolean;
  final: boolean;
}) {
  return (
    <Candidate card={card}>
      <fieldset className={styles.choices} disabled={disabled}>
        <legend>{final
          ? 'あなたが書いた接点から見て、この資料はどの程度参考になりますか？'
          : 'この資料は、あなたの経験を考える上でどの程度参考になりますか？'}</legend>
        <div className={styles.choiceGrid}>
          {GRADE_OPTIONS.map((option) => (
            <label className={styles.choice} key={String(option.value)}>
              <input
                type="radio"
                name={`rating-${index}`}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                required
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </Candidate>
  );
}

export default function ExperimentClient() {
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [experience, setExperience] = useState('');
  const [grades, setGrades] = useState<Record<string, Grade | undefined>>({});
  const [selectedPositive, setSelectedPositive] = useState('');
  const [contactDraft, setContactDraft] = useState('');
  const [selectedFoil, setSelectedFoil] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function accept(next: SessionSnapshot, contactOverride?: string, keepAnswers = false) {
    setSession(next);
    if (!keepAnswers) {
      setGrades({});
      setSelectedPositive('');
      setSelectedFoil(undefined);
    }
    if (next.contactText) setContactDraft(next.contactText);
    if (contactOverride !== undefined) setContactDraft(contactOverride);
    if (next.phase === 'complete') {
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      const previous = (() => {
        try { return parseStoredSession(JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null')); }
        catch { return null; }
      })();
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        sessionId: next.sessionId,
        token: next.token,
        contactText: contactOverride ?? next.contactText ?? previous?.contactText,
      }));
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) { setLoading(false); return; }
      let stored: StoredSession;
      try {
        stored = parseStoredSession(JSON.parse(raw));
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
        setError('前回の再開情報を読めなかったため、新しく始めてください。');
        setLoading(false);
        return;
      }
      try {
        const next = await request(resumePayload(stored));
        if (cancelled) return;
        if (next.sessionId !== stored.sessionId) throw new Error('前回の記録を確認できません。');
        accept(next, stored.contactText);
      } catch (cause) {
        if (cancelled) return;
        setBlocked(true);
        setError(cause instanceof Error ? cause.message : '前回の作業を再開できません。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void restore();
    return () => { cancelled = true; };
  }, []);

  async function resume() {
    setBusy(true);
    setError('');
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const stored = parseStoredSession(JSON.parse(raw || 'null'));
      const next = await request(resumePayload(stored));
      if (next.sessionId !== stored.sessionId) throw new Error('前回の記録を確認できません。');
      accept(next, stored.contactText);
      setBlocked(false);
      setNotice('サーバーの保存状態を確認しました。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '再開できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  async function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = experience.trim();
    if (text.length < 20 || text.length > 2000) {
      setError('経験は20〜2000文字で入力してください。');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const next = await request({ type: 'start', experience: text });
      if (next.phase !== 'initial' && next.phase !== 'complete') {
        throw new Error('検索を開始できませんでした。');
      }
      accept(next);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '検索を開始できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  async function submitAction(action: Action, contactOverride?: string) {
    if (!session || blocked || busy) return;
    const prior = session;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const next = await request(actionPayload(prior, action, crypto.randomUUID()));
      if (next.sessionId !== prior.sessionId || next.revision <= prior.revision) {
        throw new Error('回答の保存状態を確認できません。');
      }
      accept(next, contactOverride);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause) {
      // A reply can be lost after the write succeeds. Read the server state
      // before permitting another write so a click never silently duplicates it.
      try {
        const recovered = await request(resumePayload(prior));
        if (recovered.sessionId !== prior.sessionId || recovered.revision < prior.revision) {
          throw new Error('保存状態を確認できません。');
        }
        const advanced = recovered.revision > prior.revision || recovered.phase !== prior.phase;
        accept(recovered, advanced ? contactOverride : undefined, !advanced);
        if (advanced) {
          setNotice('通信が途切れましたが、回答はサーバーに保存されていました。');
        } else {
          setError(cause instanceof Error ? cause.message : '送信できませんでした。もう一度お試しください。');
        }
      } catch {
        setBlocked(true);
        setError('送信結果を確認できません。下の「保存状態を確認」から再開してください。');
      }
    } finally {
      setBusy(false);
    }
  }

  function submitGrades(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || (session.phase !== 'initial' && session.phase !== 'final')) return;
    try {
      const values = gradeMap(session.cards, grades);
      void submitAction({ type: session.phase, grades: values });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '回答を確認してください。');
    }
  }

  function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || session.phase !== 'contact') return;
    const statement = contactDraft.trim();
    if (!selectedPositive || !session.eligibleCards.some((card) => card.summarySha256 === selectedPositive)) {
      setError('資料を一つ選んでください。');
      return;
    }
    if (statement.length < 3 || statement.length > 300) {
      setError('つながりを3〜300文字で、一文で書いてください。');
      return;
    }
    void submitAction({
      type: 'contact',
      positiveSummarySha256: selectedPositive,
      contact: statement,
    }, statement);
  }

  function submitFoil(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || session.phase !== 'foil') return;
    if (selectedFoil === undefined) { setError('候補を一つ選ぶか、該当なしを選んでください。'); return; }
    void submitAction({ type: 'foil', foilSummarySha256: selectedFoil });
  }

  function startOver() {
    sessionStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setExperience('');
    setGrades({});
    setSelectedPositive('');
    setSelectedFoil(undefined);
    setContactDraft('');
    setBlocked(false);
    setError('');
    setNotice('');
  }

  const step = stepFor(session?.phase ?? 'start');
  return (
    <main className={styles.page} data-yokai-zone="experiment">
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/" className={styles.home}>BAKEBAKE</Link>
          <span className={styles.section}>体験から伝承を探す</span>
        </header>

        <div className={styles.intro}>
          <p className={styles.kicker}>EXPERIMENT</p>
          <h1>自分の経験から、<br />伝承を探す。</h1>
          <p>今の暮らしで起きたことを手がかりに、昔の怪異・妖怪伝承を読んでみてください。共通する点があるかどうかは、あなた自身の判断で答えられます。</p>
        </div>

        {!loading && session?.phase !== 'complete' && (
          <nav aria-label="回答の進行状況" className={styles.progress}>
            <ol>
              {STEPS.map((label, index) => (
                <li key={label} className={index + 1 === step ? styles.currentStep : ''}
                    aria-current={index + 1 === step ? 'step' : undefined}>
                  <span>{String(index + 1).padStart(2, '0')}</span>{label}
                </li>
              ))}
            </ol>
          </nav>
        )}

        <div className={styles.status} role="status" aria-live="polite">
          {loading ? '前回の回答を確認しています…' : busy ? 'サーバーに確認しています…' : notice}
        </div>
        {error && <div className={styles.error} role="alert">{error}</div>}
        {blocked && (
          <div className={styles.recovery}>
            <button type="button" onClick={() => void resume()} disabled={busy}>保存状態を確認</button>
            <button type="button" className={styles.textButton} onClick={startOver} disabled={busy}>この回答を破棄して最初から</button>
          </div>
        )}

        {!loading && !blocked && !session && (
          <section aria-labelledby="start-heading" className={styles.panel}>
            <p className={styles.stepLabel}>01 / 05</p>
            <h2 id="start-heading">経験を書く</h2>
            <p className={styles.help}>仕事や暮らし、人とのやりとり、ふと不思議に思ったことなど、あなた自身に起きた一つの出来事を書いてください。妖怪の知識は必要ありません。</p>
            <form onSubmit={(event) => void begin(event)}>
              <label htmlFor="experience" className={styles.fieldLabel}>あなたの経験</label>
              <textarea id="experience" required minLength={20} maxLength={2000} rows={7} value={experience}
                onChange={(event) => setExperience(event.target.value)} disabled={busy}
                placeholder="例：うまく進んでいると思っていた作業で、最後に単純な確認漏れに気づいた。" />
              <p className={styles.small}>20〜2000文字。氏名、住所、連絡先など、個人を特定できる情報は書かないでください。</p>
              <p className={styles.dataNotice}>入力した経験と各候補への評価は、検索システムの研究開発のためサーバーに保存します。</p>
              <button className={styles.primary} type="submit" disabled={busy}>伝承を探す</button>
            </form>
          </section>
        )}

        {!loading && !blocked && (session?.phase === 'initial' || session?.phase === 'final') && (
          <section aria-labelledby="rating-heading" className={styles.panel}>
            <p className={styles.stepLabel}>{session.phase === 'initial' ? '02' : '05'} / 05</p>
            <h2 id="rating-heading">{session.phase === 'initial' ? '最初の候補を読む' : '追加の候補を読む'}</h2>
            <p className={styles.help}>{session.phase === 'initial'
              ? 'あなたの経験と通じるところがあるか、一件ずつ読んで選んでください。合う資料がない場合も、そのまま評価してください。'
              : '先ほど書いた接点から見て、一件ずつ評価してください。'}</p>
            {session.phase === 'final' && contactDraft && <p className={styles.contactQuote}>あなたが書いた接点：{contactDraft}</p>}
            {session.cards.length === 0 ? (
              <p className={styles.error}>候補を受け取れませんでした。再読み込みして保存状態を確認してください。</p>
            ) : (
              <form onSubmit={submitGrades}>
                <div className={styles.candidateList}>
                  {session.cards.map((card, index) => (
                    <RatingCard key={card.summarySha256} card={card} index={index} final={session.phase === 'final'}
                      value={grades[card.summarySha256]} disabled={busy}
                      onChange={(grade) => setGrades((previous) => ({ ...previous, [card.summarySha256]: grade }))} />
                  ))}
                </div>
                <button className={styles.primary} type="submit" disabled={busy}>評価を保存して進む</button>
              </form>
            )}
          </section>
        )}

        {!loading && !blocked && session?.phase === 'contact' && (
          <section aria-labelledby="contact-heading" className={styles.panel}>
            <p className={styles.stepLabel}>03 / 05</p>
            <h2 id="contact-heading">つながりを一文にする</h2>
            <p className={styles.help}>参考になった資料から一つ選び、あなたの経験とどこがつながるかを普段の言葉で書いてください。</p>
            <form onSubmit={submitContact}>
              <fieldset className={styles.selection} disabled={busy}>
                <legend>接点を考えたい資料を一つ選ぶ</legend>
                {session.eligibleCards.map((card) => (
                  <Candidate key={card.summarySha256} card={card}>
                    <label className={styles.selectRow}>
                      <input type="radio" name="positive" value={card.summarySha256}
                        checked={selectedPositive === card.summarySha256}
                        onChange={() => setSelectedPositive(card.summarySha256)} required />
                      <span>この資料を選ぶ</span>
                    </label>
                  </Candidate>
                ))}
              </fieldset>
              <label htmlFor="contact-statement" className={styles.fieldLabel}>どの点がつながりますか？</label>
              <textarea id="contact-statement" required minLength={3} maxLength={300} rows={3} value={contactDraft}
                onChange={(event) => setContactDraft(event.target.value)} disabled={busy}
                placeholder="私には、うまくいくと思っていたのに思わぬところで失敗する点が重なりました。" />
              <p className={styles.small}>一文で、3〜300文字。資料に書かれていない気持ちを断定する必要はありません。</p>
              <button className={styles.primary} type="submit" disabled={busy || session.eligibleCards.length === 0}>接点を保存して進む</button>
            </form>
          </section>
        )}

        {!loading && !blocked && session?.phase === 'foil' && (
          <section aria-labelledby="foil-heading" className={styles.panel}>
            <p className={styles.stepLabel}>04 / 05</p>
            <h2 id="foil-heading">似て見える別の候補を選ぶ</h2>
            <p className={styles.help}>見た目や題材は近くても、あなたが書いた接点とは違う資料があれば一つ選んでください。該当しなければ「なし」で進めます。</p>
            {contactDraft && <p className={styles.contactQuote}>あなたが書いた接点：{contactDraft}</p>}
            <form onSubmit={submitFoil}>
              <fieldset className={styles.selection} disabled={busy}>
                <legend>接点が異なる資料</legend>
                {session.foilCards.map((card) => (
                  <Candidate key={card.summarySha256} card={card}>
                    <label className={styles.selectRow}>
                      <input type="radio" name="foil" value={card.summarySha256}
                        checked={selectedFoil === card.summarySha256}
                        onChange={() => setSelectedFoil(card.summarySha256)} required />
                      <span>似て見えるが、この接点ではない</span>
                    </label>
                  </Candidate>
                ))}
                <label className={`${styles.selectRow} ${styles.noneRow}`}>
                  <input type="radio" name="foil" value="none" checked={selectedFoil === null}
                    onChange={() => setSelectedFoil(null)} required />
                  <span>該当する候補はない</span>
                </label>
              </fieldset>
              <button className={styles.primary} type="submit" disabled={busy}>選択を保存して進む</button>
            </form>
          </section>
        )}

        {!loading && !blocked && session?.phase === 'complete' && (
          <section aria-labelledby="complete-heading" className={styles.panel}>
            <p className={styles.stepLabel}>完了</p>
            <h2 id="complete-heading">回答を保存しました</h2>
            <p className={styles.help}>伝承を読んでいただき、ありがとうございました。別の経験でも探すことができます。</p>
            <button className={styles.primary} type="button" onClick={startOver}>別の経験で探す</button>
          </section>
        )}

        <footer className={styles.footer}>
          <p>資料：<a href="https://sekiei.nichibun.ac.jp/YoukaiDB/kwaii.html" target="_blank" rel="noopener noreferrer">国際日本文化研究センター「怪異・妖怪伝承データベース」</a></p>
          <Link href="/">トップに戻る</Link>
        </footer>
      </div>
    </main>
  );
}
