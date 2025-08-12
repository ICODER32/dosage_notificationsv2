ngrok tunnel --label edge=edghts_2UD16Fgmmd5uszxlhhKSXK8yS6T http://localhost:5000

{
"firstName": "John",
"lastName": "Doe",
"phoneNumber": "923180544604",
"prescriptions": [
{
"name": "Metformin",
"timesToTake": 2,
"dosage": 1,
"initialCount": 60
},
{
"name": "Lisinopril",
"timesToTake": 1,
"dosage": 1,
"initialCount": 30
},
{
"name": "Atorvastatin",
"timesToTake": 1,
"dosage": 1,
"initialCount": 30
}
],
"description": "Test patient with diabetes and hypertension"
}

import express from "express";
import User from "../models/user.model.js";
import { configDotenv } from "dotenv";
import twilio from "twilio";
import {
calculateReminderTimes,
generateMedicationSchedule,
} from "../utils/scheduler.js";
import cron from "node-cron";
import moment from "moment";

configDotenv();
const router = express.Router();
const client = twilio(
process.env.TWILIO_ACCOUNT_SID,
process.env.TWILIO_AUTH_TOKEN
);

// Background job for check-ins
cron.schedule("0 1 \* \* _", async () => {
const inactiveUsers = await User.find({
status: "paused",
"tracking.optOutDate": {
$lte: new Date(Date.now() - 7 _ 24 _ 60 _ 60 \* 1000),
},
});

for (const user of inactiveUsers) {
await sendMessage(
user.phoneNumber,
`Hi! Would you like to resume your medication reminders? Reply RESUME to continue.`
);
}
});

