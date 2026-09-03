export function getProductTypeBadgeProps(name: string): { label: string; className: string } {
    const lowerName = name.toLowerCase();

    if (lowerName.includes("finish")) {
        return {
            label: "FG",
            className: "border-blue-500 text-blue-700 bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:bg-blue-900/30",
        };
    }
    
    if (lowerName.includes("pack")) {
        return {
            label: "PACKG",
            className: "border-emerald-500 text-emerald-700 bg-emerald-50 dark:border-emerald-400 dark:text-emerald-300 dark:bg-emerald-900/30",
        };
    }
    
    if (lowerName.includes("raw")) {
        return {
            label: "RAWMATS",
            className: "border-amber-500 text-amber-700 bg-amber-50 dark:border-amber-400 dark:text-amber-300 dark:bg-amber-900/30",
        };
    }

    return {
        label: name,
        className: "bg-muted text-muted-foreground",
    };
}
