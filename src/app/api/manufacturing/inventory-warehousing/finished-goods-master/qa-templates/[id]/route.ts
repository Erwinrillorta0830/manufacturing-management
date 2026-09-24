import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const templateId = parseInt(id);
        if (isNaN(templateId)) {
            return NextResponse.json({ error: "Invalid template ID" }, { status: 400 });
        }

        const body = await request.json();
        const { template_name, description, is_active, parameters } = body;

        // 1. Update Template Details
        const templatePayload: Record<string, unknown> = {};
        if (template_name !== undefined) templatePayload.template_name = template_name;
        if (description !== undefined) templatePayload.description = description;
        if (is_active !== undefined) templatePayload.is_active = !!is_active;

        if (Object.keys(templatePayload).length > 0) {
            const resTpl = await fetch(`${DIRECTUS_URL}/items/quality_inspection_templates/${templateId}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify(templatePayload)
            });
            if (!resTpl.ok) {
                const errText = await resTpl.text();
                throw new Error(`Directus failed to update QA template: ${resTpl.status} - ${errText}`);
            }
        }

        // 2. Fetch existing parameters for this template in DB
        const getParamsUrl = `${DIRECTUS_URL}/items/quality_inspection_parameters?filter[template_id][_eq]=${templateId}&limit=-1`;
        const resGetParams = await fetch(getParamsUrl, { headers, cache: "no-store" });
        const existingParams: { parameter_id: number }[] = resGetParams.ok ? (await resGetParams.json()).data || [] : [];

        const updatedParams = [];

        if (parameters && Array.isArray(parameters)) {
            const uiParamIds = new Set(parameters.map(p => String(p.parameter_id || p.id || "")).filter(Boolean));
            const paramsToDelete = existingParams.filter(p => !uiParamIds.has(String(p.parameter_id)));

            // Delete removed parameters
            for (const p of paramsToDelete) {
                await fetch(`${DIRECTUS_URL}/items/quality_inspection_parameters/${p.parameter_id}`, { method: "DELETE", headers });
            }

            // Create or Update parameters
            for (const param of parameters) {
                const paramId = param.parameter_id || param.id;
                const isNewParam = !paramId || isNaN(Number(paramId)) || Number(paramId) < 0;

                const paramPayload = {
                    template_id: templateId,
                    test_name: param.test_name,
                    test_type: param.test_type || "Text",
                    min_value: param.min_value !== undefined ? (param.min_value !== null ? Number(param.min_value) : null) : null,
                    max_value: param.max_value !== undefined ? (param.max_value !== null ? Number(param.max_value) : null) : null,
                    target_value: param.target_value !== undefined ? (param.target_value !== null ? String(param.target_value) : null) : null,
                    uom_id: param.uom_id || null,
                    is_critical: param.is_critical !== undefined ? !!param.is_critical : false
                };

                if (isNewParam) {
                    const resParam = await fetch(`${DIRECTUS_URL}/items/quality_inspection_parameters`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(paramPayload)
                    });
                    if (resParam.ok) {
                        const json = await resParam.json();
                        updatedParams.push(json.data);
                    }
                } else {
                    const resParam = await fetch(`${DIRECTUS_URL}/items/quality_inspection_parameters/${paramId}`, {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify(paramPayload)
                    });
                    if (resParam.ok) {
                        const json = await resParam.json();
                        updatedParams.push(json.data);
                    }
                }
            }
        } else {
            // If no parameters provided, just fetch the existing ones to return
            updatedParams.push(...existingParams);
        }

        // Fetch current template state to return
        const tplGetRes = await fetch(`${DIRECTUS_URL}/items/quality_inspection_templates/${templateId}`, { headers, cache: "no-store" });
        const currentTemplate = tplGetRes.ok ? (await tplGetRes.json()).data : null;

        return NextResponse.json({
            success: true,
            template: {
                ...currentTemplate,
                parameters: updatedParams
            }
        });
    } catch (e) {
        console.error("API Error updating QA template:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to update QA template" }, { status: 500 });
    }
}
