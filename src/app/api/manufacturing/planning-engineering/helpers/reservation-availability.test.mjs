import assert from "node:assert/strict";
import { getUnissuedReservationQuantity } from "./reservation-availability.ts";

assert.equal(getUnissuedReservationQuantity(10, 0, 0), 10);
assert.equal(getUnissuedReservationQuantity(10, 8, 0), 2);
assert.equal(getUnissuedReservationQuantity(10, 8, 8), 2);
assert.equal(getUnissuedReservationQuantity(10, 0, 10), 0);
assert.equal(getUnissuedReservationQuantity(10, 12, 12), 0);
assert.equal(getUnissuedReservationQuantity("invalid", 0, 0), 0);

console.log("reservation-availability assertions passed");
