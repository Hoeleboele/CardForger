import { useEffect, useRef, useState } from "react";
import { Download, HardDrive, History, Keyboard, Loader2, RotateCcw, Save, Trash2, Type, Upload } from "lucide-react";
import type { FontAsset, ProjectSettings } from "../model";
import { familyFromFileName, fetchGoogleFont, readFileAsDataUrl, registerFonts } from "../fonts";
import { useWorkspace } from "../store";

const shortcuts: [string, string][] = [
  ["Ctrl + Z", "Undo (100 steps)"],
  ["Ctrl + Shift + Z / Ctrl + Y", "Redo"],
  ["Ctrl + S", "Save now"],
  ["Ctrl + K", "Search cards"],
  ["N", "New card"],
  ["Esc", "Close dialog / designer"],
  ["Designer · Ctrl + D", "Duplicate layers"],
  ["Designer · Ctrl + G", "Group / ungroup"],
  ["Designer · Arrows", "Nudge 1 px (Shift: 10 px)"],
  ["Designer · Space / H", "Pan the canvas"],
  ["Designer · + / − / 0", "Zoom in / out / fit"],
];

const formatBytes = (bytes: number) =>
  bytes > 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`;
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function SettingsView({
  notify,
  lastSaved,
  previousSession,
  onSaveNow,
  onRestorePrevious,
  onExportProject,
  onImportProject,
}: {
  notify: (message: string) => void;
  lastSaved?: number;
  previousSession?: number;
  onSaveNow: () => void;
  onRestorePrevious: () => void;
  onExportProject: () => void;
  onImportProject: (file: File) => void;
}) {
  const { settings, fonts, assets, cards, sets, decks, templates, update } = useWorkspace();
  const [googleFamily, setGoogleFamily] = useState("");
  const [loadingFont, setLoadingFont] = useState(false);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number; persisted: boolean }>();
  const fontInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      if (!navigator.storage?.estimate) return;
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const persisted = (await navigator.storage.persisted?.()) ?? false;
      setEstimate({ usage, quota, persisted });
    })();
  }, [cards, assets, fonts]);

  const setSettings = (patch: Partial<ProjectSettings>) =>
    update((project) => ({ ...project, settings: { ...project.settings, ...patch } }));
  const addFonts = async (additions: FontAsset[]) => {
    await registerFonts(additions);
    update((project) => ({ ...project, fonts: [...project.fonts, ...additions] }));
  };

  const uploadFonts = async (files: FileList) => {
    const accepted = [...files].filter((file) => /\.(ttf|otf|woff2?)$/i.test(file.name));
    if (!accepted.length) {
      notify("Choose .ttf, .otf, .woff or .woff2 font files");
      return;
    }
    const additions = await Promise.all(
      accepted.map(async (file) => ({
        id: `font-${crypto.randomUUID()}`,
        family: familyFromFileName(file.name),
        weight: /bold/i.test(file.name) ? "700" : "400",
        data: await readFileAsDataUrl(file),
        source: "upload" as const,
      })),
    );
    await addFonts(additions);
    notify(`${additions.length} font${additions.length === 1 ? "" : "s"} added`);
  };

  const addGoogleFont = async () => {
    const family = googleFamily.trim();
    if (!family) return;
    if (fonts.some((font) => font.family.toLowerCase() === family.toLowerCase())) {
      notify(`${family} is already installed`);
      return;
    }
    setLoadingFont(true);
    try {
      await addFonts(await fetchGoogleFont(family));
      setGoogleFamily("");
      notify(`${family} downloaded — it now works offline`);
    } catch {
      notify(navigator.onLine ? `Couldn't find “${family}” on Google Fonts` : "Connect to the internet once to download Google Fonts");
    } finally {
      setLoadingFont(false);
    }
  };

  const removeFamily = (family: string) =>
    update((project) => ({ ...project, fonts: project.fonts.filter((font) => font.family !== family) }));
  const families = [...new Set(fonts.map((font) => font.family))];

  const requestPersistence = async () => {
    const granted = (await navigator.storage?.persist?.()) ?? false;
    notify(granted ? "Storage is now protected from automatic cleanup" : "The browser declined persistent storage");
    setEstimate((current) => (current ? { ...current, persisted: granted } : current));
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> PREFERENCES</div>
          <h1>Settings</h1>
          <p className="page-subtitle">Your project belongs to you. Everything stays on this device.</p>
        </div>
      </div>
      <div className="settings-layout">
        <section className="settings-section settings-stack">
          <div>
            <h3>Project</h3>
            <p>Defaults used across the studio.</p>
          </div>
          <div className="settings-grid">
            <label className="field-label">Project name<input value={settings.projectName} onChange={(event) => setSettings({ projectName: event.target.value })} /></label>
            <label className="field-label">
              Default image format
              <select value={settings.defaultFormat} onChange={(event) => setSettings({ defaultFormat: event.target.value as ProjectSettings["defaultFormat"] })}>
                <option value="png">PNG</option><option value="jpg">JPG</option><option value="webp">WEBP</option>
              </select>
            </label>
            <label className="field-label">
              Default resolution
              <select value={settings.exportDpi} onChange={(event) => setSettings({ exportDpi: Number(event.target.value) as 300 | 600 })}>
                <option value={300}>300 DPI</option><option value={600}>600 DPI</option>
              </select>
            </label>
            <label className="field-label">
              Default card back
              <select value={settings.cardBackAssetId ?? ""} onChange={(event) => setSettings({ cardBackAssetId: event.target.value || undefined })}>
                <option value="">CardForge default</option>
                {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="settings-section">
          <div>
            <h3>Workspace backup</h3>
            <p>A .cardforge file contains templates, cards, sets, decks, assets, fonts and settings.</p>
          </div>
          <div className="settings-actions">
            <button className="button secondary" onClick={onExportProject}><Download size={15} /> Export project</button>
            <button className="button secondary" onClick={() => projectInput.current?.click()}><Upload size={15} /> Import project</button>
            <input
              ref={projectInput}
              type="file"
              accept=".cardforge,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onImportProject(file);
              }}
            />
          </div>
        </section>

        <section className="settings-section">
          <div>
            <h3>Autosave & recovery</h3>
            <p>
              Saved to this browser every 10 seconds, when you leave the tab, and on Ctrl+S.
              {lastSaved ? ` Last saved ${dateFormat.format(lastSaved)}.` : ""}
            </p>
          </div>
          <div className="settings-actions">
            <button className="button secondary" onClick={onSaveNow}><Save size={15} /> Save now</button>
            <button className="button secondary" disabled={!previousSession} onClick={onRestorePrevious} title={previousSession ? `Workspace as it was on ${dateFormat.format(previousSession)}` : "No earlier session yet"}>
              <RotateCcw size={15} /> Restore previous session
            </button>
          </div>
        </section>

        <section className="settings-section settings-stack">
          <div>
            <h3><Type size={14} /> Fonts</h3>
            <p>Upload font files or download Google Fonts once — both are embedded in the project and work offline.</p>
          </div>
          <div className="font-tools">
            <button className="button secondary" onClick={() => fontInput.current?.click()}><Upload size={15} /> Upload fonts</button>
            <input
              ref={fontInput}
              type="file"
              accept=".ttf,.otf,.woff,.woff2"
              multiple
              hidden
              onChange={(event) => {
                if (event.target.files) void uploadFonts(event.target.files);
                event.target.value = "";
              }}
            />
            <form
              className="google-font-form"
              onSubmit={(event) => {
                event.preventDefault();
                void addGoogleFont();
              }}
            >
              <input placeholder="Google Font family, e.g. Cinzel" value={googleFamily} onChange={(event) => setGoogleFamily(event.target.value)} />
              <button className="button secondary" disabled={loadingFont || !googleFamily.trim()}>
                {loadingFont ? <Loader2 size={15} className="spin" /> : <Download size={15} />} Add
              </button>
            </form>
          </div>
          {families.length ? (
            <ul className="font-list">
              {families.map((family) => {
                const entries = fonts.filter((font) => font.family === family);
                return (
                  <li key={family}>
                    <span className="font-sample" style={{ fontFamily: `"${family}"` }}>{family}</span>
                    <small>{entries.map((font) => font.weight).join(" · ")} · {entries[0].source === "google" ? "Google Fonts" : "Uploaded"}</small>
                    <button className="tiny-menu" title={`Remove ${family}`} onClick={() => removeFamily(family)}><Trash2 size={13} /></button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="settings-empty">No custom fonts yet. System fonts are always available.</p>
          )}
        </section>

        <section className="settings-section">
          <div>
            <h3><HardDrive size={14} /> Storage</h3>
            <p>
              {cards.length.toLocaleString()} cards · {sets.length} sets · {decks.length} decks · {templates.length} templates · {assets.length} assets
              {estimate ? ` · ${formatBytes(estimate.usage)} used of ${formatBytes(estimate.quota)}` : ""}
            </p>
          </div>
          <div className="settings-actions">
            {estimate?.persisted ? (
              <span className="setting-status"><span className="online-dot" /> Protected storage</span>
            ) : (
              <button className="button secondary" onClick={() => void requestPersistence()}><History size={15} /> Protect from cleanup</button>
            )}
          </div>
        </section>

        <section className="settings-section settings-stack">
          <div>
            <h3><Keyboard size={14} /> Keyboard shortcuts</h3>
          </div>
          <dl className="shortcut-list">
            {shortcuts.map(([keys, action]) => (
              <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{action}</dd></div>
            ))}
          </dl>
        </section>
      </div>
    </>
  );
}
