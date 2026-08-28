"use client";

import { useState, useEffect, useMemo, useCallback } from "react";

export interface PsgcLocation {
    code: string;
    name: string;
}

interface RawCity {
    code: string;
    name: string;
    provinceCode?: string;
    regionCode?: string;
}

// Module-level caches so data persists across mounts/dialogs
let cachedProvinces: PsgcLocation[] | null = null;
let cachedCities: RawCity[] | null = null;
const cachedBarangays: Record<string, PsgcLocation[]> = {};
const pendingBarangayFetches = new Set<string>();

export function usePsgc() {
    const [provincesList, setProvincesList] = useState<PsgcLocation[]>(cachedProvinces || []);
    const [citiesList, setCitiesList] = useState<RawCity[]>(cachedCities || []);
    const [, setBarangayUpdateCounter] = useState(0);

    // Initial load for provinces and cities
    useEffect(() => {
        let isMounted = true;

        const loadLocations = async () => {
            try {
                if (!cachedProvinces || !cachedCities) {
                    const [provRes, cityRes] = await Promise.all([
                        fetch("/api/psgc/provinces"),
                        fetch("/api/psgc/cities-municipalities"),
                    ]);

                    if (provRes.ok) {
                        const provData = await provRes.json();
                        if (Array.isArray(provData)) {
                            let mappedProvs: PsgcLocation[] = provData.map((p: { code: string; name: string }) => {
                                let displayName = (p.name || "").toUpperCase();
                                if (displayName.startsWith("NCR,")) {
                                    displayName = "METRO MANILA (" + displayName.replace("NCR,", "").trim() + ")";
                                }
                                return {
                                    code: p.code,
                                    name: displayName,
                                };
                            });

                            // Ensure Metro Manila / NCR is present
                            if (!mappedProvs.some((p) => p.name.includes("METRO MANILA") || p.code === "130000000")) {
                                mappedProvs.push({ code: "130000000", name: "METRO MANILA" });
                            }

                            mappedProvs = mappedProvs.sort((a, b) => a.name.localeCompare(b.name));
                            cachedProvinces = mappedProvs;
                            if (isMounted) setProvincesList(mappedProvs);
                        }
                    }

                    if (cityRes.ok) {
                        const cityData = await cityRes.json();
                        if (Array.isArray(cityData)) {
                            const mappedCities: RawCity[] = cityData.map((c: { code: string; name: string; provinceCode?: string; regionCode?: string }) => ({
                                code: c.code,
                                name: (c.name || "").toUpperCase(),
                                provinceCode: c.provinceCode,
                                regionCode: c.regionCode,
                            })).sort((a, b) => a.name.localeCompare(b.name));

                            cachedCities = mappedCities;
                            if (isMounted) setCitiesList(mappedCities);
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to load PSGC data:", err);
            }
        };

        void loadLocations();

        return () => {
            isMounted = false;
        };
    }, []);

    const provinces = useMemo(() => provincesList, [provincesList]);

    const getCities = useCallback((provinceCode: string | null): PsgcLocation[] => {
        if (!provinceCode) return [];

        const isNcr = provinceCode === "130000000" || provinceCode.startsWith("13");

        return citiesList
            .filter((c) => {
                if (isNcr) {
                    return c.provinceCode === "130000000" || c.regionCode === "130000000" || c.code.startsWith("13");
                }
                if (c.provinceCode) {
                    return c.provinceCode === provinceCode;
                }
                const prefix = provinceCode.length >= 4 ? provinceCode.slice(0, 4) : provinceCode;
                return c.code.startsWith(prefix);
            })
            .map((c) => ({
                code: c.code,
                name: c.name,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [citiesList]);

    const getBarangays = useCallback((cityCode: string | null): PsgcLocation[] => {
        if (!cityCode) return [];

        if (cachedBarangays[cityCode]) {
            return cachedBarangays[cityCode];
        }

        if (!pendingBarangayFetches.has(cityCode)) {
            pendingBarangayFetches.add(cityCode);
            void fetch(`/api/psgc/cities-municipalities/${cityCode}/barangays`)
                .then(async (res) => {
                    if (!res.ok) throw new Error(`Barangay fetch failed: ${res.status}`);
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        const mapped: PsgcLocation[] = data.map((b: { code: string; name: string }) => ({
                            code: b.code,
                            name: (b.name || "").toUpperCase(),
                        })).sort((a, b) => a.name.localeCompare(b.name));

                        cachedBarangays[cityCode] = mapped;
                        setBarangayUpdateCounter((prev) => prev + 1);
                    }
                })
                .catch((err) => {
                    console.warn(`Failed to fetch barangays for city ${cityCode}:`, err);
                    cachedBarangays[cityCode] = [];
                })
                .finally(() => {
                    pendingBarangayFetches.delete(cityCode);
                });
        }

        return cachedBarangays[cityCode] || [];
    }, []);

    const findProvinceCode = useCallback((name: string | null): string | null => {
        if (!name) return null;
        const target = name.toUpperCase().trim();

        // Check exact match
        const exact = provincesList.find((p) => p.name === target);
        if (exact) return exact.code;

        // Check if NCR / Metro Manila
        if (target.includes("METRO MANILA") || target.includes("NCR") || target.includes("NATIONAL CAPITAL REGION")) {
            const ncr = provincesList.find((p) => p.name.includes("METRO MANILA") || p.code === "130000000");
            if (ncr) return ncr.code;
        }

        const partial = provincesList.find((p) => p.name.includes(target) || target.includes(p.name));
        return partial ? partial.code : null;
    }, [provincesList]);

    const findCityCode = useCallback((provinceCode: string | null, cityName: string | null): string | null => {
        if (!cityName) return null;
        const target = cityName.toUpperCase().trim();

        const candidateCities = provinceCode ? getCities(provinceCode) : citiesList;
        const exact = candidateCities.find((c) => c.name === target);
        if (exact) return exact.code;

        const partial = candidateCities.find((c) => c.name.includes(target) || target.includes(c.name));
        return partial ? partial.code : null;
    }, [citiesList, getCities]);

    const findBarangayCode = useCallback((cityCode: string | null, barangayName: string | null): string | null => {
        if (!cityCode || !barangayName) return null;
        const target = barangayName.toUpperCase().trim();

        const list = cachedBarangays[cityCode] || [];
        const exact = list.find((b) => b.name === target);
        if (exact) return exact.code;

        const partial = list.find((b) => b.name.includes(target) || target.includes(b.name));
        return partial ? partial.code : null;
    }, []);

    return {
        provinces,
        getCities,
        getBarangays,
        findProvinceCode,
        findCityCode,
        findBarangayCode,
    };
}
