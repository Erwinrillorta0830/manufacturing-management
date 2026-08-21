"use client";

import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
    returnPath?: string;
};

export function SessionExpiredPanel({ returnPath }: Props) {
    const handleSignIn = () => {
        const path =
            returnPath ??
            `${window.location.pathname}${window.location.search}`;
        window.location.href = `/login?next=${encodeURIComponent(path)}`;
    };

    return (
        <Card className="mx-auto max-w-lg rounded-2xl">
            <CardHeader className="text-center">
                <CardTitle>Session expired</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
                <p className="text-sm text-muted-foreground">
                    Your sign-in session has ended. Sign in again to continue working on this page.
                </p>
                <Button type="button" onClick={handleSignIn}>
                    <LogIn className="mr-2 h-4 w-4" />
                    Sign in again
                </Button>
            </CardContent>
        </Card>
    );
}
