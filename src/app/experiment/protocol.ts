export const STORAGE_KEY = 'bakebake-public-experiment-v1';
export const API_PATH = '/api/public-experiment';
export const PROTOCOL_VERSION = 'public-explore-e5-v1';

export const GRADE_OPTIONS = [
  { value: 0, label: '0　接点を感じない' },
  { value: 1, label: '1　少しだけ接点を感じる' },
  { value: 2, label: '2　重要な部分に接点を感じる' },
  { value: 3, label: '3　特に強い接点を感じる' },
  { value: 'U', label: 'U　この要約だけでは判断できない' },
] as const;

export type Grade = 0 | 1 | 2 | 3 | 'U';
export type Phase = 'initial' | 'contact' | 'foil' | 'final' | 'complete';

export type FolkloreCard = {
  id: string;
  summarySha256: string;
  summary: string;
  name?: string;
  prefecture?: string;
};

type SessionBase = {
  sessionId: string;
  token: string;
  revision: number;
  contactText?: string;
};

export type SessionSnapshot = SessionBase & (
  | { phase: 'initial'; cards: FolkloreCard[] }
  | { phase: 'contact'; eligibleCards: FolkloreCard[] }
  | { phase: 'foil'; foilCards: FolkloreCard[] }
  | { phase: 'final'; cards: FolkloreCard[] }
  | { phase: 'complete' }
);

export type StoredSession = {
  sessionId: string;
  token: string;
  contactText?: string;
};

export type Action =
  | { type: 'initial'; grades: Record<string, Grade> }
  | { type: 'contact'; positiveSummarySha256: string; contact: string }
  | { type: 'foil'; foilSummarySha256: string | null }
  | { type: 'final'; grades: Record<string, Grade> };

const SHA256 = /^[0-9a-f]{64}$/;
const NICHIBUN_ID = /^[A-Za-z0-9_-]{1,32}$/;
const NICHIBUN_CARD_BASE = 'https://www.nichibun.ac.jp/cgi-bin/YoukaiDB3/youkai_card.cgi?ID=';

export function officialCardUrl(id: string): string {
  if (!NICHIBUN_ID.test(id)) throw new Error('資料IDを確認できません。');
  return `${NICHIBUN_CARD_BASE}${encodeURIComponent(id)}`;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function cards(value: unknown): FolkloreCard[] {
  if (!Array.isArray(value)) throw new Error('候補資料を確認できません。');
  const seen = new Set<string>();
  return value.map((item) => {
    if (!record(item) || typeof item.id !== 'string' || !NICHIBUN_ID.test(item.id) ||
        typeof item.summarySha256 !== 'string' ||
        !SHA256.test(item.summarySha256) || seen.has(item.summarySha256)) {
      throw new Error('候補資料を確認できません。');
    }
    const summary = requiredString(item.summary, '候補資料を確認できません。');
    seen.add(item.summarySha256);
    const result: FolkloreCard = {
      id: item.id,
      summarySha256: item.summarySha256,
      summary,
    };
    const name = optionalString(item.name);
    const prefecture = optionalString(item.prefecture);
    if (name) result.name = name;
    if (prefecture) result.prefecture = prefecture;
    return result;
  });
}

export function parseSnapshot(value: unknown): SessionSnapshot {
  if (!record(value)) throw new Error('サーバーの応答を確認できません。');
  if (value.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error('この画面に対応する検索版を確認できません。');
  }
  const sessionId = requiredString(value.sessionId, '再開情報を確認できません。');
  const token = requiredString(value.token, '再開情報を確認できません。');
  const revision = value.revision;
  if (!Number.isSafeInteger(revision) || (revision as number) < 0) {
    throw new Error('再開情報を確認できません。');
  }
  const base: SessionBase = {
    sessionId,
    token,
    revision: revision as number,
    contactText: optionalString(value.contactText),
  };
  switch (value.phase) {
    case 'initial': return { ...base, phase: 'initial', cards: cards(value.cards) };
    case 'contact': return { ...base, phase: 'contact', eligibleCards: cards(value.eligibleCards) };
    case 'foil': return { ...base, phase: 'foil', foilCards: cards(value.foilCards) };
    case 'final': return { ...base, phase: 'final', cards: cards(value.cards) };
    case 'complete': return { ...base, phase: 'complete' };
    default: throw new Error('検索の進行状態を確認できません。');
  }
}

export function parseResponseForRequest(value: unknown, payload: unknown): SessionSnapshot {
  if (!record(value)) throw new Error('サーバーの応答を確認できません。');
  const sentToken = record(payload) ? payload.token : undefined;
  if (typeof sentToken === 'string') {
    if (value.token !== undefined && value.token !== sentToken) {
      throw new Error('再開情報が一致しません。');
    }
    return parseSnapshot({ ...value, token: sentToken });
  }
  return parseSnapshot(value);
}

export function parseStoredSession(value: unknown): StoredSession {
  if (!record(value)) throw new Error('保存された再開情報を確認できません。');
  return {
    sessionId: requiredString(value.sessionId, '保存された再開情報を確認できません。'),
    token: requiredString(value.token, '保存された再開情報を確認できません。'),
    contactText: optionalString(value.contactText),
  };
}

export function resumePayload(saved: StoredSession) {
  return { type: 'resume' as const, sessionId: saved.sessionId, token: saved.token };
}

export function gradeMap(
  presentedCards: FolkloreCard[],
  selected: Record<string, Grade | undefined>,
): Record<string, Grade> {
  const grades: Record<string, Grade> = {};
  for (const item of presentedCards) {
    const grade = selected[item.summarySha256];
    if (grade !== 0 && grade !== 1 && grade !== 2 && grade !== 3 && grade !== 'U') {
      throw new Error('すべての資料について評価を選んでください。');
    }
    grades[item.summarySha256] = grade;
  }
  return grades;
}

export function actionPayload(session: SessionSnapshot, action: Action, actionId: string) {
  if (session.phase !== action.type || !actionId) {
    throw new Error('送信する画面の状態を確認できません。');
  }
  return {
    ...action,
    sessionId: session.sessionId,
    token: session.token,
    revision: session.revision,
    actionId,
  };
}
