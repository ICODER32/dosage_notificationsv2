import { calculateReminderTimes, generateMedicationSchedule } from "./utils/scheduler.js";
import { DateTime } from "luxon";
import moment from "moment-timezone";

const wakeTime = "07:00";
const sleepTime = "23:00";
const timezone = "UTC";

// Med A: 1 dose, enough pills for 1 day
const medA = calculateReminderTimes(wakeTime, sleepTime, "", 1, "Gabapentin", 1, 1);
// Med B: 1 dose, enough pills for 2 days
const medB = calculateReminderTimes(wakeTime, sleepTime, "", 1, "Panadol", 2, 1);

const allReminders = [
    ...medA.map(r => ({ ...r, prescriptionId: "1" })),
    ...medB.map(r => ({ ...r, prescriptionId: "2" }))
];

const schedule = generateMedicationSchedule(allReminders, timezone);

// Simulate the display logic from user.routes.js (WITH FIX)
const groupedByMed = {};

if (schedule.length > 0) {
    const startDates = schedule.map(i => new Date(i.scheduledTime).getTime());
    const minDate = Math.min(...startDates);
    const windowEnd = minDate + 24 * 60 * 60 * 1000; // 24 hours from first item

    schedule.forEach((item) => {
        if (item.scheduledTime) {
            const itemTime = new Date(item.scheduledTime).getTime();

            if (itemTime < windowEnd) {
                const time12h = moment(item.scheduledTime)
                    .tz(timezone)
                    .format("h:mm A");

                if (!groupedByMed[item.prescriptionName]) {
                    groupedByMed[item.prescriptionName] = new Set();
                }
                groupedByMed[item.prescriptionName].add(time12h);
            }
        }
    });
}

console.log("Display Output:");
for (const [med, timesSet] of Object.entries(groupedByMed)) {
    const times = Array.from(timesSet).sort();
    console.log(`${med}: ${times.join(", ")}`);
}
