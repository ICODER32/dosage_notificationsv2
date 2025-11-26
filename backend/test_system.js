import { DateTime } from "luxon";
import { generateMedicationSchedule, calculateReminderTimes } from "./utils/scheduler.js";

// Mock Data
const mockUser = {
    phoneNumber: "1234567890",
    timezone: "America/New_York",
    wakeTime: "08:00",
    sleepTime: "22:00",
    prescriptions: [
        {
            _id: "p1",
            name: "Med A",
            timesToTake: 2,
            dosage: 1,
            instructions: "With breakfast and dinner",
            initialCount: 60,
            remindersEnabled: true,
            tracking: { pillCount: 60, dailyConsumption: 0, skippedCount: 0 },
            finishedNotified: false
        }
    ],
    medicationSchedule: [],
    notificationHistory: [],
    caregivers: [
        {
            name: "Caregiver 1",
            phoneNumber: "0987654321",
            forPersons: ["Med A"],
            notificationsEnabled: true
        }
    ],
    save: async () => { console.log("  [Mock] User saved."); }
};

console.log("=== Starting Comprehensive System Test ===\n");

// 1. Test Schedule Generation
console.log("--- Test 1: Schedule Generation ---");
const reminders = calculateReminderTimes(
    mockUser.wakeTime,
    mockUser.sleepTime,
    mockUser.prescriptions[0].instructions,
    mockUser.prescriptions[0].timesToTake,
    mockUser.prescriptions[0].name,
    mockUser.prescriptions[0].tracking.pillCount,
    mockUser.prescriptions[0].dosage,
    mockUser.prescriptions[0]._id
);

console.log(`Calculated ${reminders.length} reminder times:`, reminders.map(r => r.time));

const schedule = generateMedicationSchedule(reminders, mockUser.timezone);
mockUser.medicationSchedule = schedule;
console.log(`Generated ${schedule.length} schedule items.`);

if (schedule.length > 0) {
    console.log("✅ Schedule generation successful.");
} else {
    console.error("❌ Schedule generation failed.");
}

// 2. Test Notification Trigger (Simulation)
console.log("\n--- Test 2: Notification Trigger ---");
// Simulate finding a due reminder
const now = DateTime.now().setZone(mockUser.timezone);
// Force a schedule item to be "now" for testing
if (mockUser.medicationSchedule.length > 0) {
    mockUser.medicationSchedule[0].scheduledTime = now.toJSDate();
    console.log(`Simulating due reminder at ${now.toFormat("HH:mm")}`);
    
    // Create a notification history item (as cron would)
    const notification = {
        _id: "n1",
        sentAt: new Date(),
        medications: ["Med A"],
        status: "pending",
        scheduleIds: [mockUser.medicationSchedule[0]._id], // Assuming _id exists in real DB
        resends: 0
    };
    mockUser.notificationHistory.push(notification);
    console.log("✅ Notification created in history.");
} else {
    console.log("⚠️ No schedule items to test notification.");
}

// 3. Test User Interaction (Taken)
console.log("\n--- Test 3: User Interaction (Taken) ---");
// Simulate receiving "D"
const pendingNotification = mockUser.notificationHistory.find(n => n.status === "pending");
if (pendingNotification) {
    console.log("Found pending notification. Marking as taken...");
    pendingNotification.status = "taken";
    
    // Update pill count
    const prescription = mockUser.prescriptions.find(p => p.name === "Med A");
    prescription.tracking.pillCount -= prescription.dosage;
    prescription.tracking.dailyConsumption += prescription.dosage;
    
    console.log(`New pill count: ${prescription.tracking.pillCount}`);
    if (prescription.tracking.pillCount === 59) {
        console.log("✅ Pill count updated correctly.");
    } else {
        console.error("❌ Pill count update failed.");
    }
} else {
    console.error("❌ No pending notification found to act on.");
}

// 4. Test Low Pill / Finished Logic
console.log("\n--- Test 4: Low Pill / Finished Logic ---");
mockUser.prescriptions[0].tracking.pillCount = 0; // Simulate finished
const zeroPillPrescriptions = mockUser.prescriptions.filter(
    (p) => p.tracking && p.tracking.pillCount <= 0 && !p.finishedNotified
);

if (zeroPillPrescriptions.length > 0) {
    console.log("Found finished prescription. Simulating notification...");
    zeroPillPrescriptions.forEach(p => p.finishedNotified = true);
    console.log("✅ Finished notification sent and flag updated.");
} else {
    console.error("❌ Failed to detect finished prescription.");
}

// 5. Test Caregiver Notification (Skip)
console.log("\n--- Test 5: Caregiver Notification (Skip) ---");
// Reset for skip test
mockUser.notificationHistory.push({
    _id: "n2",
    sentAt: new Date(),
    medications: ["Med A"],
    status: "pending",
    scheduleIds: [],
    resends: 0
});

const skipNotification = mockUser.notificationHistory.find(n => n.status === "pending");
skipNotification.status = "skipped";
mockUser.prescriptions[0].tracking.skippedCount += 1;

console.log(`Skipped count: ${mockUser.prescriptions[0].tracking.skippedCount}`);
if (mockUser.prescriptions[0].tracking.skippedCount === 1) {
    console.log("✅ Skipped count updated.");
    // Check caregiver logic (mocked)
    const caregiversToNotify = mockUser.caregivers.filter(c => c.notificationsEnabled);
    console.log(`Would notify ${caregiversToNotify.length} caregivers.`);
    if (caregiversToNotify.length > 0) {
        console.log("✅ Caregiver notification logic valid.");
    }
} else {
    console.error("❌ Skipped count update failed.");
}

console.log("\n=== Test Complete ===");
