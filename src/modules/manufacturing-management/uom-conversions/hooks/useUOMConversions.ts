import { useState, useEffect } from "react";
import { DensityFactor, ConversionLog, UOMScale } from "../types";
import { toast } from "sonner";

const DEFAULT_DENSITIES: DensityFactor[] = [
    { id: "palm-olein", name: "RBD Palm Olein", density: 0.895, description: "Standard refined palm oil density", isSystem: true },
    { id: "coconut-oil", name: "RBD Coconut Oil", density: 0.915, description: "Standard coconut oil density at liquid phase", isSystem: true },
    { id: "soya-bean-oil", name: "RBD Soya Bean Oil", density: 0.917, description: "Standard refined soybean oil density", isSystem: true },
    { id: "canola-oil", name: "RBD Canola Oil", density: 0.914, description: "Standard refined canola oil density", isSystem: true },
    { id: "water", name: "Water", density: 1.000, description: "Baseline reference density at 4°C", isSystem: true }
];

const STANDARD_SCALES: UOMScale[] = [
    { fromUnit: "MT", toUnit: "KG", multiplier: 1000, description: "1 Metric Ton = 1,000 Kilograms" },
    { fromUnit: "KG", toUnit: "G", multiplier: 1000, description: "1 Kilogram = 1,000 Grams" },
    { fromUnit: "L", toUnit: "ML", multiplier: 1000, description: "1 Liter = 1,000 Milliliters" },
    { fromUnit: "Drums", toUnit: "L", multiplier: 200, description: "1 Standard Oil Drum = 200 Liters" }
];

