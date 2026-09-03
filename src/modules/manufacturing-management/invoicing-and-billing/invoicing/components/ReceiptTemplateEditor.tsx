"use client";

import { ChangeEvent, MouseEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Loader2, Move, Save, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { normalizeReceiptTemplate } from "../receipt-template";
import { receiptBackgroundUrl, saveReceiptTemplate, uploadReceiptBackground } from "../services/invoicing-api";
import { ORFieldConfig, ORTemplate } from "../types";

export default function ReceiptTemplateEditor({ receiptTypeId, initialTemplate, onClose, onSave }: { receiptTypeId: number; initialTemplate: ORTemplate; onClose: () => void; onSave: (template: ORTemplate) => void }) {
    const [template, setTemplate] = useState(() => normalizeReceiptTemplate(initialTemplate));
    const [selected, setSelected] = useState("customer_name");
    const [zoom, setZoom] = useState(0.8);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const canvas = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        queueMicrotask(() => {
            if (!cancelled) setTemplate(normalizeReceiptTemplate(initialTemplate));
        });
        return () => { cancelled = true; };
    }, [initialTemplate]);

    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = previous; };
    }, []);

    const updateField = (key: string, patch: Partial<ORFieldConfig>) => setTemplate(current => ({ ...current, fields: { ...current.fields, [key]: { ...current.fields[key], ...patch } } }));

    const drag = (key: string, event: MouseEvent) => {
        if (!canvas.current) return;
        event.preventDefault();
        setSelected(key);
        const box = canvas.current.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const start = template.fields[key];
        const move = (next: globalThis.MouseEvent) => updateField(key, {
            x: Math.max(0, Math.min(template.width, start.x + (next.clientX - startX) * template.width / box.width)),
            y: Math.max(0, Math.min(template.height, start.y + (next.clientY - startY) * template.height / box.height)),
        });
        const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
    };

    const upload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const id = await uploadReceiptBackground(file);
            setTemplate(current => ({ ...current, backgroundImage: id }));
            toast.success("Receipt background uploaded");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const save = async () => {
        setSaving(true);
        try {
            const saved = await saveReceiptTemplate(receiptTypeId, template);
            onSave(normalizeReceiptTemplate(saved));
            toast.success("Receipt layout saved");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Save failed");
        } finally {
            setSaving(false);
        }
    };

    const active = template.fields[selected];
    return createPortal(<div className="fixed inset-0 z-[9999] flex flex-col bg-background">
        <header className="flex items-center justify-between border-b px-5 py-3"><div><h2 className="text-sm font-black uppercase">Receipt Layout Editor</h2><p className="text-[10px] text-muted-foreground">Coordinates and dimensions are stored in millimetres.</p></div><div className="flex gap-2"><button onClick={() => setZoom(value => Math.max(0.3, value - 0.1))} className="rounded-lg border px-3 py-1 text-xs">-</button><span className="self-center text-xs font-bold">{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(value => Math.min(1.5, value + 0.1))} className="rounded-lg border px-3 py-1 text-xs">+</button><button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save</button><button onClick={onClose} aria-label="Close editor" className="rounded-lg border p-2"><X className="h-4 w-4" /></button></div></header>
        <div className="flex min-h-0 flex-1">
            <aside className="w-80 shrink-0 space-y-5 overflow-y-auto border-r p-4 text-xs">
                <section className="space-y-2"><h3 className="font-black uppercase">Page</h3><div className="grid grid-cols-2 gap-2"><NumberInput label="Width" value={template.width} onChange={width => setTemplate(current => ({ ...current, width }))} /><NumberInput label="Height" value={template.height} onChange={height => setTemplate(current => ({ ...current, height }))} /></div><div className="flex gap-2"><button onClick={() => setTemplate(current => ({ ...current, width: 215.9, height: 279.4 }))} className="flex-1 rounded border py-1">Letter</button><button onClick={() => setTemplate(current => ({ ...current, width: 210, height: 297 }))} className="flex-1 rounded border py-1">A4</button></div><label className="flex cursor-pointer items-center justify-center gap-2 rounded border py-2">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Upload form scan<input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} className="hidden" /></label>{template.backgroundImage ? <button onClick={() => setTemplate(current => ({ ...current, backgroundImage: undefined }))} className="w-full rounded border border-destructive/40 py-1 text-destructive">Remove background</button> : null}</section>
                <section className="space-y-2"><h3 className="font-black uppercase">Fields</h3>{Object.entries(template.fields).map(([key, field]) => <button key={key} onClick={() => setSelected(key)} className={`flex w-full items-center justify-between rounded border px-2 py-1.5 text-left ${selected === key ? "border-primary bg-primary/10" : ""}`}><span>{field.label || key}</span><Move className="h-3 w-3" /></button>)}</section>
                {active ? <section className="space-y-2"><h3 className="font-black uppercase">Selected Field</h3><div className="grid grid-cols-2 gap-2"><NumberInput label="X" value={active.x} onChange={x => updateField(selected, { x })} /><NumberInput label="Y" value={active.y} onChange={y => updateField(selected, { y })} /><NumberInput label="Font" value={active.fontSize || 10} onChange={fontSize => updateField(selected, { fontSize })} /><NumberInput label="Max width" value={active.maxWidth || 0} onChange={maxWidth => updateField(selected, { maxWidth: maxWidth || undefined })} /></div><label className="flex gap-2"><input type="checkbox" checked={!!active.hidden} onChange={event => updateField(selected, { hidden: event.target.checked })} />Hidden</label></section> : null}
                <section className="space-y-2"><h3 className="font-black uppercase">Table</h3><div className="grid grid-cols-2 gap-2"><NumberInput label="Start Y" value={template.tableSettings.startY} onChange={startY => setTemplate(current => ({ ...current, tableSettings: { ...current.tableSettings, startY } }))} /><NumberInput label="Row height" value={template.tableSettings.rowHeight} onChange={rowHeight => setTemplate(current => ({ ...current, tableSettings: { ...current.tableSettings, rowHeight } }))} /><NumberInput label="Font" value={template.tableSettings.fontSize} onChange={fontSize => setTemplate(current => ({ ...current, tableSettings: { ...current.tableSettings, fontSize } }))} /><NumberInput label="Description width" value={template.tableSettings.product_name_width || 65} onChange={product_name_width => setTemplate(current => ({ ...current, tableSettings: { ...current.tableSettings, product_name_width } }))} /></div>{Object.entries(template.tableSettings.columns || {}).map(([key, column]) => <NumberInput key={key} label={`${key} X`} value={column?.x || 0} onChange={x => setTemplate(current => ({ ...current, tableSettings: { ...current.tableSettings, columns: { ...current.tableSettings.columns, [key]: { x } } } }))} />)}</section>
            </aside>
            <main className="flex-1 overflow-auto bg-muted/50 p-12"><div className="mx-auto origin-top" style={{ width: `${template.width * zoom}mm`, height: `${template.height * zoom}mm` }}><div ref={canvas} className="relative overflow-hidden bg-white text-black shadow-2xl" style={{ width: `${template.width}mm`, height: `${template.height}mm`, transform: `scale(${zoom})`, transformOrigin: "top left" }}>{template.backgroundImage ? <Image src={receiptBackgroundUrl(template.backgroundImage)} alt="Receipt form" fill unoptimized className="pointer-events-none object-fill opacity-70" /> : null}{Object.entries(template.fields).map(([key, field]) => field.hidden ? null : <button key={key} onMouseDown={event => drag(key, event)} className={`absolute cursor-move whitespace-nowrap border border-dashed px-0.5 font-mono ${selected === key ? "border-primary bg-primary/10" : "border-zinc-400 bg-white/70"}`} style={{ left: `${field.x}mm`, top: `${field.y}mm`, fontSize: `${field.fontSize || 10}pt` }}>{field.label || key}</button>)}<div className="absolute left-0 right-0 border-t-2 border-dashed border-red-500" style={{ top: `${template.tableSettings.startY}mm` }}><span className="bg-red-500 px-1 text-[8px] text-white">TABLE START</span></div></div></div></main>
        </div>
    </div>, document.body);
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
    return <label className="block space-y-1"><span className="text-[9px] font-bold uppercase text-muted-foreground">{label}</span><input type="number" step="0.1" value={Number(value.toFixed(2))} onChange={event => onChange(Number(event.target.value))} className="w-full rounded border bg-background px-2 py-1" /></label>;
}
