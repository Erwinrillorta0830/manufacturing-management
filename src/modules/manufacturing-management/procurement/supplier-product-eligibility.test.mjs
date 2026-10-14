import assert from "node:assert/strict";
import test from "node:test";
import {
    filterSupplierCatalogProducts,
    getSupplierCatalogUomOptions,
    getSupplierProductTypeLabel,
    isSupplierEligibleProductType
} from "./supplier-product-eligibility.ts";

test("supplier catalog recognizes all supported product types", () => {
    for (const productType of [388, 389, 390]) {
        assert.equal(isSupplierEligibleProductType(productType), true);
    }

    assert.equal(isSupplierEligibleProductType(391), false);
    assert.equal(isSupplierEligibleProductType(null), false);
});

test("supplier catalog labels Finished Goods, Raw Materials, and Packaging Items", () => {
    assert.equal(getSupplierProductTypeLabel(388), "Finished Goods");
    assert.equal(getSupplierProductTypeLabel(389), "Raw Materials");
    assert.equal(getSupplierProductTypeLabel(390), "Packaging Items");
});

test("supplier catalog uses available type names and handles unknown classifications", () => {
    assert.equal(getSupplierProductTypeLabel({ id: 388, name: "Finished Goods" }), "Finished Goods");
    assert.equal(getSupplierProductTypeLabel(389, "Raw Material"), "Raw Material");
    assert.equal(getSupplierProductTypeLabel(391), "Unclassified");
});

test("supplier catalog filters can be combined with search", () => {
    const products = [
        { product_name: "Finished Bottle", product_code: "FG-1", product_type: 388, unit_of_measurement: { unit_id: 1 } },
        { product_name: "Raw Bottle", product_code: "RM-1", product_type: 389, unit_of_measurement: { unit_id: 1 } },
        { product_name: "Finished Box", product_code: "FG-2", product_type: 388, unit_of_measurement: { unit_id: 2 } }
    ];

    assert.deepEqual(filterSupplierCatalogProducts(products, {
        searchTerm: "",
        productTypeId: "389",
        unitId: "all"
    }), [products[1]]);
    assert.deepEqual(filterSupplierCatalogProducts(products, {
        searchTerm: "",
        productTypeId: "all",
        unitId: "2"
    }), [products[2]]);
    assert.deepEqual(filterSupplierCatalogProducts(products, {
        searchTerm: "finished",
        productTypeId: "388",
        unitId: "1"
    }), [products[0]]);
    assert.deepEqual(filterSupplierCatalogProducts(products, {
        searchTerm: "",
        productTypeId: "all",
        unitId: "all"
    }), products);
    assert.deepEqual(filterSupplierCatalogProducts(products, {
        searchTerm: "not found",
        productTypeId: "all",
        unitId: "all"
    }), []);
});

test("supplier catalog UOM options are unique and use the unit name when shortcut is missing", () => {
    assert.deepEqual(getSupplierCatalogUomOptions([
        { unit_of_measurement: { unit_id: 1, unit_shortcut: "PCS", unit_name: "Pieces" } },
        { unit_of_measurement: { unit_id: 1, unit_shortcut: "PCS", unit_name: "Pieces" } },
        { unit_of_measurement: { unit_id: 2, unit_name: "Bag" } },
        { unit_of_measurement: null }
    ]), [
        { value: "2", label: "Bag" },
        { value: "1", label: "PCS" }
    ]);
});
