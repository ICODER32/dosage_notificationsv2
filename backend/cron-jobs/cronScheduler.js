import cron from "node-cron";
import moment from "moment-timezone";
import User from "../models/user.model.js";
import twilio from "twilio";
import dotenv from "dotenv";
import { Router } from "express";
dotenv.config();
import {
  calculateReminderTimes,
  generateMedicationSchedule,
} from "../utils/scheduler.js";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Router for call handling
const callRouter = Router();

// Helper function to make interactive phone calls
export async function makeInteractiveCall(phoneNumber, notificationId) {
  try {
    const call = await client.calls.create({
      url: `http://18.218.16.247/api/calls/handle?notificationId=${notificationId}`,
      to: `+${phoneNumber}`,
      from: process.env.TWILIO_PHONE_NUMBER,
    });
    return call; // contains call.sid if accepted
  } catch (error) {
    console.error(`❌ Error making call to ${phoneNumber}:`, error.message);
    throw new Error("CALL_NOT_PLACED"); // only trigger SMS fallback if not accepted
  }
}

// Helper function to send SMS
async function sendSMS(phoneNumber, message) {
  try {
    const sms = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: `+${phoneNumber}`,
    });
    console.log(message);
    console.log(`💬 SMS sent to ${phoneNumber}: ${sms.sid}`);
    return sms;
  } catch (error) {
    console.error(`❌ Error sending SMS to ${phoneNumber}:`, error);
    throw error;
  }
}

/**
 * Cron Job — Send reminders
 * Runs every minute and sends per-medication calls/SMS
 */
export function startReminderCron() {
  cron.schedule("* * * * *", async () => {
    const now = moment.utc();

    try {
      const users = await User.find({ notificationsEnabled: true });

      for (const user of users) {
        const userTimezone = user.timezone || "UTC";

        // Filter due reminders
        const dueReminders = user.medicationSchedule.filter(
          (r) =>
            r.status === "pending" &&
            !r.reminderSent &&
            moment.utc(r.scheduledTime).isSame(now, "minute")
        );

        if (dueReminders.length === 0) continue;

        // === group reminders by scheduled time ===
        const groupedReminders = dueReminders.reduce((acc, reminder) => {
          const timeKey = moment.utc(reminder.scheduledTime).format(); // ISO minute key
          if (!acc[timeKey]) acc[timeKey] = [];
          acc[timeKey].push(reminder);
          return acc;
        }, {});

        // Process each group (time slot)
        for (const [timeKey, remindersAtSameTime] of Object.entries(
          groupedReminders
        )) {
          const scheduleIds = remindersAtSameTime.map((r) => r._id);
          const meds = remindersAtSameTime.map((r) => r.prescriptionName);

          const timeStr = moment
            .utc(remindersAtSameTime[0].scheduledTime)
            .tz(userTimezone)
            .format("h:mm A");

          // Build single message
          const message = `It's time to take your medications:\n${meds
            .map((m) => `• ${m} at ${timeStr}`)
            .join(
              "\n"
            )}\n\nReply:\nD - if taken\nS - if skipped\n\nThank you for using CareTrackRx.`;

          // Push single notification
          const notification = {
            sentAt: now.toDate(),
            message: `Reminder for ${meds.join(", ")}`,
            status: "pending",
            medications: meds,
            scheduleIds,
            resends: 0,
            notificationType: user.notificationType || "sms",
          };

          user.notificationHistory.push(notification);
          await user.save();
          const notificationId = user.notificationHistory.slice(-1)[0]._id;

          // === Send notification ===
          if (user.notificationType === "call") {
            try {
              const call = await makeInteractiveCall(
                user.phoneNumber,
                notificationId
              );

              // Only mark success if Twilio accepted call
              if (call && call.sid) {
                console.log(
                  `📞 Call placed successfully for ${
                    user.phoneNumber
                  }, meds: ${meds.join(", ")}`
                );
              }
            } catch (error) {
              if (error.message === "CALL_NOT_PLACED") {
                console.log(
                  `⚠️ Call not placed, sending fallback SMS to ${user.phoneNumber}`
                );
                await sendSMS(user.phoneNumber, message);
              }
            }
          } else {
            await sendSMS(user.phoneNumber, message);
          }

          // === Mark all reminders in this slot as sent ===
          remindersAtSameTime.forEach((r) => (r.reminderSent = true));
          await user.save();
        }
      }
    } catch (err) {
      console.error("❌ Cron job error:", err.message);
    }
  });
}

