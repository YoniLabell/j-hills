"use client";

import { ArrowDown, ArrowUp, GripVertical, ImagePlus, LoaderCircle, Star, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { adminFetch, json } from "@/lib/admin-api";
import type { AdminImage } from "@/lib/admin-types";
import { imageUrl } from "@/lib/images";

import { Card, Notice, inputClass } from "./ui";

const MAX_MB = 10;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

type Pending = { id: string; file: File; preview: string; status: "waiting" | "uploading" | "error"; error?: string };

export default function ImageManager({ apartmentId, initial, onChange }: { apartmentId: number; initial: AdminImage[]; onChange?: (images: AdminImage[]) => void }) {
  const [images, setImages] = useState<AdminImage[]>(() => [...initial].sort((a, b) => a.sort_order - b.sort_order));
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);

  const update = (next: AdminImage[]) => {
    setImages(next);
    onChange?.(next);
  };

  async function reload() {
    const apt = await adminFetch<{ images: AdminImage[] }>(`/apartments/${apartmentId}`);
    update([...apt.images].sort((a, b) => a.sort_order - b.sort_order));
  }

  function addFiles(files: FileList | File[]) {
    setError("");
    const accepted: Pending[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(files)) {
      if (!TYPES.includes(file.type)) rejected.push(`${file.name}: only JPEG, PNG or WebP`);
      else if (file.size > MAX_MB * 1024 * 1024) rejected.push(`${file.name}: larger than ${MAX_MB} MB`);
      else accepted.push({ id: `${file.name}-${file.size}-${Math.random()}`, file, preview: URL.createObjectURL(file), status: "waiting" });
    }
    if (rejected.length) setError(rejected.join(" · "));
    setPending((p) => [...p, ...accepted]);
  }

  // Upload queued files one at a time (keeps each request small and shows progress per photo).
  useEffect(() => {
    if (uploading.current) return;
    const next = pending.find((p) => p.status === "waiting");
    if (!next) return;
    uploading.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending((list) => list.map((p) => (p.id === next.id ? { ...p, status: "uploading" } : p)));
    const body = new FormData();
    body.append("files", next.file);
    adminFetch<AdminImage[]>(`/apartments/${apartmentId}/images`, { method: "POST", body })
      .then(async () => {
        URL.revokeObjectURL(next.preview);
        setPending((list) => list.filter((p) => p.id !== next.id));
        await reload();
      })
      .catch((e: Error) => setPending((list) => list.map((p) => (p.id === next.id ? { ...p, status: "error", error: e.message } : p))))
      .finally(() => {
        uploading.current = false;
        setPending((list) => [...list]); // trigger the next upload
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, apartmentId]);

  async function saveOrder(next: AdminImage[]) {
    update(next);
    try {
      await adminFetch(`/apartments/${apartmentId}/images/order`, { method: "PUT", body: json({ image_ids: next.map((i) => i.id) }) });
    } catch (e) {
      setError((e as Error).message);
      await reload();
    }
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    saveOrder(next);
  }

  function dropOn(targetId: number) {
    if (dragId === null || dragId === targetId) return;
    const next = [...images];
    const from = next.findIndex((i) => i.id === dragId);
    const to = next.findIndex((i) => i.id === targetId);
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDragId(null);
    saveOrder(next);
  }

  async function setCover(id: number) {
    try {
      await adminFetch(`/images/${id}`, { method: "PATCH", body: json({ is_cover: true }) });
      update(images.map((i) => ({ ...i, is_cover: i.id === id })));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveAlt(id: number, alt_text: string) {
    try {
      await adminFetch(`/images/${id}`, { method: "PATCH", body: json({ alt_text }) });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this photo? It will also be removed from Cloudinary.")) return;
    try {
      await adminFetch(`/images/${id}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card title={`Photos (${images.length})`}>
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${dragOver ? "border-gold-500 bg-gold-500/5" : "border-ink-900/15"}`}
      >
        <ImagePlus className="h-8 w-8 text-gold-600" aria-hidden="true" />
        <p className="mt-2 text-sm font-medium">Drag & drop photos here</p>
        <p className="text-xs text-ink-500">JPEG, PNG or WebP · up to {MAX_MB} MB each · several at once</p>
        <button type="button" onClick={() => inputRef.current?.click()} className="mt-3 rounded-lg border border-ink-900/15 bg-white px-3 py-1.5 text-sm font-semibold hover:border-gold-500">
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {error && <div className="mt-3"><Notice>{error}</Notice></div>}

      {pending.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {pending.map((p) => (
            <li key={p.id} className="relative overflow-hidden rounded-lg ring-1 ring-ink-900/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" className="aspect-[4/3] w-full object-cover opacity-60" />
              <div className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs font-semibold">
                {p.status === "error" ? (
                  <span className="rounded bg-red-50 px-2 py-1 text-red-700">{p.error}</span>
                ) : (
                  <span className="flex items-center gap-1 rounded bg-white/90 px-2 py-1">
                    <LoaderCircle className="h-3 w-3 animate-spin" /> {p.status === "uploading" ? "Uploading…" : "Waiting…"}
                  </span>
                )}
              </div>
              {p.status === "error" && (
                <button type="button" onClick={() => setPending((l) => l.filter((x) => x.id !== p.id))} className="absolute end-1 top-1 rounded bg-white px-1.5 text-xs">×</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {images.length > 0 && (
        <>
          <p className="mt-5 text-xs text-ink-500">Drag photos to reorder (or use the arrows). The cover photo is shown on cards and in search results.</p>
          <ul className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((img, index) => (
              <li
                key={img.id}
                draggable
                onDragStart={() => setDragId(img.id)}
                onDragOver={(e) => dragId !== null && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  dropOn(img.id);
                }}
                className={`overflow-hidden rounded-xl bg-white ring-1 transition ${img.is_cover ? "ring-2 ring-gold-500" : "ring-ink-900/10"} ${dragId === img.id ? "opacity-50" : ""}`}
              >
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl(img.url, 600)} alt={img.alt_text} className="aspect-[4/3] w-full cursor-move object-cover" />
                  <span className="absolute start-2 top-2 rounded bg-white/90 p-1 text-ink-500"><GripVertical className="h-4 w-4" aria-hidden="true" /></span>
                  {img.is_cover && <span className="absolute end-2 top-2 rounded-full bg-gold-500 px-2 py-0.5 text-xs font-semibold text-white">Cover</span>}
                </div>
                <div className="space-y-2 p-3">
                  <input
                    defaultValue={img.alt_text}
                    maxLength={300}
                    onBlur={(e) => e.target.value !== img.alt_text && saveAlt(img.id, e.target.value)}
                    className={inputClass}
                    placeholder="Alt text (describe the photo)"
                    aria-label="Alt text"
                  />
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="rounded p-1.5 hover:bg-sand-100 disabled:opacity-30" aria-label="Move earlier"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" onClick={() => move(index, 1)} disabled={index === images.length - 1} className="rounded p-1.5 hover:bg-sand-100 disabled:opacity-30" aria-label="Move later"><ArrowDown className="h-4 w-4" /></button>
                    {!img.is_cover && (
                      <button type="button" onClick={() => setCover(img.id)} className="ms-1 inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold hover:bg-sand-100">
                        <Star className="h-3.5 w-3.5" /> Make cover
                      </button>
                    )}
                    <button type="button" onClick={() => remove(img.id)} className="ms-auto rounded p-1.5 text-terracotta-600 hover:bg-red-50" aria-label="Delete photo"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