// SMS Reply Handler
router.post("/sms/reply", async (req, res) => {
const from = req.body.From;
const msg = req.body.Body?.trim();

if (!from || !msg) return res.sendStatus(400);

const phone = from.replace("whatsapp:+", "");
let user = await User.findOne({ phoneNumber: phone });

if (!user) {
return sendMessage(
phone,
"You are not registered with any medications. Please contact your pharmacy."
);
}
if (!user.temp) {
user.temp = {};
}
const lowerMsg = msg.toLowerCase();
let reply = "";
let additionalMessage = null;
let handled = false;
const now = new Date();

// Handle special commands
if (lowerMsg === "h" || lowerMsg === "help") {
reply = `Commands:\n\nT – set time\nD – confirm taken\nS – skip dose\nSTOP – stop reminders\nPAUSE - Doctor Advice or Breaks\nREMINDER- Continue after STOP\nRESUME Continue after PAUSE\nCANCEL - cancel reminders`;
handled = true;
}

if (!handled && (lowerMsg === "t" || lowerMsg === "set time")) {
const enabledMeds = user.prescriptions.filter(p => p.remindersEnabled);

    if (enabledMeds.length === 0) {
      reply = "You don't have any active medications. Enable reminders first.";
      handled = true;
    } else {
      // Build medication list with current times from medicationSchedule
      const medList = enabledMeds
        .map((p, i) => {
          // Get current times for this medication from schedule
          const medTimes = user.medicationSchedule
            .filter(item => item.prescriptionName === p.name)
            .map(item => moment(item.scheduledTime).format('h:mm A'));

          // Get unique times
          const uniqueTimes = [...new Set(medTimes)];

          return `${i + 1}. ${p.name} (Current times: ${uniqueTimes.join(', ') || 'not set'})`;
        })
        .join("\n");

      reply = `Which pill would you like to set a custom time for?\nReply with a number:\n${medList}\n(Type the number of the pill you want to change.)`;
      user.flowStep = "set_time_select_med";
      user.temp = {}; // Initialize temp object
      handled = true;
    }

}

if (!handled && lowerMsg === "pause") {
user.status = "paused";
user.tracking.optOutDate = now;
user.prescriptions.forEach((p) => {
p.remindersEnabled = false;
});
user.medicationSchedule = [];
reply = "Reminders paused for all medications. Text RESUME to resume.";
handled = true;
}

if (!handled && lowerMsg === "resume") {
if (user.status === "paused") {
user.status = "active";
user.notificationsEnabled = true;
user.prescriptions.forEach((p) => {
p.remindersEnabled = true;
});

      const enabledMeds = user.prescriptions.filter((p) => p.remindersEnabled);
      const allReminders = enabledMeds.flatMap((p) => {
        return calculateReminderTimes(
          user.wakeTime,
          user.sleepTime,
          p.instructions,
          p.timesToTake,
          p.name,
          p.tracking.pillCount,
          p.dosage
        ).map(r => ({
          time: r.time,
          prescriptionName: p.name,
          pillCount: p.tracking.pillCount,
          dosage: p.dosage
        }));
      });

      const uniqueReminders = Array.from(
        new Map(
          allReminders.map((r) => [`${r.prescriptionName}-${r.time}`, r])
        ).values()
      );

      uniqueReminders.sort(
        (a, b) => moment(a.time, "HH:mm") - moment(b.time, "HH:mm")
      );

      user.reminderTimes = uniqueReminders.map((r) => r.time);
      user.medicationSchedule = generateMedicationSchedule(uniqueReminders);
      user.flowStep = "done";

      reply = "Reminders resumed for all medications!";
    } else {
      reply = "Reminders are already active!";
    }
    handled = true;

}

// Conversation flow
if (!handled) {
switch (user.flowStep) {
case "init":
if (user.prescriptions.length === 0) {
reply =
"You are not registered with any medications. Please contact your pharmacy.";
user.flowStep = "done";
} else {
const medList = user.prescriptions
.map((p, i) => `${i + 1}. ${p.name}`)
.join("\n");

          reply = `Welcome to CareTrackRX! We've registered:\n${medList}\n\nWhich medications would you like reminders for? Reply with numbers separated by commas (e.g., 1,3) or N to skip.`;
          user.flowStep = "ask_reminders";
        }
        break;

      case "ask_reminders":
        // Handle negative response
        if (msg.match(/^(n|no)$/i)) {
          user.prescriptions.forEach(p => {
            p.remindersEnabled = false;
          });
          user.status = 'inactive';
          user.flowStep = 'done';
          reply = "Thank you! Please continue to watch your medication intake.\nYou can return to CareTrackRX anytime by texting the word REMINDER.";
        } else {
          // Process medication selection
          const selected = msg
            .split(",")
            .map((num) => parseInt(num.trim()))
            .filter(
              (num) => !isNaN(num) && num > 0 && num <= user.prescriptions.length
            );

          if (selected.length === 0) {
            reply =
              "Okay, we won't send any reminders. You can enable them later by texting REMINDERS.";
            user.flowStep = "done";
            user.status = "inactive";
          } else {
            user.prescriptions.forEach((prescription, index) => {
              prescription.remindersEnabled = selected.includes(index + 1);
            });

            const needInstructions = user.prescriptions.some(
              (p) => p.remindersEnabled && !p.instructions
            );

            if (needInstructions) {
              reply =
                "Do you have any special instructions for these medications? (e.g., 'Take with food', 'Before bed')";
              user.flowStep = "ask_instructions";
            } else {
              reply = "What time do you usually wake up? (e.g., 7 AM)";
              user.flowStep = "ask_wake_time";
            }
          }
        }
        break;

      case "ask_instructions":
        user.prescriptions.forEach((p) => {
          if (p.remindersEnabled && !p.instructions) {
            p.instructions = msg;
          }
        });

        reply = "What time do you usually wake up? (e.g., 7 AM)";
        user.flowStep = "ask_wake_time";
        break;

      case "ask_wake_time":
        if (validateTime(msg, "morning")) {
          user.wakeTime = parseTime(msg);
          reply =
            "Great! Now, what time do you usually go to sleep? (e.g., 10 PM)";
          user.flowStep = "ask_sleep_time";
        } else {
          reply = "Please enter a valid morning time (e.g., 7 AM)";
        }
        break;

      case "ask_sleep_time":
        if (validateTime(msg, "night")) {
          user.sleepTime = parseTime(msg);

          const enabledMeds = user.prescriptions.filter(
            (p) => p.remindersEnabled
          );

          const allReminders = enabledMeds.flatMap((p) => {
            return calculateReminderTimes(
              user.wakeTime,
              user.sleepTime,
              p.instructions,
              p.timesToTake,
              p.name,
              p.tracking.pillCount,
              p.dosage
            ).map(r => ({
              time: r.time,
              prescriptionName: p.name,
              pillCount: p.tracking.pillCount,
              dosage: p.dosage
            }));
          });

          const uniqueReminders = Array.from(
            new Map(
              allReminders.map((r) => [`${r.prescriptionName}-${r.time}`, r])
            ).values()
          );

          uniqueReminders.sort(
            (a, b) => moment(a.time, "HH:mm") - moment(b.time, "HH:mm")
          );

          user.reminderTimes = uniqueReminders.map((r) => r.time);
          user.medicationSchedule = generateMedicationSchedule(uniqueReminders);
          user.status = "active";
          user.notificationsEnabled = true;
          user.flowStep = "done";

          const formattedTimes = user.reminderTimes.join(", ");
          const medNames = enabledMeds.map((p) => p.name).join(", ");

          reply = `Great! You'll get reminders for ${medNames} at these times: ${formattedTimes}.`;
          additionalMessage = `Reminder setup complete! If you'd like to access your personal settings, visit your dashboard here ${process.env.DASHBOARD_LINK} or type 'h' for help.`;
        } else {
          reply = "Please enter a valid night time (e.g., 10 PM)";
        }
        break;

      case "set_time_select_med":
        const medIndex = parseInt(msg) - 1;
        const enabledMeds = user.prescriptions.filter(p => p.remindersEnabled);

        if (isNaN(medIndex)) {
          reply = "Please enter a valid number from the list.";
        } else if (medIndex < 0 || medIndex >= enabledMeds.length) {
          reply = "Invalid selection. Please choose a number from the list.";
        } else {
          const selectedMed = enabledMeds[medIndex];
          user.temp.selectedMedId = selectedMed._id;
          user.flowStep = "set_time_enter_time";

          // Get current times for this medication from schedule
          const medTimes = user.medicationSchedule
            .filter(item => item.prescriptionName === selectedMed.name)
            .map(item => moment(item.scheduledTime).format('h:mm A'));

          // Get unique times
          const uniqueTimes = [...new Set(medTimes)];
          const currentTimes = uniqueTimes.join(", ") || "not set";

          reply = `You have ${selectedMed.name} at ${currentTimes}. Reply with new time(s) in 12-hour format (e.g., 7am or 8:30pm). For multiple times, separate with commas.`;
        }
        break;

      case "set_time_enter_time":
        if (!user.temp.selectedMedId) {
          reply = "Something went wrong. Please start over.";
          user.flowStep = "done";
          break;
        }

        const prescription = user.prescriptions.find(
          p => p._id.toString() === user.temp.selectedMedId.toString()
        );

        if (!prescription) {
          reply = "Medication not found. Please try again.";
          user.flowStep = "done";
          break;
        }

        // Process time input
        const timeInputs = msg.split(",").map(t => t.trim());
        const validTimes = [];
        let invalidTimes = [];

        for (const timeInput of timeInputs) {
          if (validateTimeAny(timeInput)) {
            validTimes.push(parseTime(timeInput));
          } else {
            invalidTimes.push(timeInput);
          }
        }

        if (validTimes.length === 0) {
          reply = "No valid times entered. Please use formats like 7am or 8:30pm.";
        } else {
          // Instead of customTimes, we'll recalculate the entire schedule
          // with new times for this medication

          // For this medication, use the new times
          // For others, use existing times
          const allEnabledMeds = user.prescriptions.filter(p => p.remindersEnabled);
          const allReminders = allEnabledMeds.flatMap((p) => {
            if (p._id.toString() === prescription._id.toString()) {
              // Use new times for this medication
              return validTimes.map(time => ({
                time,
                prescriptionName: p.name,
                pillCount: p.tracking.pillCount,
                dosage: p.dosage
              }));
            } else {
              // Use existing times for other medications
              const medTimes = user.medicationSchedule
                .filter(item => item.prescriptionName === p.name)
                .map(item => moment(item.scheduledTime).format('HH:mm'));

              const uniqueTimes = [...new Set(medTimes)];

              return uniqueTimes.map(time => ({
                time,
                prescriptionName: p.name,
                pillCount: p.tracking.pillCount,
                dosage: p.dosage
              }));
            }
          });

          const uniqueReminders = Array.from(
            new Map(
              allReminders.map((r) => [`${r.prescriptionName}-${r.time}`, r])
            ).values()
          );

          uniqueReminders.sort(
            (a, b) => moment(a.time, "HH:mm") - moment(b.time, "HH:mm")
          );

          user.reminderTimes = uniqueReminders.map(r => r.time);
          user.medicationSchedule = generateMedicationSchedule(uniqueReminders);
          user.flowStep = "done";

          reply = `Times updated for ${prescription.name}! New times: ${validTimes.join(", ")}.`;

          if (invalidTimes.length > 0) {
            reply += `\nNote: These times were invalid: ${invalidTimes.join(", ")}`;
          }
        }
        break;

      default:
        reply = "Sorry, I didn't understand that. Need help? Text HELP";
    }

}

user.tracking.lastInteraction = now;
await user.save();

if (reply) {
await sendMessage(phone, reply);
}

if (additionalMessage) {
await sendMessage(phone, additionalMessage);
}

return res.sendStatus(200);
});

