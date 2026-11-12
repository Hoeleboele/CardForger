import { create } from "zustand";
import { initialProject, toProject, type ExportRecord, type Project } from "./model";

const HISTORY_LIMIT = 100;

export type WorkspaceStore = Project & {
  ready: boolean;
  history: Project[];
  future: Project[];
  /** Increments on every persisted change; autosave compares it with the last saved revision. */
  revision: number;
  replace: (project: Project) => void;
  update: (fn: (project: Project) => Project) => void;
  select: (cardId: string) => void;
  logExport: (record: Omit<ExportRecord, "id" | "date">) => void;
  undo: () => void;
  redo: () => void;
};

export const useWorkspace = create<WorkspaceStore>((set) => ({
  ...initialProject,
  ready: false,
  history: [],
  future: [],
  revision: 0,
  replace: (project) =>
    set((state) => ({ ...project, ready: true, history: [], future: [], revision: state.revision + 1 })),
  update: (fn) =>
    set((state) => {
      const snapshot = toProject(state);
      const next = fn(snapshot);
      if (next === snapshot) return state;
      return {
        ...next,
        history: [...state.history, snapshot].slice(-HISTORY_LIMIT),
        future: [],
        revision: state.revision + 1,
      };
    }),
  select: (cardId) => set((state) => ({ selectedCardId: cardId, revision: state.revision + 1 })),
  logExport: (record) =>
    set((state) => ({
      exportHistory: [{ ...record, id: crypto.randomUUID(), date: Date.now() }, ...state.exportHistory].slice(0, 50),
      revision: state.revision + 1,
    })),
  undo: () =>
    set((state) => {
      const previous = state.history.at(-1);
      if (!previous) return state;
      return {
        ...previous,
        exportHistory: state.exportHistory,
        history: state.history.slice(0, -1),
        future: [toProject(state), ...state.future].slice(0, HISTORY_LIMIT),
        revision: state.revision + 1,
      };
    }),
  redo: () =>
    set((state) => {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...next,
        exportHistory: state.exportHistory,
        history: [...state.history, toProject(state)].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        revision: state.revision + 1,
      };
    }),
}));
