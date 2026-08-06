"use client";

import React, { useState } from "react";
import { ShieldCheck, AlertTriangle, Monitor, Globe, Clock, User, ArrowDownWideNarrow } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LoginActivityRecord {
    id: string;
    timestamp: string;
    email: string;
    ipAddress: string;
    device: string;
    location: string;
    status: "Success" | "Failed";
}

export default function LoginActivityModule() {
    const [activities] = useState<LoginActivityRecord[]>(() => {
        // Get current user info from decoded cookie (simulated via headers or default)
        const defaultEmail = "ajsiapno60@men2corp.com";
        
        // Get user agent details
        const ua = typeof window !== "undefined" ? window.navigator.userAgent : "";
        let browser = "Chrome";
        if (ua.includes("Firefox")) browser = "Firefox";
        else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
        else if (ua.includes("Edge")) browser = "Edge";
        
        let os = "Windows";
        if (ua.includes("Mac")) os = "macOS";
        else if (ua.includes("Linux")) os = "Linux";
        else if (ua.includes("Android")) os = "Android";
        else if (ua.includes("iPhone")) os = "iOS";

        const currentDevice = `${browser} on ${os}`;
        
        // Generate seed logs
        const now = new Date();
        const formatOffset = (mins: number) => {
            const d = new Date(now.getTime() - mins * 60 * 1000);
            const pad = (n: number) => String(n).padStart(2, "0");
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        };

        return [
            {
                id: "log-1",
                timestamp: formatOffset(0), // Just now
                email: defaultEmail,
                ipAddress: "120.28.2.14",
                device: currentDevice,
                location: "Dagupan City, Pangasinan",
                status: "Success"
            },
            {
                id: "log-2",
                timestamp: formatOffset(120), // 2 hours ago
                email: defaultEmail,
                ipAddress: "120.28.2.14",
                device: currentDevice,
                location: "Dagupan City, Pangasinan",
                status: "Success"
            },
            {
                id: "log-3",
                timestamp: formatOffset(250), // ~4 hours ago
                email: defaultEmail,
                ipAddress: "120.28.2.14",
                device: currentDevice,
                location: "Dagupan City, Pangasinan",
                status: "Failed"
            },
            {
                id: "log-4",
                timestamp: formatOffset(1440), // 1 day ago
                email: defaultEmail,
                ipAddress: "120.28.2.14",
                device: currentDevice,
                location: "Dagupan City, Pangasinan",
                status: "Success"
            },
            {
                id: "log-5",
                timestamp: formatOffset(2880), // 2 days ago
                email: defaultEmail,
                ipAddress: "112.198.115.89",
                device: `Safari on macOS`,
                location: "Quezon City, Metro Manila",
                status: "Success"
            }
        ];
    });

    // Summary calculations
    const successCount = activities.filter(a => a.status === "Success").length;
    const failedCount = activities.filter(a => a.status === "Failed").length;
    const uniqueIps = new Set(activities.map(a => a.ipAddress)).size;

    return (
        <div className="space-y-6 max-w-6xl mx-auto p-1 sm:p-2">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-muted/10 p-5 border rounded-xl">
                <div className="space-y-1">
                    <h2 className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
                        <ShieldCheck className="h-4.5 w-4.5 text-primary" />
                        Account Login Activity
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                        Review successful and failed login attempts to monitor your security profile and detect anomalies.
                    </p>
                </div>
            </div>

            {/* Dashboard Cards Grid */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Successful Logins</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                            {successCount} <span className="text-xs font-semibold text-muted-foreground">sessions</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">Authorized access within stored logs</p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Failed Attempts</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
                            {failedCount} <span className="text-xs font-semibold text-muted-foreground">attempts</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">Blocked or incorrect passwords</p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Distinct IP Locations</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-primary">
                            {uniqueIps} <span className="text-xs font-semibold text-muted-foreground">IP(s)</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">Unique access routes recorded</p>
                    </CardContent>
                </Card>
            </div>

            {/* Activities Table */}
            <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
                <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/10">
                    <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Recent Access Logs</h3>
                        <p className="text-[10px] text-muted-foreground">Detailed logs of authentication transactions</p>
                    </div>
                    <div className="flex gap-2">
                        <div className="flex items-center gap-1.5 border px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-background text-muted-foreground">
                            <ArrowDownWideNarrow className="h-3.5 w-3.5 text-muted-foreground" />
                            Newest first
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr className="bg-muted/20 border-b text-muted-foreground font-bold uppercase tracking-wider">
                                <th className="p-4">Timestamp</th>
                                <th className="p-4">Account Email</th>
                                <th className="p-4">IP Address</th>
                                <th className="p-4">Device & Browser</th>
                                <th className="p-4">Location</th>
                                <th className="p-4 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {activities.map((item) => (
                                <tr key={item.id} className="hover:bg-muted/5 transition-colors">
                                    <td className="p-4 font-mono font-medium text-foreground flex items-center gap-2">
                                        <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
                                        {item.timestamp}
                                    </td>
                                    <td className="p-4 font-bold text-foreground">
                                        <div className="flex items-center gap-1.5">
                                            <User className="h-3.5 w-3.5 text-muted-foreground/60" />
                                            {item.email}
                                        </div>
                                    </td>
                                    <td className="p-4 font-mono font-bold text-muted-foreground">
                                        <div className="flex items-center gap-1.5">
                                            <Globe className="h-3.5 w-3.5 text-muted-foreground/60" />
                                            {item.ipAddress}
                                        </div>
                                    </td>
                                    <td className="p-4 text-muted-foreground">
                                        <div className="flex items-center gap-1.5">
                                            <Monitor className="h-3.5 w-3.5 text-muted-foreground/60" />
                                            {item.device}
                                        </div>
                                    </td>
                                    <td className="p-4 font-medium text-foreground">{item.location}</td>
                                    <td className="p-4 text-center">
                                        {item.status === "Success" ? (
                                            <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-600 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold border border-emerald-500/10">
                                                <ShieldCheck className="h-3 w-3" />
                                                Success
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 bg-rose-500/10 text-rose-600 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold border border-rose-500/10">
                                                <AlertTriangle className="h-3 w-3" />
                                                Failed
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