// Helper function to send messages
async function sendMessage(phone, message) {
try {
// await client.messages.create({
// body: message,
// from: "whatsapp:+14155238886",
// to: `whatsapp:+${phone}`,
// });
// return the response msg
console.log(message)  
 } catch (error) {
console.error("Error sending message:", error);
}
}

// Validate time input (any time)
function validateTimeAny(input) {
const timeRegex = /^(\d{1,2})(?::(\d{2}))?\s\*(am|pm)?$/i;
return timeRegex.test(input);
}

// Validate time input (morning or night)
function validateTime(input, type) {
if (!validateTimeAny(input)) return false;

const timeRegex = /^(\d{1,2})(?::(\d{2}))?\s\*(am|pm)?$/i;
const match = input.match(timeRegex);

let [_, hour, minute, period] = match;
hour = parseInt(hour, 10);
minute = minute ? parseInt(minute, 10) : 0;

// Convert to 24-hour format
if (period) {
period = period.toLowerCase();
if (period === "pm" && hour < 12) hour += 12;
if (period === "am" && hour === 12) hour = 0;
}

// Validate based on time of day
if (type === "morning") {
return hour >= 4 && hour <= 11; // 4 AM to 11 AM
} else {
// night
return (hour >= 20 && hour <= 23) || (hour >= 0 && hour <= 3); // 8 PM to 3 AM
}
}

