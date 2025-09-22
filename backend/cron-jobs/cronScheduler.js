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
async function makeInteractiveCall(phoneNumber, notificationId) {
  try {
    const call = await client.calls.create({
      url: `http://18.218.16.247/api/calls/handle?notificationId=${notificationId}`,
      to: `+${phoneNumber}`,
      from: process.env.TWILIO_PHONE_NUMBER,
    });
    console.log(`📞 Call initiated to ${phoneNumber}: ${call.sid}`);
    return call;
  } catch (error) {
    console.error(`❌ Error making call to ${phoneNumber}:`, error);
    throw error;
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
  cron.schedule("*/1 * * * *", async () => {
    const now = moment.utc();
    console.log(
      `⏰ Reminder check at ${now.format("YYYY-MM-DD HH:mm:ss")} UTC`
    );

    try {
      const activeUsers = await User.find({
        status: "active",
        notificationsEnabled: true,
      });

      for (const user of activeUsers) {
        try {
          const userTimezone = user.timezone || "UTC";

          // Find due reminders
          const dueReminders = user.medicationSchedule.filter((schedule) => {
            if (schedule.status !== "pending") return false;
            if (schedule.remainderSent) return false;

            const scheduledTime = moment.utc(schedule.scheduledTime);
            const timeDiff = Math.abs(scheduledTime.diff(now, "minutes"));
            return timeDiff <= 1;
          });

          if (dueReminders.length === 0) continue;

          // === process each reminder separately ===
          for (const reminder of dueReminders) {
            const medName = reminder.prescriptionName;
            const scheduleId = reminder._id;

            const timeStr = moment
              .utc(reminder.scheduledTime)
              .tz(userTimezone)
              .format("h:mm A");

            const message = ` It's time to take your medications:\n• ${medName} at ${timeStr}\n\nReply:\nD - Taken\nS - Skip \n\n Thank you for using CareTrackRx.`;

            // Create notification for this medication
            const notification = {
              sentAt: now.toDate(),
              message: `Reminder for ${medName}`,
              status: "pending",
              medications: [medName],
              scheduleIds: [scheduleId],
              resends: 0,
              notificationType: user.notificationType || "sms",
            };

            user.notificationHistory.push(notification);
            await user.save();

            const notificationId = user.notificationHistory.slice(-1)[0]._id;

            // Send notification based on user preference
            if (user.notificationType === "call") {
              try {
                await makeInteractiveCall(user.phoneNumber, notificationId);
              } catch (error) {
                console.log(
                  `⚠️ Call failed, fallback SMS for ${user.phoneNumber}`
                );
                await sendSMS(user.phoneNumber, message);
              }
            } else {
              await sendSMS(user.phoneNumber, message);
            }

            // Mark reminder as sent
            reminder.remainderSent = true;
            await user.save();
          }
        } catch (error) {
          console.error(`🚨 Error processing ${user.phoneNumber}:`, error);
        }
      }
    } catch (error) {
      console.error("🚨 Critical error in reminder cycle:", error);
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
    const message = `Remainder \n\n It's time to take your medications:  \n ${medList}\n\n Please Reply:\nD – if you have taken them \nS – if you need to skip the dose. \n\n Thank you for using CareTrackRx.`;

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

// Uncomment if you want to auto-refresh
// scheduleNightlyRefresh();

export default callRouter;
