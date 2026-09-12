export type WorkspaceMode = 'normal' | 'exporter';

/** Keep focused-artifact selection at the build boundary. */
export function getWorkspaceMode(mode: string = import.meta.env.MODE): WorkspaceMode {
  return mode === 'exporter' ? 'exporter' : 'normal';
}

export const workspaceMode = getWorkspaceMode();
