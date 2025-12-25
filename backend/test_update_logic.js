
// Mock objects for testing logic
const mockPrescription = {
    name: "Test Med",
    dosage: 1,
    timesToTake: 2,
    initialCount: 30,
    remindersEnabled: true,
    reminderTimes: [], // Initially empty
};

const mockUpdateData = {
    reminderTimes: ["08:00", "20:00"],
};

// Mock backend logic
function updatePrescription(prescription, updateData) {
    let reminderTimes = updateData.reminderTimes;

    if (!reminderTimes || reminderTimes.length === 0) {
        reminderTimes = prescription.reminderTimes;
    }

    // Simulate calculation if still empty (mocked)
    if (!reminderTimes || reminderTimes.length === 0) {
        reminderTimes = ["09:00", "21:00"]; // Default calculated times
    }

    prescription.reminderTimes = reminderTimes;
    return prescription;
}

console.log("Running update logic tests...");

// Test 1: Update with new times
const updated1 = updatePrescription({ ...mockPrescription }, mockUpdateData);
if (JSON.stringify(updated1.reminderTimes) === JSON.stringify(["08:00", "20:00"])) {
    console.log("Test 1 Passed: Updated with new times");
} else {
    console.error("Test 1 Failed", updated1.reminderTimes);
}

// Test 2: Update without times (should keep existing)
const prescriptionWithTimes = { ...mockPrescription, reminderTimes: ["07:00", "19:00"] };
const updated2 = updatePrescription(prescriptionWithTimes, {});
if (JSON.stringify(updated2.reminderTimes) === JSON.stringify(["07:00", "19:00"])) {
    console.log("Test 2 Passed: Kept existing times");
} else {
    console.error("Test 2 Failed", updated2.reminderTimes);
}

// Test 3: Update empty prescription without times (should calculate)
const updated3 = updatePrescription({ ...mockPrescription }, {});
if (JSON.stringify(updated3.reminderTimes) === JSON.stringify(["09:00", "21:00"])) {
    console.log("Test 3 Passed: Calculated default times");
} else {
    console.error("Test 3 Failed", updated3.reminderTimes);
}
