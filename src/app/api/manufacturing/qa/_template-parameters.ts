type TemplateRecord = Record<string, unknown>;
type ParameterRecord = Record<string, unknown>;

function relationId(value: unknown): number {
    const candidate = typeof value === "object" && value !== null
        ? Number((value as Record<string, unknown>).template_id ?? (value as Record<string, unknown>).id ?? 0)
        : Number(value ?? 0);
    return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : 0;
}

export function attachTemplateParameters(
    templates: TemplateRecord[],
    parameters: ParameterRecord[]
): Array<TemplateRecord & { parameters: ParameterRecord[] }> {
    const parametersByTemplateId = new Map<number, ParameterRecord[]>();
    parameters.forEach((parameter) => {
        const templateId = relationId(parameter.template_id);
        if (!templateId) return;
        const grouped = parametersByTemplateId.get(templateId) || [];
        grouped.push(parameter);
        parametersByTemplateId.set(templateId, grouped);
    });

    return templates.map((template) => {
        const templateId = relationId(template.template_id ?? template.id);
        return {
            ...template,
            parameters: parametersByTemplateId.get(templateId) || []
        };
    });
}
