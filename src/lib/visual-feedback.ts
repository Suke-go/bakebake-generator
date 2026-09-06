export function composeVisualGenerationInput(visualNote: string, kept: string, changed: string): string {
    return [
        visualNote.trim(),
        kept.trim() ? `残す: ${kept.trim()}` : '',
        changed.trim() ? `変える: ${changed.trim()}` : '',
    ].filter(Boolean).join('\n');
}