/**
 * Notify caregivers when meds are skipped/missed
 */
export async function notifyCaregivers(user, reminders, operation) {
  if (!user.caregivers || user.caregivers.length === 0) return;

  const prescriptionsMap = {};
  reminders.forEach((reminder) => {
    const prescription = user.prescriptions.find(
      (p) => p.name === reminder.prescriptionName
    );
    if (prescription) {
      if (!prescriptionsMap[prescription.username]) {
        prescriptionsMap[prescription.username] = [];
      }
      prescriptionsMap[prescription.username].push({
        name: prescription.name,
        forWho: prescription.forWho,
      });
    }
  });

  for (const caregiver of user.caregivers) {
    if (!caregiver.notificationsEnabled) continue;

    let medicationsToNotify = [];

    caregiver.forPersons.forEach((person) => {
      if (prescriptionsMap[person]) {
        medicationsToNotify.push(...prescriptionsMap[person]);
      }
    });

    if (medicationsToNotify.length === 0) continue;

    const skippedFor = Object.keys(prescriptionsMap).join(", ");

    const message =
      `⚠️ ${skippedFor} has ${operation}:\n` +
      medicationsToNotify.map((m) => `• ${m.name}`).join("\n");

    try {
      await sendSMS(caregiver.phoneNumber, message);
      console.log(`   👩‍⚕️ Caregiver notified: ${caregiver.phoneNumber}`);
    } catch (error) {
      console.error(
        `   ❌ Failed caregiver SMS ${caregiver.phoneNumber}:`,
        error
      );
    }
  }
}

/**
 * Cron Job — Follow-up reminders
 */
export function startReminderFollowupCron() {
  cron.schedule("*/1 * * * *", async () => {
    const now = moment.utc();
    console.log(
      `🔁 Follow-up check at ${now.format("YYYY-MM-DD HH:mm:ss")} UTC`
    );

    try {
      const users = await User.find({
        status: "active",
        notificationsEnabled: true,
        "notificationHistory.status": "pending",
      });

      for (const user of users) {
        const pendingNotifications = user.notificationHistory.filter(
          (n) => n.status === "pending"
        );

        for (const notification of pendingNotifications) {
          const sentAt = moment(notification.sentAt);
          const minutesPassed = now.diff(sentAt, "minutes");

          if (notification.resends === 0 && minutesPassed >= 20) {
            await sendFollowupReminder(user, notification, 1);
          } else if (notification.resends === 1 && minutesPassed >= 30) {
            await sendFollowupReminder(user, notification, 2);
          } else if (notification.resends === 2 && minutesPassed >= 40) {
            notification.status = "skipped";
            console.log(`🚫 Reminder skipped for ${user.phoneNumber}`);
            const skippedReminders = notification.medications.map((name) => ({
              prescriptionName: name,
            }));
            await notifyCaregivers(user, skippedReminders, "missed");
          }
        }

        await user.save();
      }
    } catch (err) {
      console.error("🚨 Error in follow-up cron:", err);
    }
  });
}

async function sendFollowupReminder(user, notification, resendCount) {
  try {
    const medList = notification.medications.join(", ");
    const message = `Reminder \n\n It's time to take your medications:  \n ${medList}\n\n Please Reply:\nD – if you have taken them \nS – if you need to skip the dose. \n\n Thank you for using CareTrackRx.`;

    if (user.notificationType === "call" && resendCount === 0) {
      try {
        await makeInteractiveCall(user.phoneNumber, notification._id);
      } catch (error) {
        await sendSMS(user.phoneNumber, message);
      }
    } else {
      await sendSMS(user.phoneNumber, message);
    }

    console.log(`📤 Follow-up sent to ${user.phoneNumber}`);
    notification.resends = resendCount;
  } catch (error) {
    console.error(`❌ Follow-up failed for ${user.phoneNumber}:`, error);
    notification.status = "failed";
    notification.error = error.message;
  }
}

/**
 * (Optional) Nightly refresh of medication schedules
 */