export function useUOMConversions() {
    const [densities, setDensities] = useState<DensityFactor[]>(DEFAULT_DENSITIES);
    const [loading, setLoading] = useState(false);

    const [logs, setLogs] = useState<ConversionLog[]>([]);

    // Fetch density factors from Directus via proxy route
    const fetchDensities = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/manufacturing/uom-conversions");
            if (!res.ok) throw new Error("Failed to fetch densities from API");
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                // Map fields from directus schema to frontend schema
// eslint-disable-next-line @typescript-eslint/no-explicit-any
                const mapped: DensityFactor[] = data.map((d: any) => ({
                    id: String(d.id),
                    name: d.name,
                    density: Number(d.density),
                    description: d.description || "",
                    isSystem: !!d.is_system
                }));
                setDensities(mapped);
            }
        } catch (e) {
            console.error("Error loading density factors:", e);
            toast.error("Offline: using local density database defaults");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            setLoading(true);
            try {
                const res = await fetch("/api/manufacturing/uom-conversions");
                if (!res.ok) throw new Error("Failed to fetch densities from API");
                const data = await res.json();
                if (isMounted && Array.isArray(data) && data.length > 0) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const mapped: DensityFactor[] = data.map((d: any) => ({
                        id: String(d.id),
                        name: d.name,
                        density: Number(d.density),
                        description: d.description || "",
                        isSystem: !!d.is_system
                    }));
                    setDensities(mapped);
                }
            } catch (e) {
                if (isMounted) {
                    console.error("Error loading density factors:", e);
                    toast.error("Offline: using local density database defaults");
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };
        load();
        return () => {
            isMounted = false;
        };
    }, []);

    // Modal state for adding a custom density
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [newDensity, setNewDensity] = useState({
        name: "",
        density: "0.900",
        description: ""
    });

    // Calculator state
    const [calcVal, setCalcVal] = useState<string>("1");
    const [calcFrom, setCalcFrom] = useState<string>("MT");
    const [calcTo, setCalcTo] = useState<string>("L");
    const [selectedOilId, setSelectedOilId] = useState<string>("1"); // default to palm oil (id: 1 in seed)

    // Sync selectedOilId once densities load
    useEffect(() => {
        if (densities.length > 0 && !densities.some(d => d.id === selectedOilId)) {
            queueMicrotask(() => {
                setSelectedOilId(densities[0].id);
            });
        }
    }, [densities, selectedOilId]);

    // Add density
    const handleAddDensity = async (e: React.FormEvent) => {
        e.preventDefault();
        const dVal = parseFloat(newDensity.density);
        if (!newDensity.name.trim()) {
            toast.error("Please enter a valid oil/liquid name");
            return;
        }
        if (isNaN(dVal) || dVal <= 0 || dVal > 3) {
            toast.error("Density must be a positive number (typically between 0.5 and 2.0)");
            return;
        }

        try {
            const res = await fetch("/api/manufacturing/uom-conversions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newDensity.name.trim(),
                    density: Number(dVal.toFixed(4)),
                    description: newDensity.description.trim() || "Custom density override",
                    is_system: false
                })
            });

            if (!res.ok) throw new Error("API post failed");
            
            const created = await res.json();
            
            toast.success(`Density factor for "${created.name}" saved to database`);
            setIsAddOpen(false);
            setNewDensity({ name: "", density: "0.900", description: "" });
            
            // Refresh list from database
            fetchDensities();
        } catch (err) {
            console.error("Error creating custom density in DB:", err);
            // Fallback local update
            const fallbackEntry: DensityFactor = {
                id: Math.random().toString(36).substring(2, 9),
                name: newDensity.name.trim(),
                density: Number(dVal.toFixed(4)),
                description: newDensity.description.trim() || "Custom density override (Local Only)",
                isSystem: false
            };
            setDensities(prev => [...prev, fallbackEntry]);
            setIsAddOpen(false);
            setNewDensity({ name: "", density: "0.900", description: "" });
            toast.success(`Local Only: factor for "${fallbackEntry.name}" applied locally`);
        }
    };

    // Delete custom density
    const handleDeleteDensity = async (id: string) => {
        const item = densities.find(d => d.id === id);
        if (item?.isSystem) {
            toast.error("System defined densities cannot be deleted");
            return;
        }

        try {
            const res = await fetch(`/api/manufacturing/uom-conversions?id=${id}`, {
                method: "DELETE"
            });
            if (!res.ok) throw new Error("API delete failed");
            toast.success("Density entry deleted from database");
            fetchDensities();
        } catch (err) {
            console.error("Error deleting density in DB:", err);
            setDensities(prev => prev.filter(d => d.id !== id));
            toast.success("Local Only: entry removed locally");
        }
        
        if (selectedOilId === id) {
            setSelectedOilId(densities[0]?.id || "1");
        }
    };

    // Conversion logic
    const convert = (value: number, from: string, to: string, density: number): number => {
        if (from === to) return value;

        // Convert source unit to base Kilograms (for mass) or Liters (for volume)
        let baseValue = 0;
        let isVolume = false;

        // Step 1: Normalize to base unit
        switch (from) {
            case "MT":
                baseValue = value * 1000; // to KG
                isVolume = false;
                break;
            case "KG":
                baseValue = value;
                isVolume = false;
                break;
            case "L":
                baseValue = value;
                isVolume = true;
                break;
            case "ML":
                baseValue = value / 1000; // to L
                isVolume = true;
                break;
            case "Drums":
                baseValue = value * 200; // to L
                isVolume = true;
                break;
            default:
                baseValue = value;
        }

        // Step 2: Cross conversion between mass and volume using density
        let normalizedVolume = 0;
        let normalizedMass = 0;

        if (isVolume) {
            normalizedVolume = baseValue;
            normalizedMass = baseValue * density; // Liters to KG
        } else {
            normalizedMass = baseValue;
            normalizedVolume = baseValue / density; // KG to Liters
        }

        // Step 3: Convert from base normalized volume/mass to target unit
        switch (to) {
            case "MT":
                return normalizedMass / 1000;
            case "KG":
                return normalizedMass;
            case "L":
                return normalizedVolume;
            case "ML":
                return normalizedVolume * 1000;
            case "Drums":
                return normalizedVolume / 200;
            default:
                return 0;
        }
    };

    const handleRunCalculation = () => {
        const val = parseFloat(calcVal);
        if (isNaN(val) || val < 0) {
            toast.error("Please enter a valid non-negative amount");
            return;
        }

        const oilObj = densities.find(d => d.id === selectedOilId) || densities[0];
        const result = convert(val, calcFrom, calcTo, oilObj.density);
        const resultFormatted = Number(result.toFixed(6));

        // Prevent duplicate entries if Amount to Convert, UOM parameters, and Computed Value are identical
        const isDuplicate = logs.some(
            (log) =>
                log.value === val &&
                log.fromUnit === calcFrom &&
                log.toUnit === calcTo &&
                log.oilType === oilObj.name &&
                log.result === resultFormatted
        );

        if (isDuplicate) {
            toast.warning("Duplicate calculation", {
                description: "This exact calculation has already been recorded in the audit logs."
            });
            return;
        }

        // Add log entry
        const newLog: ConversionLog = {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            createdAt: new Date().toISOString(),
            oilType: oilObj.name,
            value: val,
            fromUnit: calcFrom,
            result: resultFormatted,
            toUnit: calcTo
        };

        setLogs(prev => {
            const updated = [newLog, ...prev];
            // Sort by ISO timestamp descending (Newest on Top)
            return updated
                .sort((a, b) => {
                    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                    return dateB - dateA;
                })
                .slice(0, 20);
        });
        toast.success("Conversion completed and logged");
    };

    const clearLogs = () => {
        setLogs([]);
        toast.success("Calculation logs cleared");
    };

    const activeOil = densities.find(d => d.id === selectedOilId) || densities[0] || DEFAULT_DENSITIES[0];
    const previewResult = isNaN(parseFloat(calcVal)) ? 0 : convert(parseFloat(calcVal), calcFrom, calcTo, activeOil.density);

    return {
        densities,
        logs,
        STANDARD_SCALES,
        isAddOpen,
        setIsAddOpen,
        newDensity,
        setNewDensity,
        calcVal,
        setCalcVal,
        calcFrom,
        setCalcFrom,
        calcTo,
        setCalcTo,
        selectedOilId,
        setSelectedOilId,
        handleAddDensity,
        handleDeleteDensity,
        handleRunCalculation,
        clearLogs,
        activeOil,
        previewResult,
        loading
    };
}
