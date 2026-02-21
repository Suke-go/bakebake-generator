'use client';

import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect, ReactNode } from 'react';

// === Types ===
export type HandleId = 'A' | 'B' | 'C' | 'D' | 'E' | 'free';
export type AbsenceQuality = 'invisible' | 'blurry' | 'clear' | null;
export type ConceptSource = 'db' | 'llm';
export type ArtStyle = 'sumi' | 'emaki' | 'ukiyoe' | 'manga' | 'dennou' | null;

export interface Handle {
  id: HandleId;
  text: string;
  shortText: string;
}

export interface FolkloreResult {
  id: string;
  kaiiName: string;
  content: string;
  location: string;
  similarity: number;
}

export interface YokaiConcept {
  source: ConceptSource;
  name: string;
  reading: string;
  description: string;
  label: string;
  folkloreRef?: FolkloreResult;
}

export interface AppState {
  currentPhase: number; // 0, 1, 1.5, 2, 2.5, 3, 3.5
  // Ticket (参加者のQRスキャンで取得)
  ticketId: string | null;
  // Phase 1
  selectedHandle: Handle | null;
  artStyle: ArtStyle;
  // Phase 1'
  texture: string;
  stance: string;
  absenceQuality: AbsenceQuality;
  answers: Record<string, string>;
  // Phase 2
  folkloreResults: FolkloreResult[];
  concepts: YokaiConcept[];
  selectedConcept: YokaiConcept | null;
  // Phase 3
  visualInput: string;
  generatedImageUrl: string | null;
  yokaiName: string;
  narrative: string;
}

interface AppContextType {
  state: AppState;
  goToPhase: (phase: number) => void;
  setHandle: (handle: Handle) => void;
  setArtStyle: (style: ArtStyle) => void;
  setTexture: (texture: string) => void;
  setStance: (stance: string) => void;
  setAbsenceQuality: (quality: AbsenceQuality) => void;
  setAnswers: (answers: Record<string, string>) => void;
  setFolkloreResults: (results: FolkloreResult[]) => void;
  setConcepts: (concepts: YokaiConcept[]) => void;
  selectConcept: (concept: YokaiConcept) => void;
  setVisualInput: (input: string) => void;
  setGeneratedImage: (url: string) => void;
  setYokaiName: (name: string) => void;
  setNarrative: (narrative: string) => void;
  setTicketId: (id: string) => void;
  resetState: () => void;
  /** Phase内サブステップの戻りハンドラーを登録するためのref */
  backOverrideRef: { current: (() => boolean) | null };
}

const initialState: AppState = {
  currentPhase: 0,
  ticketId: null,
  selectedHandle: null,
  artStyle: null,
  texture: '',
  stance: '',
  absenceQuality: null,
  answers: {},
  folkloreResults: [],
  concepts: [],
  selectedConcept: null,
  visualInput: '',
  generatedImageUrl: null,
  yokaiName: '',
  narrative: '',
};

const AppContext = createContext<AppContextType | null>(null);

const SESSION_STORAGE_KEY = 'yokai_app_state';

/** Keys to exclude from sessionStorage (non-serializable or too large) */
const PERSIST_EXCLUDE_KEYS: (keyof AppState)[] = ['generatedImageUrl'];

function loadPersistedState(): AppState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    // Merge with initialState to fill any missing fields
    return { ...initialState, ...parsed, generatedImageUrl: null };
  } catch {
    return null;
  }
}

function persistState(state: AppState) {
  if (typeof window === 'undefined') return;
  try {
    const toSave: Record<string, unknown> = { ...state };
    for (const key of PERSIST_EXCLUDE_KEYS) {
      delete toSave[key];
    }
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // sessionStorage full or unavailable — silently ignore
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadPersistedState() ?? initialState);
  const backOverrideRef = useRef<(() => boolean) | null>(null);

  // Debounced persistence to sessionStorage
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => persistState(state), 300);
    return () => { if (persistTimerRef.current) clearTimeout(persistTimerRef.current); };
  }, [state]);

  const goToPhase = useCallback((phase: number) => {
    setState(prev => ({ ...prev, currentPhase: phase }));
  }, []);

  const setHandle = useCallback((handle: Handle) => {
    setState(prev => ({ ...prev, selectedHandle: handle }));
  }, []);

  const setArtStyle = useCallback((style: ArtStyle) => {
    setState(prev => ({ ...prev, artStyle: style }));
  }, []);

  const setTexture = useCallback((texture: string) => {
    setState(prev => ({ ...prev, texture }));
  }, []);

  const setStance = useCallback((stance: string) => {
    setState(prev => ({ ...prev, stance }));
  }, []);

  const setAbsenceQuality = useCallback((quality: AbsenceQuality) => {
    setState(prev => ({ ...prev, absenceQuality: quality }));
  }, []);

  const setAnswers = useCallback((answers: Record<string, string>) => {
    setState(prev => ({ ...prev, answers }));
  }, []);

  const setFolkloreResults = useCallback((results: FolkloreResult[]) => {
    setState(prev => ({ ...prev, folkloreResults: results }));
  }, []);

  const setConcepts = useCallback((concepts: YokaiConcept[]) => {
    setState(prev => ({ ...prev, concepts }));
  }, []);

  const selectConcept = useCallback((concept: YokaiConcept) => {
    setState(prev => ({
      ...prev,
      selectedConcept: concept,
      yokaiName: concept.name,
    }));
  }, []);

  const setVisualInput = useCallback((input: string) => {
    setState(prev => ({ ...prev, visualInput: input }));
  }, []);

  const setGeneratedImage = useCallback((url: string) => {
    setState(prev => ({ ...prev, generatedImageUrl: url }));
  }, []);

  const setYokaiName = useCallback((name: string) => {
    setState(prev => ({ ...prev, yokaiName: name }));
  }, []);

  const setNarrative = useCallback((narrative: string) => {
    setState(prev => ({ ...prev, narrative }));
  }, []);

  const setTicketId = useCallback((id: string) => {
    setState(prev => ({ ...prev, ticketId: id }));
  }, []);

  const resetState = useCallback(() => {
    setState(initialState);
    try { sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const contextValue = useMemo(() => ({
    state,
    goToPhase,
    setHandle,
    setArtStyle,
    setTexture,
    setStance,
    setAbsenceQuality,
    setAnswers,
    setFolkloreResults,
    setConcepts,
    selectConcept,
    setVisualInput,
    setGeneratedImage,
    setYokaiName,
    setNarrative,
    setTicketId,
    resetState,
    backOverrideRef,
  }), [
    state,
    goToPhase,
    setHandle,
    setArtStyle,
    setTexture,
    setStance,
    setAbsenceQuality,
    setAnswers,
    setFolkloreResults,
    setConcepts,
    selectConcept,
    setVisualInput,
    setGeneratedImage,
    setYokaiName,
    setNarrative,
    setTicketId,
    resetState,
    backOverrideRef,
  ]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
