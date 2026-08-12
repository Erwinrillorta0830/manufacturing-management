"use client";

import React, { useState } from "react";
import { useLogisticsProfiles } from "./hooks/useLogisticsProfiles";
import VehicleRegistry from "./components/VehicleRegistry";
import RouteConfigurations from "./components/RouteConfigurations";
import TripCostSimulator from "./components/TripCostSimulator";
import { Loader2, Truck, Navigation, Settings } from "lucide-react";

export default function LogisticsProfilesModule() {
    const {
        vehicles,
        routes,
        loading,
        simVehicleId,
        setSimVehicleId,
        simRouteId,
        setSimRouteId,
        cargoWeight,
        setCargoWeight,
        cargoVolume,
        setCargoVolume,
        isRoundTrip,
        setIsRoundTrip,
        handleSaveVehicle,
        handleSaveRoute,
        handleDeleteRoute,
        getSimulationResult
    } = useLogisticsProfiles();

    const [activeTab, setActiveTab] = useState<string>("simulator");

    return (
        <div className="flex flex-col min-h-0 min-w-0 flex-1 space-y-4">
            {/* KPI Summary Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
                <div className="border bg-card rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
                    <div className="bg-primary/10 p-2.5 rounded-lg border border-primary/10">
                        <Truck className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <span className="text-[10px] text-muted-foreground font-bold uppercase block">Fleet Vehicles</span>
                        <h4 className="text-base font-black text-foreground mt-0.5">{loading ? "..." : vehicles.length} Registered</h4>
                    </div>
                </div>

                <div className="border bg-card rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
                    <div className="bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/10">
                        <Navigation className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div>
                        <span className="text-[10px] text-muted-foreground font-bold uppercase block">Active Routes</span>
                        <h4 className="text-base font-black text-foreground mt-0.5">{loading ? "..." : routes.length} Destinaions</h4>
                    </div>
                </div>

                <div className="border bg-card rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
                    <div className="bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/10">
                        <Settings className="h-5 w-5" />
                    </div>
                    <div>
                        <span className="text-[10px] text-muted-foreground font-bold uppercase block">Integration State</span>
                        <h4 className="text-base font-black text-foreground mt-0.5">Local Fallback</h4>
                    </div>
                </div>
            </div>



            {/* Module Tabs Navigation */}
            <div className="flex border-b border-border/60 gap-1 bg-muted/20 px-4 pt-2 shrink-0">
                <button
                    type="button"
                    onClick={() => setActiveTab("simulator")}
                    className={`px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-[1px] cursor-pointer ${
                        activeTab === "simulator" ? "border-primary text-primary bg-background rounded-t-lg shadow-xs" : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                >
                    Trip Cost Simulator
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("fleet")}
                    className={`px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-[1px] cursor-pointer ${
                        activeTab === "fleet" ? "border-primary text-primary bg-background rounded-t-lg shadow-xs" : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                >
                    Vehicle Registry
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("routes")}
                    className={`px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-[1px] cursor-pointer ${
                        activeTab === "routes" ? "border-primary text-primary bg-background rounded-t-lg shadow-xs" : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                >
                    Route Configurations
                </button>
            </div>

            {/* Tab Content Window */}
            <div className="flex-1 min-h-0 relative bg-background border rounded-xl p-4 md:p-6 shadow-sm">
                {loading && (
                    <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-50 flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                )}

                <div className="w-full h-full">
                    {activeTab === "simulator" && (
                        <TripCostSimulator
                            vehicles={vehicles}
                            routes={routes}
                            simVehicleId={simVehicleId}
                            setSimVehicleId={setSimVehicleId}
                            simRouteId={simRouteId}
                            setSimRouteId={setSimRouteId}
                            cargoWeight={cargoWeight}
                            setCargoWeight={setCargoWeight}
                            cargoVolume={cargoVolume}
                            setCargoVolume={setCargoVolume}
                            isRoundTrip={isRoundTrip}
                            setIsRoundTrip={setIsRoundTrip}
                            getSimulationResult={getSimulationResult}
                        />
                    )}
                    {activeTab === "fleet" && (
                        <VehicleRegistry
                            vehicles={vehicles}
                            onSave={handleSaveVehicle}
                        />
                    )}
                    {activeTab === "routes" && (
                        <RouteConfigurations
                            routes={routes}
                            onSave={handleSaveRoute}
                            onDelete={handleDeleteRoute}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
