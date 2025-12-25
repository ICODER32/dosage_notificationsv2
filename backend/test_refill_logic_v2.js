
import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./models/user.model.js";
import { checkLowPills } from "./cron-jobs/cronScheduler.js";

dotenv.config();

const TEST_PHONE = "9999999999";

async function runTest() {
    console.log("🚀 Starting Refill Logic Verification...");

    try {
        // 1. Connect to DB
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected to MongoDB");

        // 2. Clean up previous test user
        await User.deleteOne({ phoneNumber: TEST_PHONE });

        // 3. Create test user
        const user = new User({
            phoneNumber: TEST_PHONE,
            username: "Test User",
            status: "active",
            notificationsEnabled: true,
            prescriptions: [
                {
                    name: "TestMed Refill",
                    timesToTake: 2,
                    dosage: 1,
                    initialCount: 20,
                    remindersEnabled: true,
                    tracking: {
                        pillCount: 20, // Lots of pills left -> Should NOT trigger by low pills
                        dailyConsumption: 0,
                        skippedCount: 0
                    },
                    reminderTimes: ["09:00", "21:00"]
                }
            ],
            // EMPTY medication schedule (all taken or skipped or just empty)
            // This simulates "schedule exhausted"
            medicationSchedule: []
        });

        await user.save();
        console.log("✅ Test user created with 20 pills but EMPTY schedule.");

        // 4. Run the check
        console.log("Run checkLowPills()...");
        await checkLowPills();

        // 5. Verification (Manual check of logs above, or we could spy on console.log)
        console.log("⬇️  CHECK OUTPUT ABOVE  ⬇️");
        console.log("You should see: '💊 Low-pill/Refill reminder sent to 9999999999'");
        console.log("And reason should imply: 'Schedule ended, Refill required'");

    } catch (error) {
        console.error("❌ Test failed:", error);
    } finally {
        // Cleanup
        await User.deleteOne({ phoneNumber: TEST_PHONE });
        await mongoose.disconnect();
        console.log("🏁 Test finished & cleanup done.");
    }
}

runTest();
