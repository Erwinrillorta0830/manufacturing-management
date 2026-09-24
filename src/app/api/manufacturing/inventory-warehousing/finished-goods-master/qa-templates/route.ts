/* eslint-disable */
import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export async function GET() {
    try {
        const [templatesRes, parametersRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/quality_inspection_templates?limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/quality_inspection_parameters?limit=-1`, { headers, cache: "no-store" })
        ]);

        if (!templatesRes.ok) throw new Error(`Directus failed to fetch QA templates: ${templatesRes.status}`);
        if (!parametersRes.ok) throw new Error(`Directus failed to fetch QA parameters: ${parametersRes.status}`);

        const templatesJson = await templatesRes.json();
        const parametersJson = await parametersRes.json();

        const templates = templatesJson.data || [];
        const parameters = parametersJson.data || [];

        // Group parameters by template_id
        // disabled-lint-next-line @typescript-eslint/no-explicit-any
        const templatesWithParams = templates.map((tpl: any) => {
            return {
                ...tpl,
                parameters: parameters.filter((param: any) => param.template_id === tpl.template_id)
            };
        });

        return NextResponse.json(templatesWithParams);
    } catch (e) {
        console.error("API Error fetching QA templates:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to fetch QA templates" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { template_name, description, is_active, parameters } = body;

        if (!template_name) {
            return NextResponse.json({ error: "Missing required field: template_name" }, { status: 400 });
        }

        const templatePayload = {
            template_name,
            description: description || null,
            is_active: is_active !== undefined ? !!is_active : true
        };

        const resTpl = await fetch(`${DIRECTUS_URL}/items/quality_inspection_templates`, {
            method: "POST",
            headers,
            body: JSON.stringify(templatePayload)
        });

        if (!resTpl.ok) {
            const errText = await resTpl.text();
            throw new Error(`Directus failed to create QA template: ${resTpl.status} - ${errText}`);
        }

        const tplJson = await resTpl.json();
        const createdTemplate = tplJson.data;
        const templateId = createdTemplate.template_id;

        const createdParams = [];

        if (parameters && Array.isArray(parameters) && parameters.length > 0) {
            for (const param of parameters) {
                const paramPayload = {
                    template_id: templateId,
                    test_name: param.test_name,
                    test_type: param.test_type || "Text",
                    min_value: param.min_value !== undefined ? Number(param.min_value) : null,
                    max_value: param.max_value !== undefined ? Number(param.max_value) : null,
                    target_value: param.target_value !== undefined ? String(param.target_value) : null,
                    uom_id: param.uom_id || null,
                    is_critical: param.is_critical !== undefined ? !!param.is_critical : false
                };

                const resParam = await fetch(`${DIRECTUS_URL}/items/quality_inspection_parameters`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(paramPayload)
                });

                if (resParam.ok) {
                    const paramJson = await resParam.json();
                    createdParams.push(paramJson.data);
                }
            }
        }

        return NextResponse.json({
            success: true,
            template: {
                ...createdTemplate,
                parameters: createdParams
            }
        });
    } catch (e) {
        console.error("API Error creating QA template:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to create QA template" }, { status: 500 });
    }
}