// Parse time input into HH:mm format
function parseTime(input) {
const timeRegex = /^(\d{1,2})(?::(\d{2}))?\s\*(am|pm)?$/i;
const match = input.match(timeRegex);

if (!match) return "08:00"; // Default if parsing fails

let [_, hour, minute, period] = match;
hour = parseInt(hour, 10);
minute = minute ? parseInt(minute, 10) : 0;

// Convert to 24-hour format
if (period) {
period = period.toLowerCase();
if (period === "pm" && hour < 12) hour += 12;
if (period === "am" && hour === 12) hour = 0;
}

// Format as HH:mm
return `${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")}`;
}

router.get("/getData/:phone", async (req, res) => {
const phone = req.params.phone;
try {
const user = await User.findOne({ phoneNumber: phone }).populate(
"prescriptions",
"name dosage timesToTake instructions remindersEnabled initialCount"
);
if (!user) {
return res.status(404).json({ message: "User not found" });
}

    res.status(200).json(user);

} catch (error) {
console.error("Error fetching user data:", error);
res.status(500).json({ message: "Internal server error" });
}
});

export default router;
in set time when i try to set time for medication and i send time it gives error
Something went wrong. Please start over.

https://1f926fbcf9ed.ngrok-free.app/api/user/sms/reply
https://1f926fbcf9ed.ngrok-free.app/api/call/handle
