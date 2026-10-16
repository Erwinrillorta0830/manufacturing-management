import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const sourceRoot = fileURLToPath(new URL("../../../../", import.meta.url));
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (!specifier.startsWith(".") || /\.(?:mjs|cjs|js|tsx?|jsx?)$/.test(specifier)) return nextResolve(specifier, context);
        const basePath = fileURLToPath(new URL(specifier, context.parentURL));
        const target = [basePath, ...[".ts", ".tsx", ".js", ".jsx"].map(extension => `${basePath}${extension}`)]
            .find(candidate => existsSync(candidate));
        return nextResolve(pathToFileURL(target || path.resolve(sourceRoot, basePath)).href, context);
    }
});

const { buildQaStartPatch } = await import("./_qa-start-fields.ts");

assert.deepEqual(buildQaStartPatch({ qa_started_at: null, qa_started_by: null }, [
    { daily_qa_id: 12, inspected_at: "2026-10-15T02:24:47.000Z", inspector_id: 22 },
    { daily_qa_id: 10, inspected_at: "2026-10-15T01:13:18.000Z", inspector_id: 20 }
]), {
    qa_started_at: "2026-10-15 09:13:18",
    qa_started_by: 20
});

assert.deepEqual(buildQaStartPatch({ qa_started_at: null, qa_started_by: null }, [
    { daily_qa_id: 299, inspected_at: "2026-10-15T01:13:18.000Z", inspector_id: 21 },
    { daily_qa_id: 298, inspected_at: "2026-10-15T01:13:18.000Z", inspector_id: 20 }
]), {
    qa_started_at: "2026-10-15 09:13:18",
    qa_started_by: 20
});

assert.deepEqual(buildQaStartPatch({ qa_started_at: null, qa_started_by: 99 }, [
    { daily_qa_id: 10, inspected_at: "2026-10-15 09:13:18", inspector_id: 20 }
]), { qa_started_at: "2026-10-15 09:13:18" });

assert.deepEqual(buildQaStartPatch({ qa_started_at: "2026-10-15 08:00:00", qa_started_by: null }, [
    { daily_qa_id: 10, inspected_at: "2026-10-15T01:13:18.000Z", inspector_id: { user_id: 20 } }
]), { qa_started_by: 20 });

assert.equal(buildQaStartPatch({ qa_started_at: "set", qa_started_by: 20 }, []), null);
assert.equal(buildQaStartPatch({ qa_started_at: null, qa_started_by: null }, [
    { daily_qa_id: 10, inspected_at: null, inspector_id: 20 }
]), null);

console.log("QA parent start-field reconciliation checks passed.");
