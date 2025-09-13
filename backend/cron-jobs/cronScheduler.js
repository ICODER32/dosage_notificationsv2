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

// Create router for call handling endpoints
const callRouter = Router();

// Helper function to make interactive phone calls
async function makeInteractiveCall(phoneNumber, notificationId) {
  try {
    const call = await client.calls.create({
      url: `http://18.218.16.247/api/calls/handle?notificationId=${notificationId}`,
      to: `+${phoneNumber}`,
      from: process.env.TWILIO_PHONE_NUMBER,
    });
    console.log(`Interactive call initiated to ${phoneNumber}: ${call.sid}`);
    return call;
  } catch (error) {
    console.error(`Error making call to ${phoneNumber}:`, error);
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
    console.log(`SMS sent to ${phoneNumber}: ${sms.sid}`);
    return sms;
  } catch (error) {
    console.error(`Error sending SMS to ${phoneNumber}:`, error);
    throw error;
  }
}

export function startReminderCron() {
  cron.schedule("*/1 * * * *", async () => {
    const now = moment.utc();
    console.log(
      `⏰ Starting reminder check at ${now.format("YYYY-MM-DD HH:mm:ss")} UTC`
    );

    try {
      const activeUsers = await User.find({
        status: "active",
        notificationsEnabled: true,
      });

      for (const user of activeUsers) {
        try {
          const userTimezone = user.timezone || "UTC";

          // Find due reminders that haven't been processed
          const dueReminders = user.medicationSchedule.filter((schedule) => {
            if (schedule.status !== "pending") return false;
            if (schedule.remainderSent) return false;

            const scheduledTime = moment.utc(schedule.scheduledTime);
            const timeDiff = Math.abs(scheduledTime.diff(now, "minutes"));
            return timeDiff <= 1; // Within 2-minute window
          });

          if (dueReminders.length === 0) continue;

          // Create notification with schedule IDs
          const scheduleIds = dueReminders.map((r) => r._id);
          const uniqueMeds = [
            ...new Set(dueReminders.map((r) => r.prescriptionName)),
          ];

          // Format message
          let message = `CareTrackRX Reminder\n\n💊 It's time to take:\n`;
          dueReminders.forEach((reminder) => {
            const timeStr = moment
              .utc(reminder.scheduledTime)
              .tz(userTimezone)
              .format("h:mm A");
            message += `\n• ${reminder.prescriptionName} at ${timeStr}`;
          });
          message += `\n\nReply:\nD - Taken\nS - Skip`;

          // Create notification record first to get its ID
          const notification = {
            sentAt: now.toDate(),
            message: `Reminder for ${uniqueMeds.join(", ")}`,
            status: "pending",
            medications: uniqueMeds,
            scheduleIds,
            resends: 0,
            notificationType: user.notificationType || "sms",
          };

          user.notificationHistory.push(notification);
          await user.save();

          // Get the notification ID that was just created
          const notificationId = user.notificationHistory.slice(-1)[0]._id;

          // Send notification based on user preference
          if (user.notificationType === "call") {
            try {
              await makeInteractiveCall(user.phoneNumber, notificationId);
            } catch (error) {
              // Fallback to SMS if call fails
              console.log(`Falling back to SMS for ${user.phoneNumber}`);
              await sendSMS(user.phoneNumber, message);
            }
          } else {
            // Default to SMS
            await sendSMS(user.phoneNumber, message);
          }

          // Update flags
          dueReminders.forEach((reminder) => {
            reminder.remainderSent = true;
          });

          await user.save();
        } catch (error) {
          console.error(`Error processing ${user.phoneNumber}:`, error);
        }
      }
    } catch (error) {
      console.error("Critical error in reminder cycle:", error);
    }
  });
}

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

    // Pick the username(s) linked to the skipped meds
    const skippedFor = Object.keys(prescriptionsMap).join(", ");

    const message =
      `⚠️ ${skippedFor} has ${operation}:\n` +
      medicationsToNotify.map((m) => `• ${m.name}`).join("\n");

    try {
      await sendSMS(caregiver.phoneNumber, message);
      console.log(`   👩‍⚕️ Caregiver notified: ${caregiver.phoneNumber}`);
    } catch (error) {
      console.error(
        `   ❌ Failed to notify caregiver ${caregiver.phoneNumber}:`,
        error
      );
    }
  }
}

export function startReminderFollowupCron() {
  cron.schedule("*/1 * * * *", async () => {
    const now = moment.utc();
    console.log(
      `🔁 Checking follow-up reminders at ${now.format(
        "YYYY-MM-DD HH:mm:ss"
      )} UTC`
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
            console.log(
              `🚫 Marked reminder as skipped for ${user.phoneNumber}`
            );
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
    const message = `
   
    It's time to take your medications: ${medList}.\n\nPlease reply:\nD – if you have taken them\nS – if you need to skip this dose\n\nThank you for using CareTrackRX.`;

    if (user.notificationType === "call" && resendCount === 0) {
      // Only make call for first follow-up, then use SMS
      try {
        await makeInteractiveCall(user.phoneNumber, notification._id);
      } catch (error) {
        // Fallback to SMS
        await sendSMS(user.phoneNumber, message);
      }
    } else {
      await sendSMS(user.phoneNumber, message);
    }

    console.log(`📤 Follow-up sent to ${user.phoneNumber}`);

    notification.resends = resendCount;
  } catch (error) {
    console.error(`❌ Failed to resend to ${user.phoneNumber}:`, error);
    notification.status = "failed";
    notification.error = error.message;
  }
}

function scheduleNightlyRefresh() {
  cron.schedule("0 3 * * *", async () => {
    // 3 AM daily
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

      // Preserve completed items
      const completedItems = user.medicationSchedule.filter(
        (item) => item.status !== "pending"
      );

      // Generate new schedule
      const newSchedule = generateMedicationSchedule(
        allReminders,
        user.timezone
      );

      user.medicationSchedule = [...completedItems, ...newSchedule];
      await user.save();
    }
  });
}

// scheduleNightlyRefresh();
