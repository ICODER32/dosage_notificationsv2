import { calculateReminderTimes, generateMedicationSchedule } from "./utils/scheduler.js";

const wakeTime = "07:00";
const sleepTime = "23:00";
const timezone = "UTC";

const medA = calculateReminderTimes(wakeTime, sleepTime, "", 1, "Med A", 30, 1);
const medB = calculateReminderTimes(wakeTime, sleepTime, "", 1, "Med B", 30, 1);
const medC = calculateReminderTimes(wakeTime, sleepTime, "", 1, "Med C", 30, 1);

const allReminders = [
    ...medA.map(r => ({ ...r, prescriptionId: "1" })),
    ...medB.map(r => ({ ...r, prescriptionId: "2" })),
    ...medC.map(r => ({ ...r, prescriptionId: "3" }))
];

console.log("Initial Reminders:");
allReminders.forEach(r => console.log(`${r.prescriptionName}: ${r.time}`));

const schedule = generateMedicationSchedule(allReminders, timezone);

console.log("\nGenerated Schedule:");
schedule.forEach(s => {
    // Format nicely
    console.log(`${s.prescriptionName}: ${s.localTime}`);
});
