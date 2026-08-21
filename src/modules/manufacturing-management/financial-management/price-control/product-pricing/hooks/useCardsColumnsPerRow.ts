"use client";

import * as React from "react";

const SM_BREAKPOINT = 640;
const XL_BREAKPOINT = 1280;

export type CardsColumnsPerRow = 1 | 2 | 4;

function resolveColumnsPerRow(width: number): CardsColumnsPerRow {
    if (width >= XL_BREAKPOINT) return 4;
    if (width >= SM_BREAKPOINT) return 2;
    return 1;
}

export function useCardsColumnsPerRow(): CardsColumnsPerRow {
    const [columnsPerRow, setColumnsPerRow] = React.useState<CardsColumnsPerRow>(2);

    React.useEffect(() => {
        const mqSm = window.matchMedia(`(min-width: ${SM_BREAKPOINT}px)`);
        const mqXl = window.matchMedia(`(min-width: ${XL_BREAKPOINT}px)`);

        const update = () => {
            setColumnsPerRow(resolveColumnsPerRow(window.innerWidth));
        };

        update();
        mqSm.addEventListener("change", update);
        mqXl.addEventListener("change", update);

        return () => {
            mqSm.removeEventListener("change", update);
            mqXl.removeEventListener("change", update);
        };
    }, []);

    return columnsPerRow;
}
