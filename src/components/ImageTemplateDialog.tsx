import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Modal } from "./BulkDialogs";
import { readFileAsDataUrl } from "../fonts";
import { useWorkspace } from "../store";
import { CARD_HEIGHT, CARD_WIDTH } from "../render";
import {
  analyzeFrame,
  buildTemplateFromImage,
  CARD_RATIO,
  createRegion,
  cropToCanvas,
  defaultCrop,
  iconVariantField,
  isIconRole,
  regionRoles,
  roleLabel,
  type CropRect,
  type Region,
  type RegionRole,
} from "../imageTemplate";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const IMAGE_TYPES = /^image\/(png|jpeg|webp)$/;
const ICON_TYPES = /^image\/(png|jpeg|webp|svg\+xml)$/;
const CROP_VIEW = { width: 520, height: 420 };
const REVIEW_SCALE = 300 / CARD_WIDTH;

type Step = "upload" | "crop" | "review";
type Source = { image: HTMLImageElement; url: string };
type Frame = { data: string; size: number; hasTransparency: boolean };

function startDrag(event: ReactPointerEvent, onMove: (dx: number, dy: number) => void) {
  event.preventDefault();
  event.stopPropagation();
  const startX = event.clientX;
  const startY = event.clientY;
  const move = (moveEvent: PointerEvent) => onMove(moveEvent.clientX - startX, moveEvent.clientY - startY);
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

async function loadImage(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

export function ImageTemplateDialog({
  onClose,
  onCreated,
  notify,
}: {
  onClose: () => void;
  onCreated: (templateId: string) => void;
  notify: (message: string) => void;
}) {
  const { cards, sets, update } = useWorkspace();
  const [step, setStep] = useState<Step>("upload");
  const [name, setName] = useState("");
  const [source, setSource] = useState<Source>();
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 1, height: 1 });
  const [frame, setFrame] = useState<Frame>();
  const [regions, setRegions] = useState<Region[]>([]);
  const [transparentWindow, setTransparentWindow] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const variantValues = useMemo(
    () => ({
      Rarity: unique(["Common", "Uncommon", "Rare", "Legendary", ...cards.map((card) => card.rarity)]),
      Type: unique(["Creature", "Spell", "Relic", "Token", "Location", ...cards.map((card) => card.type)]),
      Set: unique(sets.map((set) => set.name)),
    }),
    [cards, sets],
  );

  const openFile = async (file?: File) => {
    if (!file) return;
    setError("");
    if (!IMAGE_TYPES.test(file.type)) return setError("Use a PNG, JPG or WEBP image.");
    if (file.size > MAX_FILE_SIZE) return setError("That image is larger than 25 MB.");
    try {
      const url = await readFileAsDataUrl(file);
      const image = await loadImage(url);
      setSource({ image, url });
      setCrop(defaultCrop(image.naturalWidth, image.naturalHeight));
      if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, ""));
      setStep("crop");
    } catch {
      setError("That image could not be opened.");
    }
  };

  const runDetection = () => {
    if (!source) return;
    setBusy(true);
    // Let the busy state paint before the synchronous pixel work.
    window.setTimeout(() => {
      try {
        const canvas = cropToCanvas(source.image, crop);
        const analysis = analyzeFrame(canvas);
        const data = analysis.hasTransparency ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.92);
        setFrame({ data, size: Math.round((data.length * 3) / 4), hasTransparency: analysis.hasTransparency });
        setRegions(analysis.regions);
        setTransparentWindow(analysis.transparentWindow);
        setSelectedId(undefined);
        setStep("review");
      } catch {
        setError("The image could not be analysed.");
      } finally {
        setBusy(false);
      }
    }, 20);
  };

  const patchRegion = (id: string, patch: Partial<Region>) =>
    setRegions((current) => current.map((region) => (region.id === id ? { ...region, ...patch } : region)));

  const uploadIcon = async (region: Region, value: string, file?: File) => {
    if (!file) return;
    if (!ICON_TYPES.test(file.type) || file.size > MAX_FILE_SIZE) {
      notify("Icons must be PNG, JPG, WEBP or SVG under 25 MB");
      return;
    }
    const data = await readFileAsDataUrl(file);
    setRegions((current) =>
      current.map((item) =>
        item.id === region.id ? { ...item, icons: { ...item.icons, [value]: { data, name: file.name, size: file.size } } } : item,
      ),
    );
  };

  const removeIcon = (region: Region, value: string) => {
    const icons = { ...region.icons };
    delete icons[value];
    patchRegion(region.id, { icons });
  };

  const create = () => {
    if (!frame || !name.trim()) return;
    const { template, assets } = buildTemplateFromImage({
      name: name.trim(),
      frameData: frame.data,
      frameSize: frame.size,
      regions,
      transparentWindow,
      variantValues,
    });
    update((project) => ({
      ...project,
      templates: [...project.templates, template],
      assets: [...assets, ...project.assets],
    }));
    notify("Template created from image");
    onCreated(template.id);
  };

  const selected = regions.find((region) => region.id === selectedId);

  return (
    <Modal kicker="NEW TEMPLATE" title="Create template from image" onClose={onClose} wide>
      <div className="dialog-body image-template">
        <ol className="image-template-steps">
          {(["upload", "crop", "review"] as Step[]).map((item, index) => (
            <li key={item} className={step === item ? "active" : ""}>
              {index + 1}. {item === "upload" ? "Upload" : item === "crop" ? "Crop" : "Review regions"}
            </li>
          ))}
        </ol>

        {step === "upload" && (
          <>
            <label className="field-label">
              Template name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Ember frame" />
            </label>
            <label
              className={`image-template-drop ${dragging ? "is-dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void openFile(event.dataTransfer.files[0]);
              }}
            >
              <ImagePlus size={26} />
              <strong>Drop a blank card frame here</strong>
              <span>or click to choose a PNG, JPG or WEBP · frames with a transparent art window work best</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void openFile(event.target.files?.[0])} />
            </label>
          </>
        )}

        {step === "crop" && source && (
          <CropStep image={source.image} url={source.url} crop={crop} onChange={setCrop} />
        )}

        {step === "review" && frame && (
          <div className="image-template-review">
            <div className="image-template-canvas" style={{ width: CARD_WIDTH * REVIEW_SCALE, height: CARD_HEIGHT * REVIEW_SCALE }}>
              <img src={frame.data} alt="Cropped card frame" draggable={false} />
              {regions.map((region, index) => (
                <div
                  key={region.id}
                  className={`image-template-region role-${region.role} ${region.enabled ? "" : "is-disabled"} ${region.id === selectedId ? "is-selected" : ""}`}
                  style={{
                    left: region.x * REVIEW_SCALE,
                    top: region.y * REVIEW_SCALE,
                    width: region.width * REVIEW_SCALE,
                    height: region.height * REVIEW_SCALE,
                  }}
                  onPointerDown={(event) => {
                    setSelectedId(region.id);
                    const start = { x: region.x, y: region.y };
                    startDrag(event, (dx, dy) =>
                      patchRegion(region.id, {
                        x: Math.round(clamp(start.x + dx / REVIEW_SCALE, 0, CARD_WIDTH - region.width)),
                        y: Math.round(clamp(start.y + dy / REVIEW_SCALE, 0, CARD_HEIGHT - region.height)),
                      }),
                    );
                  }}
                  title={roleLabel(region.role)}
                >
                  <span>{index + 1}</span>
                  <i
                    className="image-template-handle"
                    onPointerDown={(event) => {
                      setSelectedId(region.id);
                      const start = { width: region.width, height: region.height };
                      startDrag(event, (dx, dy) =>
                        patchRegion(region.id, {
                          width: Math.round(clamp(start.width + dx / REVIEW_SCALE, 8, CARD_WIDTH - region.x)),
                          height: Math.round(clamp(start.height + dy / REVIEW_SCALE, 8, CARD_HEIGHT - region.y)),
                        }),
                      );
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="image-template-side">
              <label className="check-row" title={frame.hasTransparency ? "" : "This image has no transparent pixels"}>
                <input
                  type="checkbox"
                  checked={transparentWindow}
                  disabled={!frame.hasTransparency}
                  onChange={(event) => setTransparentWindow(event.target.checked)}
                />
                Artwork goes under the frame (transparent art window)
              </label>
              <ul className="image-template-list">
                {regions.map((region, index) => (
                  <li key={region.id} className={region.id === selectedId ? "is-selected" : ""} onClick={() => setSelectedId(region.id)}>
                    <input
                      type="checkbox"
                      checked={region.enabled}
                      onChange={(event) => patchRegion(region.id, { enabled: event.target.checked })}
                      aria-label="Include region"
                    />
                    <b>{index + 1}</b>
                    <select
                      value={region.role}
                      onChange={(event) => patchRegion(region.id, { role: event.target.value as RegionRole, icons: {} })}
                      aria-label="Region role"
                    >
                      {regionRoles.map((item) => (
                        <option key={item.role} value={item.role}>{item.label}</option>
                      ))}
                    </select>
                    {!region.detected && <small>default</small>}
                    <button
                      className="tiny-menu"
                      title="Remove region"
                      onClick={(event) => {
                        event.stopPropagation();
                        setRegions((current) => current.filter((item) => item.id !== region.id));
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                className="button secondary small-button"
                onClick={() => {
                  const region = createRegion("icon");
                  setRegions((current) => [...current, region]);
                  setSelectedId(region.id);
                }}
              >
                <Plus size={13} /> Add box
              </button>

              {selected && isIconRole(selected.role) && (
                <IconUploads
                  region={selected}
                  values={(() => {
                    const field = iconVariantField(selected.role);
                    return field ? variantValues[field] : [""];
                  })()}
                  onUpload={(value, file) => void uploadIcon(selected, value, file)}
                  onRemove={(value) => removeIcon(selected, value)}
                />
              )}
              <p className="dialog-summary">
                Drag boxes to move them, use the corner to resize. Everything can be fine-tuned later in the designer.
              </p>
            </div>
          </div>
        )}

        {error && <p className="dialog-warning">{error}</p>}
      </div>
      <div className="modal-footer">
        {step !== "upload" && (
          <button className="button secondary" onClick={() => setStep(step === "review" ? "crop" : "upload")}>
            <ArrowLeft size={14} /> Back
          </button>
        )}
        <button className="button secondary" onClick={onClose}>Cancel</button>
        {step === "crop" && (
          <button className="button primary" onClick={runDetection} disabled={busy}>
            {busy ? "Detecting…" : <>Detect regions <ArrowRight size={14} /></>}
          </button>
        )}
        {step === "review" && (
          <button className="button primary" onClick={create} disabled={!name.trim()}>
            <Sparkles size={14} /> Create template
          </button>
        )}
      </div>
    </Modal>
  );
}

function CropStep({
  image,
  url,
  crop,
  onChange,
}: {
  image: HTMLImageElement;
  url: string;
  crop: CropRect;
  onChange: (crop: CropRect) => void;
}) {
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  const scale = Math.min(CROP_VIEW.width / naturalWidth, CROP_VIEW.height / naturalHeight);
  const maxWidth = Math.min(naturalWidth, naturalHeight * CARD_RATIO);
  const minWidth = Math.min(maxWidth, 40);

  const resize = (width: number, anchor: { x: number; y: number }) => {
    const nextWidth = clamp(width, minWidth, maxWidth);
    const nextHeight = nextWidth / CARD_RATIO;
    onChange({
      width: nextWidth,
      height: nextHeight,
      x: clamp(anchor.x, 0, naturalWidth - nextWidth),
      y: clamp(anchor.y, 0, naturalHeight - nextHeight),
    });
  };

  return (
    <div className="image-template-crop">
      <div className="image-template-crop-view" style={{ width: naturalWidth * scale, height: naturalHeight * scale }}>
        <img src={url} alt="Uploaded card" draggable={false} />
        <div
          className="image-template-crop-rect"
          style={{ left: crop.x * scale, top: crop.y * scale, width: crop.width * scale, height: crop.height * scale }}
          onPointerDown={(event) => {
            const start = crop;
            startDrag(event, (dx, dy) =>
              onChange({
                ...start,
                x: clamp(start.x + dx / scale, 0, naturalWidth - start.width),
                y: clamp(start.y + dy / scale, 0, naturalHeight - start.height),
              }),
            );
          }}
        >
          <i
            className="image-template-handle"
            onPointerDown={(event) => {
              const start = crop;
              startDrag(event, (dx) => {
                const width = clamp(start.width + dx / scale, minWidth, Math.min(naturalWidth - start.x, (naturalHeight - start.y) * CARD_RATIO));
                onChange({ ...start, width, height: width / CARD_RATIO });
              });
            }}
          />
        </div>
      </div>
      <div className="image-template-crop-tools">
        <label className="field-label">
          Zoom
          <input
            type="range"
            min={minWidth}
            max={maxWidth}
            step="any"
            value={clamp(crop.width, minWidth, maxWidth)}
            onChange={(event) => {
              const width = Number(event.target.value);
              const center = { x: crop.x + crop.width / 2, y: crop.y + crop.height / 2 };
              resize(width, { x: center.x - width / 2, y: center.y - width / CARD_RATIO / 2 });
            }}
          />
        </label>
        <button className="button secondary small-button" onClick={() => onChange(defaultCrop(naturalWidth, naturalHeight))}>
          Fit
        </button>
        <p className="dialog-summary">
          The crop is locked to the card shape (5 × 7). Image: {naturalWidth} × {naturalHeight}px.
        </p>
      </div>
    </div>
  );
}

function IconUploads({
  region,
  values,
  onUpload,
  onRemove,
}: {
  region: Region;
  values: string[];
  onUpload: (value: string, file?: File) => void;
  onRemove: (value: string) => void;
}) {
  const field = iconVariantField(region.role);
  return (
    <div className="image-template-icons">
      <strong>{field ? `${roleLabel(region.role)} per ${field.toLowerCase()}` : "Icon"}</strong>
      {field && !values.length && <p className="dialog-summary">No {field.toLowerCase()} values exist yet.</p>}
      {values.map((value) => {
        const upload = region.icons[value];
        return (
          <div className="image-template-icon-row" key={value || "single"}>
            <span>{value || "Image"}</span>
            {upload ? (
              <>
                <img src={upload.data} alt="" />
                <button className="tiny-menu" title="Remove icon" onClick={() => onRemove(value)}><X size={13} /></button>
              </>
            ) : (
              <label className="button secondary small-button">
                <Upload size={12} /> Upload
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  hidden
                  onChange={(event) => {
                    onUpload(value, event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        );
      })}
      <p className="dialog-summary">
        {field ? `Each card shows the icon matching its ${field.toLowerCase()}. ` : ""}
        Boxes without uploads get a placeholder icon.
      </p>
    </div>
  );
}
