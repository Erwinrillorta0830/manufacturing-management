import assert from "node:assert/strict";
import test from "node:test";
import { attachTemplateParameters } from "./_template-parameters.ts";

test("groups QA parameters by template in one pass and leaves templates without parameters empty", () => {
    const templates = [
        { template_id: 1, template_name: "Mixing" },
        { template_id: 2, template_name: "Packing" },
        { template_id: 3, template_name: "No checks" },
    ];
    const parameters = [
        { parameter_id: 12, template_id: 2, test_name: "Seal" },
        { parameter_id: 11, template_id: { template_id: 1 }, test_name: "Temperature" },
        { parameter_id: 13, template_id: 1, test_name: "Texture" },
    ];

    const result = attachTemplateParameters(templates, parameters);

    assert.deepEqual(result.map((template) => template.parameters.map((parameter) => parameter.parameter_id)), [
        [11, 13],
        [12],
        [],
    ]);
    assert.equal(result[0].template_name, "Mixing");
});
