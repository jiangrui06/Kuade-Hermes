export interface GitChanges { diff: string; files: string[]; untracked: string[]; branch: string }
export interface GitPreview { kind: 'diff' | 'text' | 'unavailable'; content: string; message?: string }
