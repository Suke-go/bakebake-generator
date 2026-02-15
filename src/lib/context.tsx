'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

// === Types ===
export type HandleId = 'A' | 'B' | 'C' | 'D' | 'E' | 'free';
export type AbsenceQuality = 'invisible' | 'blurry' | 'clear' | null;
export type ConceptSource = 'db1' | 'db2' | 'llm';
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
  // Phase 1
  selectedHandle: Handle | null;
  artStyle: ArtStyle;
  // Phase 1'
  texture: string;
  stance: string;
  absenceQuality: AbsenceQuality;
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
  setFolkloreResults: (results: FolkloreResult[]) => void;
  setConcepts: (concepts: YokaiConcept[]) => void;
  selectConcept: (concept: YokaiConcept) => void;
  setVisualInput: (input: string) => void;
  setGeneratedImage: (url: string) => void;
  setYokaiName: (name: string) => void;
  setNarrative: (narrative: string) => void;
}

const initialState: AppState = {
  currentPhase: 0,
  selectedHandle: null,
  artStyle: null,
  texture: '',
  stance: '',
  absenceQuality: null,
  folkloreResults: [],
  concepts: [],
  selectedConcept: null,
  visualInput: '',
  generatedImageUrl: null,
  yokaiName: '',
  narrative: '',
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);

  const goToPhase = (phase: number) => {
    setState(prev => ({ ...prev, currentPhase: phase }));
  };

  const setHandle = (handle: Handle) => {
    setState(prev => ({ ...prev, selectedHandle: handle }));
  };

  const setArtStyle = (style: ArtStyle) => {
    setState(prev => ({ ...prev, artStyle: style }));
  };

  const setTexture = (texture: string) => {
    setState(prev => ({ ...prev, texture }));
  };

  const setStance = (stance: string) => {
    setState(prev => ({ ...prev, stance }));
  };

  const setAbsenceQuality = (quality: AbsenceQuality) => {
    setState(prev => ({ ...prev, absenceQuality: quality }));
  };

  const setFolkloreResults = (results: FolkloreResult[]) => {
    setState(prev => ({ ...prev, folkloreResults: results }));
  };

  const setConcepts = (concepts: YokaiConcept[]) => {
    setState(prev => ({ ...prev, concepts }));
  };

  const selectConcept = (concept: YokaiConcept) => {
    setState(prev => ({
      ...prev,
      selectedConcept: concept,
      yokaiName: concept.name,
    }));
  };

  const setVisualInput = (input: string) => {
    setState(prev => ({ ...prev, visualInput: input }));
  };

  const setGeneratedImage = (url: string) => {
    setState(prev => ({ ...prev, generatedImageUrl: url }));
  };

  const setYokaiName = (name: string) => {
    setState(prev => ({ ...prev, yokaiName: name }));
  };

  const setNarrative = (narrative: string) => {
    setState(prev => ({ ...prev, narrative }));
  };

  return (
    <AppContext.Provider value={{
      state,
      goToPhase,
      setHandle,
      setArtStyle,
      setTexture,
      setStance,
      setAbsenceQuality,
      setFolkloreResults,
      setConcepts,
      selectConcept,
      setVisualInput,
      setGeneratedImage,
      setYokaiName,
      setNarrative,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
