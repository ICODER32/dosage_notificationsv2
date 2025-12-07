import { resolveScheduleConflicts } from "./utils/scheduler.js";
import { DateTime } from "luxon";

const timezone = "UTC";
const now = new Date();

// Create schedule with Date objects (like Mongoose would return)
const schedule = [
    {
        prescriptionName: "Med A",
        scheduledTime: new Date(now.getTime() + 60 * 60 * 1000), // 1 hour from now
    },
    {
        prescriptionName: "Med B",
        scheduledTime: new Date(now.getTime() + 60 * 60 * 1000), // same time
    }
];

console.log("Initial Schedule (Date objects):");
schedule.forEach(s => console.log(`${s.prescriptionName}: ${s.scheduledTime}`));

try {
    const staggered = resolveScheduleConflicts(schedule, timezone);
    console.log("\nStaggered Schedule:");
    staggered.forEach(s => console.log(`${s.prescriptionName}: ${s.scheduledTime}`));
} catch (e) {
    console.error("\nError:", e);
}
