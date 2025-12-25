// Mock User model and data
const mockUser = {
  phoneNumber: "1234567890",
  prescriptions: [
    {
      name: "Med A",
      tracking: { pillCount: 0 },
      finishedNotified: false,
    },
    {
      name: "Med B",
      tracking: { pillCount: 0 },
      finishedNotified: true,
    },
    {
        name: "Med C",
        tracking: { pillCount: 5 },
        finishedNotified: false,
    }
  ],
  save: async () => { console.log("User saved."); }
};

console.log("Running verification for notification logic...");

// Simulate the cron job logic
const zeroPillPrescriptions = mockUser.prescriptions.filter(
  (p) => p.tracking && p.tracking.pillCount <= 0 && !p.finishedNotified
);

console.log(`Found ${zeroPillPrescriptions.length} prescriptions to notify.`);

if (zeroPillPrescriptions.length === 1 && zeroPillPrescriptions[0].name === "Med A") {
    console.log("✅ Correctly identified Med A for notification.");
} else {
    console.error("❌ Failed to identify correct prescriptions.");
    console.log(zeroPillPrescriptions);
}

// Simulate sending notification and updating flag
if (zeroPillPrescriptions.length > 0) {
    console.log("Simulating SMS send...");
    zeroPillPrescriptions.forEach(p => p.finishedNotified = true);
    console.log("Updated finishedNotified flags.");
}

// Verify flags
if (mockUser.prescriptions[0].finishedNotified === true) {
    console.log("✅ Med A marked as notified.");
} else {
    console.error("❌ Med A NOT marked as notified.");
}

if (mockUser.prescriptions[1].finishedNotified === true) {
    console.log("✅ Med B remains notified.");
}