function scheduleNightlyRefresh() {
  cron.schedule("0 3 * * *", async () => {
    const activeUsers = await User.find({ status: "active" });

    for (const user of activeUsers) {
      const enabledMeds = user.prescriptions.filter((p) => p.remindersEnabled);

      const allReminders = enabledMeds.flatMap((p) =>
        calculateReminderTimes(
          user.wakeTime,
          user.sleepTime,
          p.instructions,
          p.timesToTake,
          p.name,
          p.tracking.pillCount,
          p.dosage,
          p._id
        )
      );

      const completedItems = user.medicationSchedule.filter(
        (item) => item.status !== "pending"
      );

      const newSchedule = generateMedicationSchedule(
        allReminders,
        user.timezone
      );

      user.medicationSchedule = [...completedItems, ...newSchedule];
      await user.save();
    }
  });
}

/**
 * Cron Job — Low-pill reminder (less than 2 days left)
 * Runs daily at 9 AM UTC
 */
export function startLowPillCheckCron() {
  cron.schedule("0 9 * * *", async () => {
    const now = moment.utc();
    console.log(
      `🧾 Low-pill check running at ${now.format("YYYY-MM-DD HH:mm:ss")} UTC`
    );

    try {
      const users = await User.find({
        status: "active",
        notificationsEnabled: true,
      });

      for (const user of users) {
        if (!user.prescriptions || user.prescriptions.length === 0) continue;

        const lowPillPrescriptions = [];

        for (const prescription of user.prescriptions) {
          // Skip if not tracking pills
          if (
            !prescription.tracking ||
            !prescription.tracking.pillCount ||
            !prescription.timesToTake
          )
            continue;

          // Estimate daily usage (pills per day)
          const pillsPerDay = Array.isArray(prescription.timesToTake)
            ? prescription.timesToTake.length
            : 1;

          const daysLeft = prescription.tracking.pillCount / pillsPerDay;

          if (daysLeft < 2 && prescription.tracking.pillCount > 0) {
            lowPillPrescriptions.push(prescription.name);
          }
        }

        if (lowPillPrescriptions.length > 0) {
          const message = `⚠️ You have less than 2 days of pills left for:\n${lowPillPrescriptions
            .map((m) => `• ${m}`)
            .join(
              "\n"
            )}\n\nPlease arrange a refill soon.\nThank you for using CareTrackRx!`;

          try {
            await sendSMS(user.phoneNumber, message);
            console.log(`💊 Low-pill reminder sent to ${user.phoneNumber}`);
          } catch (error) {
            console.error(
              `❌ Failed low-pill SMS for ${user.phoneNumber}:`,
              error
            );
          }
        }
      }
    } catch (err) {
      console.error("🚨 Error in low-pill check cron:", err);
    }
  });
}

/**
 * Cron Job — Prescription over (pill count = 0)
 * Runs daily at 10 AM UTC
 */
export function startPrescriptionOverCron() {
  cron.schedule("0 10 * * *", async () => {
    const now = moment.utc();
    console.log(
      `🗑️ Prescription-over check at ${now.format("YYYY-MM-DD HH:mm:ss")} UTC`
    );

    try {
      const users = await User.find({ status: "active" });

      for (const user of users) {
        if (!user.prescriptions || user.prescriptions.length === 0) continue;

        const zeroPillPrescriptions = user.prescriptions.filter(
          (p) => p.tracking && p.tracking.pillCount <= 0
        );

        if (zeroPillPrescriptions.length === 0) continue;

        // Send message before deleting
        const message = `✅ Your prescription period is complete for:\n${zeroPillPrescriptions
          .map((p) => `• ${p.name}`)
          .join(
            "\n"
          )}\n\nYour account will now be removed from CareTrackRx.\nStay healthy!`;

        try {
          await sendSMS(user.phoneNumber, message);
          console.log(`📨 Prescription-over SMS sent to ${user.phoneNumber}`);
        } catch (error) {
          console.error(
            `❌ Failed to send end SMS to ${user.phoneNumber}:`,
            error
          );
        }

        // Delete user record
        await User.deleteOne({ _id: user._id });
        console.log(`🗑️ User ${user.phoneNumber} deleted due to zero pills.`);
      }
    } catch (err) {
      console.error("🚨 Error in prescription-over cron:", err);
    }
  });
}

// Uncomment if you want to auto-refresh
// scheduleNightlyRefresh();

export default callRouter;
