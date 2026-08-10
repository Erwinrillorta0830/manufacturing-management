import React, { useState, useEffect } from "react";
import { Supplier } from "../types";
import { motion, AnimatePresence } from "framer-motion";
import { Award, Star, CheckCircle2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

export interface SupplierEvaluation {
    supplier_id: number;
    delivery_rating: number; // 1 to 5
    quality_rating: number; // 1 to 5
    price_rating: number; // 1 to 5
    compliance_rating: number; // 1 to 5
    overall_score: number; // calculated percentage 0-100%
    grade: "A+" | "A" | "B" | "C" | "F";
    feedback_notes: string;
    evaluated_at: string;
}

export interface SupplierEvaluationModalProps {
    isOpen: boolean;
    onClose: () => void;
    supplier: Supplier | null;
    onSaveEvaluation?: (evaluation: SupplierEvaluation) => void;
}

export default function SupplierEvaluationModal({
    isOpen,
    onClose,
    supplier,
    onSaveEvaluation
}: SupplierEvaluationModalProps) {
    const [deliveryRating, setDeliveryRating] = useState(5);
    const [qualityRating, setQualityRating] = useState(5);
    const [priceRating, setPriceRating] = useState(4);
    const [complianceRating, setComplianceRating] = useState(5);
    const [notes, setNotes] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setDeliveryRating(5);
            setQualityRating(5);
            setPriceRating(4);
            setComplianceRating(5);
            setNotes("");
        }
    }, [isOpen]);

    if (!supplier) return null;

    const calculateScore = () => {
        const avg = (deliveryRating + qualityRating + priceRating + complianceRating) / 4;
        const percentage = Math.round((avg / 5) * 100);
        let grade: "A+" | "A" | "B" | "C" | "F" = "F";
        if (percentage >= 95) grade = "A+";
        else if (percentage >= 85) grade = "A";
        else if (percentage >= 70) grade = "B";
        else if (percentage >= 50) grade = "C";
        return { percentage, grade };
    };

    const { percentage: overallScore, grade } = calculateScore();

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const evalData: SupplierEvaluation = {
                supplier_id: supplier.id,
                delivery_rating: deliveryRating,
                quality_rating: qualityRating,
                price_rating: priceRating,
                compliance_rating: complianceRating,
                overall_score: overallScore,
                grade,
                feedback_notes: notes,
                evaluated_at: new Date().toISOString()
            };

            if (onSaveEvaluation) {
                await onSaveEvaluation(evalData);
            }
            toast.success(`Performance evaluation for ${supplier.supplier_name} saved (Grade: ${grade})`);
            onClose();
        } catch (err) {
            console.error(err);
            toast.error("Failed to save supplier evaluation");
        } finally {
            setIsSaving(false);
        }
    };

    const renderStarSelector = (label: string, value: number, onChange: (val: number) => void) => (
        <div className="flex items-center justify-between p-3 border rounded-xl bg-muted/20">
            <span className="text-xs font-semibold text-foreground">{label}</span>
            <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        type="button"
                        onClick={() => onChange(star)}
                        className={`p-1 rounded transition-colors ${
                            star <= value ? "text-amber-500 fill-amber-500" : "text-muted-foreground/40 hover:text-amber-400"
                        }`}
                    >
                        <Star className="h-4 w-4 fill-current" />
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
                >
                    <motion.div
                        initial={{ scale: 0.95, y: 15 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 15 }}
                        transition={{ type: "spring", duration: 0.3 }}
                        className="bg-card text-foreground w-full max-w-lg border rounded-2xl shadow-xl p-6 space-y-5"
                    >
                        <div className="flex items-center justify-between border-b pb-3">
                            <div className="flex items-center gap-2">
                                <Award className="h-5 w-5 text-primary" />
                                <div>
                                    <h3 className="font-bold text-sm text-foreground">Supplier Performance Audit</h3>
                                    <p className="text-[11px] text-muted-foreground">{supplier.supplier_name}</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="text-muted-foreground hover:text-foreground text-xs p-1 rounded-lg hover:bg-muted"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Overall Score Badge */}
                        <div className="flex items-center justify-between p-4 bg-primary/5 border border-primary/20 rounded-2xl">
                            <div className="space-y-1">
                                <span className="text-[10px] font-extrabold uppercase text-primary tracking-wider flex items-center gap-1">
                                    <ShieldCheck className="h-3.5 w-3.5" /> Performance Index
                                </span>
                                <div className="text-2xl font-black text-foreground">
                                    {overallScore}% <span className="text-xs font-bold text-muted-foreground">({grade} Grade)</span>
                                </div>
                            </div>
                            <div className={`px-4 py-2 rounded-xl text-lg font-black tracking-widest ${
                                grade === "A+" || grade === "A"
                                    ? "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30"
                                    : grade === "B"
                                    ? "bg-blue-500/15 text-blue-700 border border-blue-500/30"
                                    : grade === "C"
                                    ? "bg-amber-500/15 text-amber-700 border border-amber-500/30"
                                    : "bg-red-500/15 text-red-700 border border-red-500/30"
                            }`}>
                                Tier {grade}
                            </div>
                        </div>

                        <form onSubmit={handleSave} className="space-y-4">
                            <div className="space-y-2.5">
                                {renderStarSelector("On-Time Delivery & Fulfillment", deliveryRating, setDeliveryRating)}
                                {renderStarSelector("Material / Product Quality Compliance", qualityRating, setQualityRating)}
                                {renderStarSelector("Pricing & Commercial Competitiveness", priceRating, setPriceRating)}
                                {renderStarSelector("Regulatory & Support Responsiveness", complianceRating, setComplianceRating)}
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[11px] font-semibold text-muted-foreground">
                                    Audit Comments & Inspection Notes
                                </label>
                                <textarea
                                    placeholder="Enter performance feedback, defect history, or contract audit remarks..."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="w-full rounded-xl border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-medium min-h-[80px]"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="text-xs font-bold text-muted-foreground hover:text-foreground px-4 py-2 rounded-xl hover:bg-muted"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="bg-primary text-primary-foreground font-bold text-xs px-5 py-2 rounded-xl hover:bg-primary/95 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                    <CheckCircle2 className="h-4 w-4" />
                                    {isSaving ? "Saving..." : "Record Evaluation"}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
