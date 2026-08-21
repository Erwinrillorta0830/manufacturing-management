import type { MatrixRow, PriceType, Unit } from "../types";
import { buildMatrixTierKeys, tierLabelForTierKey } from "./pivot";
import {
    formatPrintMoney,
    getCssPageSize,
    getPageDimensionsPt,
    getPageMarginCss,
    getPrintPageMetrics,
    printTextValue,
    TIER_PALETTE_CSS,
    type PrintLayoutOptions,
} from "./printLayout";

type Options = PrintLayoutOptions & {
    includeBarcode?: boolean;
    priceTypes?: PriceType[];
    tiers?: string[];
    units?: Unit[];
    usedUnitIds?: Set<number>;
};

function esc(v: unknown): string {
    return String(v ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function unitLabel(unit: Unit | undefined, fallback: string) {
    return printTextValue(unit?.unit_shortcut || unit?.unit_name || fallback);
}

function renderProductCard(
    row: MatrixRow,
    args: {
        tiers: string[];
        priceTypes: PriceType[];
        usedUnits: Unit[];
        includeBarcode: boolean;
        compact: boolean;
        fontSize: number;
    },
): string {
    const display = row.display;
    const unitsForRow =
        args.usedUnits.length > 0
            ? args.usedUnits
            : Object.keys(row.variantsByUnitId).map((unitId) => ({
                  unit_id: Number(unitId),
                  unit_name: `Unit ${unitId}`,
                  unit_shortcut: `U${unitId}`,
              }));
    const printableUnits =
        unitsForRow.length > 0
            ? unitsForRow
            : [{ unit_id: 0, unit_name: "Price", unit_shortcut: "Price" }];

    const metaPills = [
        printTextValue(row.brand_name),
        printTextValue(row.category_name),
        `Code: ${printTextValue(display.product_code)}`,
        args.includeBarcode ? `Barcode: ${printTextValue(display.barcode)}` : "",
    ].filter(Boolean);

    const tierRows = args.tiers
        .map((tier, tierIndex) => {
            const palette = TIER_PALETTE_CSS[tierIndex % TIER_PALETTE_CSS.length];
            const cells = printableUnits
                .map((unit) => {
                    const variant = row.variantsByUnitId[Number(unit.unit_id)];
                    const price = variant?.tiers?.[tier];
                    const value = price != null ? formatPrintMoney(price) : "-";
                    return `<td class="price-cell">${esc(value)}</td>`;
                })
                .join("");

            return `<tr style="background:${palette.fill};color:${palette.text}">
                <th class="tier-cell">${esc(tierLabelForTierKey(tier, args.priceTypes))}</th>
                ${cells}
            </tr>`;
        })
        .join("");

    const unitHeaders = printableUnits
        .map((unit) => `<th class="unit-cell">${esc(unitLabel(unit, `Unit ${unit.unit_id}`))}</th>`)
        .join("");

    const pillHtml = metaPills.map((pill) => `<span class="pill">${esc(pill)}</span>`).join("");

    return `<article class="product-card ${args.compact ? "compact" : ""}">
        <h2 class="product-name">${esc(printTextValue(display.product_name))}</h2>
        <div class="pill-row">${pillHtml}</div>
        <table class="price-table" style="font-size:${args.fontSize}px">
            <thead>
                <tr>
                    <th class="tier-cell">Price Type</th>
                    ${unitHeaders}
                </tr>
            </thead>
            <tbody>${tierRows}</tbody>
        </table>
    </article>`;
}

export function openPricingMatrixPrintWindow(rows: MatrixRow[], opts: Options = {}) {
    const paper = opts.paper ?? "a4";
    const orientation = opts.orientation ?? "landscape";
    const layout = opts.layout ?? "table";
    const includeBarcode = opts.includeBarcode ?? true;
    const compact = opts.compact ?? true;
    const fontSize = opts.fontSize ?? 7;
    const usedUnitIds = opts.usedUnitIds ?? new Set();
    const unitsList = opts.units ?? [];
    const now = new Date();

    const { width, height } = getPageDimensionsPt(paper, orientation);
    const layoutLabel = layout === "cards" ? "Cards" : "Table";
    const metrics = getPrintPageMetrics(width, height, {
        layout,
        paper,
        orientation,
        compact,
        fontSize,
        layoutLabel,
    });

    const usedUnits = unitsList
        .filter((u) => usedUnitIds.has(Number(u.unit_id)))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const priceTypesList = opts.priceTypes ?? [];
    const tiers = opts.tiers?.length ? opts.tiers : buildMatrixTierKeys(priceTypesList);

    const cardsHtml = rows
        .map((row) =>
            renderProductCard(row, {
                tiers,
                priceTypes: priceTypesList,
                usedUnits,
                includeBarcode,
                compact,
                fontSize,
            }),
        )
        .join("");

    const pageMargin = getPageMarginCss(compact);
    const pageSize = getCssPageSize(paper, orientation);
    const gridColumns = layout === "cards" ? `repeat(${metrics.columns}, minmax(0, 1fr))` : "1fr";
    const gap = metrics.compact ? "4pt" : "8pt";
    const cardPadding = metrics.compact ? "6pt" : "8pt";

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Product Pricing Matrix Report</title>
<style>
  @page {
    size: ${pageSize};
    margin: ${pageMargin};
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    color: #111;
    font-family: Arial, Helvetica, sans-serif;
    font-size: ${fontSize}px;
  }

  .print-root {
    width: 100%;
  }

  .report-header {
    margin-bottom: ${metrics.compact ? "6pt" : "10pt"};
    padding-bottom: ${metrics.compact ? "4pt" : "6pt"};
    border-bottom: 1px solid #ddd;
  }

  .report-title {
    margin: 0 0 ${metrics.compact ? "4pt" : "6pt"};
    font-size: ${metrics.compact ? "11pt" : "14pt"};
    font-weight: 700;
  }

  .report-meta {
    margin: 0;
    color: #666;
    font-size: ${metrics.compact ? "7pt" : "9pt"};
    line-height: 1.35;
  }

  .product-grid {
    display: grid;
    grid-template-columns: ${gridColumns};
    gap: ${gap};
    width: 100%;
  }

  .product-card {
    break-inside: avoid;
    page-break-inside: avoid;
    border: 1px solid #d4d4d4;
    border-radius: 4pt;
    padding: ${cardPadding};
    background: #fff;
  }

  .product-name {
    margin: 0 0 ${metrics.compact ? "4pt" : "6pt"};
    font-size: ${fontSize + (metrics.compact ? 1 : 2)}px;
    font-weight: 700;
    line-height: 1.25;
  }

  .pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 3pt;
    margin-bottom: ${metrics.compact ? "4pt" : "6pt"};
  }

  .pill {
    display: inline-block;
    padding: 2pt 5pt;
    border: 1px solid #ebebeb;
    border-radius: 2pt;
    background: #f8fafc;
    color: #5a5a5a;
    font-size: ${Math.max(fontSize - 1, 5)}px;
    line-height: 1.2;
  }

  .price-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .price-table th,
  .price-table td {
    border: 1px solid #e1e1e1;
    padding: ${metrics.compact ? "2pt 3pt" : "3pt 4pt"};
    vertical-align: middle;
  }

  .price-table thead th {
    background: #f8fafc;
    font-weight: 700;
    text-align: left;
  }

  .tier-cell {
    width: 36%;
    text-align: left;
    font-weight: 700;
  }

  .unit-cell {
    text-align: left;
  }

  .price-cell {
    text-align: right;
    color: #1e1e1e;
  }

  @media print {
    .print-root {
      width: 100%;
    }
  }
</style>
</head>
<body>
  <div class="print-root">
    <header class="report-header">
      <h1 class="report-title">Product Pricing Matrix Report</h1>
      <p class="report-meta">
        Generated: ${esc(now.toLocaleDateString())} ${esc(now.toLocaleTimeString())}
        &nbsp;|&nbsp; Products: ${rows.length}
        &nbsp;|&nbsp; Layout: ${esc(layoutLabel)}
      </p>
    </header>
    <div class="product-grid">
      ${cardsHtml}
    </div>
  </div>
<script>
  setTimeout(() => window.print(), 250);
</script>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) return;
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}
