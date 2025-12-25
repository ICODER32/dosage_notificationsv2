
// Mock validation functions for testing
function validateStrictTime(input) {
    const timeRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s*(am|pm)$/i;
    return timeRegex.test(input.trim());
}

const testCases = [
    { input: "7:00 AM", expected: true },
    { input: "07:00 AM", expected: true },
    { input: "7:00 am", expected: true },
    { input: "12:59 PM", expected: true },
    { input: "1:00 PM", expected: true },
    { input: "7 AM", expected: false }, // No colon
    { input: "7:00", expected: false }, // No AM/PM
    { input: "13:00 PM", expected: false }, // Invalid hour
    { input: "00:00 AM", expected: false }, // Invalid hour
    { input: "7:60 AM", expected: false }, // Invalid minute
    { input: " 7:00 AM ", expected: true }, // Trimming
    { input: "invalid", expected: false },
];

console.log("Running validation tests...");
let passed = 0;
testCases.forEach(({ input, expected }) => {
    const result = validateStrictTime(input);
    if (result === expected) {
        passed++;
    } else {
        console.error(`FAILED: "${input}" -> Got ${result}, expected ${expected}`);
    }
});

console.log(`Passed ${passed}/${testCases.length} tests.`);

if (passed === testCases.length) {
    console.log("All tests passed!");
} else {
    console.error("Some tests failed.");
    process.exit(1);
}
