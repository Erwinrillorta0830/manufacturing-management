import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { DashboardData, PresetType, DashboardTab } from "../types/dashboard.types";
import { fetchDashboardData } from "../services/dashboard.service";

export function useDashboard() {
    const getFirstDayOfMonth = () => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
    };
    const getToday = () => {
        return new Date().toISOString().split('T')[0];
    };

    const [startDate, setStartDate] = useState(getFirstDayOfMonth());
    const [endDate, setEndDate] = useState(getToday());
    const [activePreset, setActivePreset] = useState<PresetType>("month");

    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<DashboardTab>("production");
    const [searchQuery, setSearchQuery] = useState("");

    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

    const toggleRow = (key: string) => {
        setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const loadDashboardData = async (start = startDate, end = endDate) => {
        setLoading(true);
        try {
            const json = await fetchDashboardData(start, end);
            setData(json);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Error loading dashboard metrics";
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDashboardData(startDate, endDate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handlePresetChange = (preset: PresetType) => {
        setActivePreset(preset);
        const today = new Date();
        let start = "";
        let end = getToday();

        if (preset === "7d") {
            const d = new Date();
            d.setDate(today.getDate() - 7);
            start = d.toISOString().split('T')[0];
        } else if (preset === "30d") {
            const d = new Date();
            d.setDate(today.getDate() - 30);
            start = d.toISOString().split('T')[0];
        } else if (preset === "month") {
            start = getFirstDayOfMonth();
        } else if (preset === "last_month") {
            const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const last = new Date(today.getFullYear(), today.getMonth(), 0);
            start = first.toISOString().split('T')[0];
            end = last.toISOString().split('T')[0];
        } else if (preset === "all") {
            start = "";
            end = "";
        }

        setStartDate(start);
        setEndDate(end);
        loadDashboardData(start, end);
    };

    const handleCustomFilterSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setActivePreset("all");
        loadDashboardData(startDate, endDate);
    };

    // Filter Raw Materials
    const filteredRaw = useMemo(() => {
        if (!data) return [];
        return data.inventory.rawMaterials.items.filter(item => {
            const query = searchQuery.toLowerCase();
            return item.product_name.toLowerCase().includes(query) ||
                item.product_code.toLowerCase().includes(query) ||
                item.category.toLowerCase().includes(query);
        });
    }, [data, searchQuery]);

    // Filter Finished Goods
    const filteredFG = useMemo(() => {
        if (!data) return [];
        return data.inventory.finishedGoods.items.filter(item => {
            const query = searchQuery.toLowerCase();
            return item.product_name.toLowerCase().includes(query) ||
                item.product_code.toLowerCase().includes(query) ||
                item.category.toLowerCase().includes(query);
        });
    }, [data, searchQuery]);

    // Format comparative data product-by-product for Top Products
    const productionWastageChartData = useMemo(() => {
        if (!data) return [];
        const prodMap: Record<string, { name: string; Produced: number; Wasted: number }> = {};

        data.production.items.forEach(item => {
            const name = item.name.length > 15 ? item.name.substring(0, 15) + "..." : item.name;
            if (!prodMap[item.code]) {
                prodMap[item.code] = { name, Produced: 0, Wasted: 0 };
            }
            prodMap[item.code].Produced += item.value;
        });

        data.wastage.items.forEach(item => {
            const name = item.name.length > 15 ? item.name.substring(0, 15) + "..." : item.name;
            if (!prodMap[item.code]) {
                prodMap[item.code] = { name, Produced: 0, Wasted: 0 };
            }
            prodMap[item.code].Wasted += item.value;
        });

        return Object.values(prodMap)
            .sort((a, b) => (b.Produced + b.Wasted) - (a.Produced + a.Wasted))
            .slice(0, 6);
    }, [data]);

    const yieldEfficiency = useMemo(() => {
        if (!data) return 100;
        const prod = data.production.totalValue || 0;
        const waste = data.wastage.totalValue || 0;
        const total = prod + waste;
        return total > 0 ? (prod / total) * 100 : 100;
    }, [data]);

    const selloutChartData = useMemo(() => {
        if (!data) return [];
        return data.sellout.items.slice(0, 5).map(item => ({
            name: item.name.length > 15 ? item.name.substring(0, 15) + "..." : item.name,
            value: item.revenue
        }));
    }, [data]);

    return {
        startDate,
        setStartDate,
        endDate,
        setEndDate,
        activePreset,
        data,
        loading,
        activeTab,
        setActiveTab,
        searchQuery,
        setSearchQuery,
        expandedRows,
        toggleRow,
        loadDashboardData,
        handlePresetChange,
        handleCustomFilterSubmit,
        filteredRaw,
        filteredFG,
        productionWastageChartData,
        yieldEfficiency,
        selloutChartData
    };
}
