import { generateMedicationSchedule } from "./utils/scheduler.js";
import { DateTime } from "luxon";

console.log("Running verification for schedule generation...");

const timezone = "UTC";
const now = DateTime.now().setZone(timezone);

// Mock reminders
const remindersWithPills = [
  {
    prescriptionName: "Med A",
    prescriptionId: "1",
    time: now.plus({ hours: 1 }).toFormat("HH:mm"),
    dosage: 1,
    pillCount: 10,
  },
];

const remindersNoPills = [
  {
    prescriptionName: "Med B",
    prescriptionId: "2",
    time: now.plus({ hours: 1 }).toFormat("HH:mm"),
    dosage: 1,
    pillCount: 0,
  },
];

console.log("Test 1: Generating schedule for Med A (10 pills)...");
const scheduleA = generateMedicationSchedule(remindersWithPills, timezone);
console.log(`Generated ${scheduleA.length} items for Med A.`);
if (scheduleA.length > 0) {
    console.log("✅ Test 1 Passed: Schedule generated for available pills.");
} else {
    console.error("❌ Test 1 Failed: No schedule generated.");
}

console.log("\nTest 2: Generating schedule for Med B (0 pills)...");
const scheduleB = generateMedicationSchedule(remindersNoPills, timezone);
console.log(`Generated ${scheduleB.length} items for Med B.`);
if (scheduleB.length === 0) {
    console.log("✅ Test 2 Passed: No schedule generated for 0 pills.");
} else {
    console.error("❌ Test 2 Failed: Schedule generated despite 0 pills.");
    console.log(scheduleB);
}
