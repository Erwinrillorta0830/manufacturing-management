export type ProductValidationFields = Record<string, string>;

export class ProductRequiredFieldsError extends Error {
    constructor(public readonly fields: ProductValidationFields) {
        super("Please complete the required product fields.");
        this.name = "ProductRequiredFieldsError";
    }

    readonly status = 400;
    readonly code = "PRODUCT_REQUIRED_FIELDS";
}

export interface ValidatedProductEditDetails {
    title: string;
    sku: string;
    productBrand: number;
    productCategory: number;
    unitOfMeasurement: number;
    unitOfMeasurementCount: number;
    densityFactor: number;
    expectedYield: number;
    productShelfLife: number;

}

export interface ValidatedProductRegistrationDetails {
    productName: string;
    productCode: string;
    productBrand: number;
    productCategory: number;
    unitOfMeasurement: number;
    unitOfMeasurementCount: number;
    densityFactor: number;
    expectedYield: number;
    productShelfLife: number;

    versionName: string;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === "object" && value !== null;
}

function readText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function readPositiveId(value: unknown): number | null {
    if (typeof value === "object" && value !== null) {
        const obj = value as Record<string, unknown>;
        const idCandidate = obj.brand_id ?? obj.category_id ?? obj.unit_id ?? obj.id;
        const parsedObjId = readNumber(idCandidate);
        if (parsedObjId !== null && Number.isInteger(parsedObjId) && parsedObjId > 0) {
            return parsedObjId;
        }
    }
    const parsed = readNumber(value);
    return parsed !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function addEditValidationErrors(input: unknown): ProductValidationFields {
    const fields: ProductValidationFields = {};
    const details = isRecord(input) ? input : {};

    const title = readText(details.title);
    if (!title) fields.title = "Product Title is required.";

    const sku = readText(details.sku);
    if (!sku) fields.sku = "SKU / Code is required.";

    if (readPositiveId(details.productBrand) === null) {
        fields.productBrand = "Brand is required.";
    }

    if (readPositiveId(details.productCategory) === null) {
        fields.productCategory = "Category is required.";
    }

    if (readPositiveId(details.unit_of_measurement) === null) {
        fields.unit_of_measurement = "Base UOM is required.";
    }

    const unitOfMeasurementCount = readNumber(details.unitOfMeasurementCount);
    if (unitOfMeasurementCount === null || unitOfMeasurementCount <= 0) {
        fields.unitOfMeasurementCount = "UOM Count must be greater than 0.";
    }

    const densityFactor = readNumber(details.densityFactor);
    if (densityFactor === null || densityFactor <= 0) {
        fields.densityFactor = "Density Factor must be greater than 0.";
    }

    const expectedYield = readNumber(details.expected_yield_percentage ?? details.expectedYieldPercent);
    if (expectedYield === null || expectedYield <= 0 || expectedYield > 100) {
        fields.expected_yield_percentage = "Expected Yield must be between 1 and 100.";
    }

    const productShelfLife = readNumber(details.productShelfLife);
    if (productShelfLife === null || productShelfLife <= 0) {
        fields.productShelfLife = "Shelf Life must be greater than 0.";
    }



    return fields;
}

export function getProductEditValidationErrors(input: unknown): ProductValidationFields {
    return addEditValidationErrors(input);
}

export function validateProductEditDetails(input: unknown): ValidatedProductEditDetails {
    const fields = addEditValidationErrors(input);
    if (Object.keys(fields).length > 0) {
        throw new ProductRequiredFieldsError(fields);
    }

    const details = isRecord(input) ? input : {};
    return {
        title: readText(details.title),
        sku: readText(details.sku),
        productBrand: readPositiveId(details.productBrand) as number,
        productCategory: readPositiveId(details.productCategory) as number,
        unitOfMeasurement: readPositiveId(details.unit_of_measurement) as number,
        unitOfMeasurementCount: readNumber(details.unitOfMeasurementCount) as number,
        densityFactor: readNumber(details.densityFactor) as number,
        expectedYield: readNumber(details.expected_yield_percentage ?? details.expectedYieldPercent) as number,
        productShelfLife: readNumber(details.productShelfLife) as number
    };
}

function addRegistrationValidationErrors(input: unknown): ProductValidationFields {
    const fields: ProductValidationFields = {};
    const body = isRecord(input) ? input : {};
    const productDetails = isRecord(body.productDetails) ? body.productDetails : {};

    if (!readText(productDetails.product_name)) fields.title = "Product Name is required.";
    if (!readText(productDetails.product_code)) fields.sku = "SKU / Code is required.";
    if (readPositiveId(productDetails.product_brand) === null) fields.brandId = "Brand is required.";
    if (readPositiveId(productDetails.product_category) === null) fields.categoryId = "Category is required.";
    if (readPositiveId(productDetails.unit_of_measurement) === null) fields.baseUom = "Base UOM is required.";

    const uomCount = readNumber(productDetails.unit_of_measurement_count);
    if (uomCount === null || uomCount <= 0) fields.uomCount = "UOM Count (Pack Mult) must be greater than 0.";

    const densityFactor = readNumber(productDetails.density_factor);
    if (densityFactor === null || densityFactor <= 0) fields.densityFactor = "Density conversion factor must be greater than 0.";

    const expectedYield = readNumber(body.expectedYield);
    if (expectedYield === null || expectedYield <= 0 || expectedYield > 100) {
        fields.expectedYield = "Expected Yield (%) must be between 1 and 100.";
    }

    const shelfLife = readNumber(productDetails.product_shelf_life);
    if (shelfLife === null || shelfLife <= 0) fields.shelfLife = "Shelf Life is required and must be greater than 0.";



    if (!readText(body.versionName)) fields.versionName = "Version Name is required.";
    return fields;
}

export function getProductRegistrationValidationErrors(input: unknown): ProductValidationFields {
    return addRegistrationValidationErrors(input);
}

export function validateProductRegistration(input: unknown): ValidatedProductRegistrationDetails {
    const fields = addRegistrationValidationErrors(input);
    if (Object.keys(fields).length > 0) {
        throw new ProductRequiredFieldsError(fields);
    }

    const body = isRecord(input) ? input : {};
    const productDetails = isRecord(body.productDetails) ? body.productDetails : {};
    return {
        productName: readText(productDetails.product_name),
        productCode: readText(productDetails.product_code),
        productBrand: readPositiveId(productDetails.product_brand) as number,
        productCategory: readPositiveId(productDetails.product_category) as number,
        unitOfMeasurement: readPositiveId(productDetails.unit_of_measurement) as number,
        unitOfMeasurementCount: readNumber(productDetails.unit_of_measurement_count) as number,
        densityFactor: readNumber(productDetails.density_factor) as number,
        expectedYield: readNumber(body.expectedYield) as number,
        productShelfLife: readNumber(productDetails.product_shelf_life) as number,
        versionName: readText(body.versionName)
    };
}
