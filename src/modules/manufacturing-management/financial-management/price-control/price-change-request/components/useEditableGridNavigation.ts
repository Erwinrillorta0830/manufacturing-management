"use client";

import * as React from "react";

import { isMultiCellClipboard, parseTsv, validatePastedPrice } from "./parseGridClipboard";

type CellCoord = { row: number; col: number };

type Direction = "tab" | "shiftTab" | "enter" | "shiftEnter" | "up" | "down" | "left" | "right";

function cellRefKey(row: number, col: number) {
    return `${row}:${col}`;
}

function getNeighbor(
    coord: CellCoord,
    direction: Direction,
    rowCount: number,
    colCount: number,
): CellCoord | null {
    let { row, col } = coord;

    switch (direction) {
        case "tab":
            col += 1;
            if (col >= colCount) {
                col = 0;
                row += 1;
            }
            if (row >= rowCount) {
                row = 0;
            }
            break;
        case "shiftTab":
            col -= 1;
            if (col < 0) {
                col = colCount - 1;
                row -= 1;
            }
            if (row < 0) {
                row = rowCount - 1;
            }
            break;
        case "enter":
            row += 1;
            if (row >= rowCount) row = rowCount - 1;
            break;
        case "shiftEnter":
            row -= 1;
            if (row < 0) row = 0;
            break;
        case "up":
            row -= 1;
            if (row < 0) row = 0;
            break;
        case "down":
            row += 1;
            if (row >= rowCount) row = rowCount - 1;
            break;
        case "left":
            col -= 1;
            if (col < 0) col = 0;
            break;
        case "right":
            col += 1;
            if (col >= colCount) col = colCount - 1;
            break;
    }

    if (row === coord.row && col === coord.col) return null;
    if (row < 0 || row >= rowCount || col < 0 || col >= colCount) return null;

    return { row, col };
}

type Options = {
    rowCount: number;
    colCount: number;
    disabled?: boolean;
    onPasteSkipped?: (count: number) => void;
};

export function useEditableGridNavigation({ rowCount, colCount, disabled, onPasteSkipped }: Options) {
    const refs = React.useRef<Map<string, HTMLInputElement>>(new Map());
    const activeRef = React.useRef<CellCoord>({ row: 0, col: 0 });

    React.useEffect(() => {
        refs.current.clear();
    }, [rowCount, colCount]);

    const register = React.useCallback((row: number, col: number, el: HTMLInputElement | null) => {
        const key = cellRefKey(row, col);
        if (el) refs.current.set(key, el);
        else refs.current.delete(key);
    }, []);

    const focusCell = React.useCallback((coord: CellCoord) => {
        const el = refs.current.get(cellRefKey(coord.row, coord.col));
        if (!el) return;

        activeRef.current = coord;
        el.focus();
        el.select();
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, []);

    const setActive = React.useCallback((row: number, col: number) => {
        activeRef.current = { row, col };
    }, []);

    const onKeyDown = React.useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
            if (disabled) return;

            const input = event.currentTarget;
            const coord = { row, col };

            if (event.key === "Tab") {
                event.preventDefault();
                const neighbor = getNeighbor(coord, event.shiftKey ? "shiftTab" : "tab", rowCount, colCount);
                if (neighbor) focusCell(neighbor);
                return;
            }

            if (event.key === "Enter") {
                event.preventDefault();
                const neighbor = getNeighbor(
                    coord,
                    event.shiftKey ? "shiftEnter" : "enter",
                    rowCount,
                    colCount,
                );
                if (neighbor) focusCell(neighbor);
                return;
            }

            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                const neighbor = getNeighbor(
                    coord,
                    event.key === "ArrowUp" ? "up" : "down",
                    rowCount,
                    colCount,
                );
                if (neighbor) focusCell(neighbor);
                return;
            }

            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
                const atEnd =
                    input.selectionStart === input.value.length && input.selectionEnd === input.value.length;

                if (event.key === "ArrowLeft" && !atStart) return;
                if (event.key === "ArrowRight" && !atEnd) return;

                event.preventDefault();
                const neighbor = getNeighbor(
                    coord,
                    event.key === "ArrowLeft" ? "left" : "right",
                    rowCount,
                    colCount,
                );
                if (neighbor) focusCell(neighbor);
            }
        },
        [colCount, disabled, focusCell, rowCount],
    );

    const onPaste = React.useCallback(
        (
            event: React.ClipboardEvent<HTMLInputElement>,
            row: number,
            col: number,
            onCell: (targetRow: number, targetCol: number, value: string) => void,
        ) => {
            if (disabled) return;

            const text = event.clipboardData.getData("text/plain");
            if (!isMultiCellClipboard(text)) return;

            event.preventDefault();

            const grid = parseTsv(text);
            let skipped = 0;

            for (let r = 0; r < grid.length; r++) {
                for (let c = 0; c < grid[r].length; c++) {
                    const targetRow = row + r;
                    const targetCol = col + c;
                    if (targetRow >= rowCount || targetCol >= colCount) continue;

                    const raw = grid[r][c];
                    if (!raw.trim()) {
                        onCell(targetRow, targetCol, "");
                        continue;
                    }

                    const { valid, normalized } = validatePastedPrice(raw);
                    if (!valid) {
                        skipped += 1;
                        continue;
                    }

                    onCell(targetRow, targetCol, normalized);
                }
            }

            if (skipped > 0) {
                onPasteSkipped?.(skipped);
            }
        },
        [colCount, disabled, onPasteSkipped, rowCount],
    );

    return { register, onKeyDown, onPaste, setActive, focusCell };
}
