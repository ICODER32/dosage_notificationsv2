import { calculateReminderTimes, generateMedicationSchedule } from "./utils/scheduler.js";
import { DateTime } from "luxon";

const wakeTime = "08:30";
const sleepTime = "20:15";
const timezone = "Asia/Karachi";

console.log("--- Testing calculateReminderTimes ---");
// Panadol 30 mg, 2 times a day
const reminders = calculateReminderTimes(
    wakeTime,
    sleepTime,
    "Take in morning",
    2, // frequency
    "Panadol 30 mg",
    7, // pillCount
    1  // dosage
);

console.log("Calculated Reminders:", JSON.stringify(reminders, null, 2));

console.log("\n--- Testing generateMedicationSchedule ---");
const schedule = generateMedicationSchedule(reminders, timezone);

// Check for duplicates in schedule
const scheduledTimes = schedule.map(s => s.scheduledTime);
console.log("Scheduled Times:", scheduledTimes);

// Check if any duplicates (same time)
const uniqueScheduledTimes = [...new Set(scheduledTimes)];
if (scheduledTimes.length !== uniqueScheduledTimes.length) {
    console.log("DUPLICATES FOUND in Schedule!");
} else {
    console.log("No exact duplicates in Schedule.");
}

// Check for "staggered duplicates" (e.g. same day having multiple sets)
// Group by day
const byDay = {};
schedule.forEach(s => {
    const day = s.scheduledTime.split("T")[0];
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(s.scheduledTime);
});
console.log("Schedule by Day:", JSON.stringify(byDay, null, 2));
