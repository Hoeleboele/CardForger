import { openDB } from 'idb'
import { normalizeProject, type Project } from './model'

const database = openDB('cardforge-studio', 1, {
  upgrade(db) {
    db.createObjectStore('workspace')
  },
})

const SESSION_KEY = 'cardforge-session-open'
const SAVED_AT_KEY = 'cardforge-last-saved'

export async function loadProject(): Promise<Project | undefined> {
  const project = await (await database).get('workspace', 'project')
  return project ? normalizeProject(project) : undefined
}

export async function saveProject(project: Project): Promise<void> {
  await (await database).put('workspace', project, 'project')
  localStorage.setItem(SAVED_AT_KEY, String(Date.now()))
}

/** Keeps a copy of the workspace as it was at the end of the last session. */
export async function savePreviousSession(project: Project, savedAt: number): Promise<void> {
  await (await database).put('workspace', { project, savedAt }, 'previous-session')
}

export async function loadPreviousSession(): Promise<{ project: Project; savedAt: number } | undefined> {
  const entry = await (await database).get('workspace', 'previous-session')
  return entry ? { project: normalizeProject(entry.project), savedAt: entry.savedAt } : undefined
}

export const lastSavedAt = () => Number(localStorage.getItem(SAVED_AT_KEY)) || undefined

let sessionCrashed: boolean | undefined

/** Returns true when the previous session never closed cleanly. Safe to call more than once. */
export function beginSession(): boolean {
  if (sessionCrashed !== undefined) return sessionCrashed
  sessionCrashed = localStorage.getItem(SESSION_KEY) === 'true'
  localStorage.setItem(SESSION_KEY, 'true')
  return sessionCrashed
}

export function endSession() {
  localStorage.setItem(SESSION_KEY, 'false')
}