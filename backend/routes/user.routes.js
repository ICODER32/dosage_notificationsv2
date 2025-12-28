import express from "express";
import User from "../models/user.model.js";
import { configDotenv } from "dotenv";
import twilio from "twilio";
import {
  calculateReminderTimes,
  generateMedicationSchedule,
  resolveScheduleConflicts,
} from "../utils/scheduler.js";
import cron from "node-cron";
import moment from "moment";
import { DateTime } from "luxon";
import momenttimezone from "moment-timezone";
import zipcodeToTimezone from "zipcode-to-timezone";
import cityTimezones from "city-timezones";

configDotenv();
const router = express.Router();
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Background job for check-ins
cron.schedule("0 1 * * *", async () => {
  const inactiveUsers = await User.find({
    status: "paused",
    "tracking.optOutDate": {
      $lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
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
  console.log("Received SMS reply:", req.body);

  const from = req.body.From;
  const msg = req.body.Body?.trim();
  console.log(`Received message from ${from}: ${msg}`);

  if (!from || !msg) return res.sendStatus(400);

  const phone = from.replace("+", "");
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
  // UPDATE TIME ZONE
  let newTimezone = null;

  // 1. Try Zip Code (Best for US)
  if (req.body.FromZip) {
    newTimezone = zipcodeToTimezone.lookup(req.body.FromZip);
    console.log("newTimezone", newTimezone);
  }

  // 2. If no zip match, try City + Country (Worldwide)
  if (!newTimezone && req.body.FromCity && req.body.FromCountry) {
    const cityData = cityTimezones.lookupViaCity(req.body.FromCity);
    if (cityData && cityData.length > 0) {
      // Find match for the specific country
      const countryMatch = cityData.find(c => c.iso2 === req.body.FromCountry) || cityData[0];
      if (countryMatch) {
        newTimezone = countryMatch.timezone;
      }
    }
  }

  const stateTimezones = {
    AL: "America/Chicago", // Alabama – Central
    AK: "America/Anchorage", // Most of Alaska (excluding Aleutian Islands)
    AZ: "America/Phoenix", // Arizona – no DST except Navajo Nation
    AR: "America/Chicago", // Arkansas
    CA: "America/Los_Angeles", // California
    CO: "America/Denver", // Colorado
    CT: "America/New_York", // Connecticut
    DE: "America/New_York", // Delaware
    DC: "America/New_York", // District of Columbia
    FL: "America/New_York", // Florida – majority Eastern (some Panhandle in Central)
    GA: "America/New_York", // Georgia
    HI: "Pacific/Honolulu", // Hawaii – no DST
    ID: "America/Boise", // Idaho – mostly Mountain (some Panhandle in Pacific)
    IL: "America/Chicago", // Illinois
    IN: "America/Indiana/Indianapolis", // Indiana – Eastern majority (some counties in Central)
    IA: "America/Chicago", // Iowa
    KS: "America/Chicago", // Kansas – majority Central (some w. counties in Mountain)
    KY: "America/New_York", // Kentucky – major Eastern (Western KY in Central)
    LA: "America/Chicago", // Louisiana
    ME: "America/New_York", // Maine
    MD: "America/New_York", // Maryland
    MA: "America/New_York", // Massachusetts
    MI: "America/Detroit", // Michigan – majority Eastern (Upper Peninsula western counties in Central)
    MN: "America/Chicago", // Minnesota
    MS: "America/Chicago", // Mississippi
    MO: "America/Chicago", // Missouri
    MT: "America/Denver", // Montana
    NE: "America/Chicago", // Nebraska – majority Central (western in Mountain)
    NV: "America/Los_Angeles", // Nevada – majority Pacific, some in Mountain (e.g., West Wendover)
    NH: "America/New_York", // New Hampshire
    NJ: "America/New_York", // New Jersey
    NM: "America/Denver", // New Mexico
    NY: "America/New_York", // New York
    NC: "America/New_York", // North Carolina
    ND: "America/Chicago", // North Dakota – majority Central (west border counties in Mountain)
    OH: "America/New_York", // Ohio
    OK: "America/Chicago", // Oklahoma – almost entirely Central
    OR: "America/Los_Angeles", // Oregon – majority Pacific (some eastern regions in Mountain)
    PA: "America/New_York", // Pennsylvania
    RI: "America/New_York", // Rhode Island
    SC: "America/New_York", // South Carolina
    SD: "America/Chicago", // South Dakota – majority Central (western in Mountain)
    TN: "America/Chicago", // Tennessee – majority Central (East TN in Eastern)
    TX: "America/Chicago", // Texas – majority Central (West Texas in Mountain)
    UT: "America/Denver", // Utah
    VT: "America/New_York", // Vermont
    VA: "America/New_York", // Virginia
    WA: "America/Los_Angeles", // Washington state
    WV: "America/New_York", // West Virginia
    WI: "America/Chicago", // Wisconsin
    WY: "America/Denver",
    DEU: "Europe/Berlin", // Germany – CET/CEST
  };

  if (!newTimezone && req.body.FromState && stateTimezones[req.body.FromState]) {
    newTimezone = stateTimezones[req.body.FromState];
  }

  // Set the timezone, defaulting to New York if still unknown
  user.timezone = newTimezone || "America/New_York";

  await user.save();

  const lowerMsg = msg.toLowerCase();
  let reply = "";
  let additionalMessage = null;
  let handled = false;
  const now = new Date();

  // Handle special commands
  if (lowerMsg === "h" || lowerMsg === "help") {
    reply = `Commands:\n\nT – set time\nD – confirm taken\nS – skip dose\nPAUSE - Doctor Advice or Breaks\nRESUME Continue after PAUSE\nCANCEL - cancel reminders\nN- To change notification type from SMS to Call or Call to SMS\nFor Dashboard, visit ${process.env.DASHBOARD_URL}`;
    handled = true;
  }

  if (!handled && lowerMsg === "d") {
    const pendingNotifications = user.notificationHistory
      .filter((n) => n.status === "pending")
      .sort((a, b) => b.sentAt - a.sentAt);

    if (pendingNotifications.length === 0) {
      // Get the very last action regardless of status
      const lastAction = user.notificationHistory
        .filter((n) => n.status === "skipped" || n.status === "taken")
        .sort((a, b) => b.sentAt - a.sentAt)[0];

      if (lastAction) {
        const meds = lastAction.medications.join(", ");

        // 🔑 Collect scheduled times
        let times = [];
        for (const scheduleId of lastAction.scheduleIds || []) {
          const scheduleItem = user.medicationSchedule.id(scheduleId);
          if (scheduleItem?.scheduledTime) {
            times.push(
              moment(scheduleItem.scheduledTime)
                .tz(user.timezone)
                .format("h:mm A")
            );
          }
        }
        const timeStr = times.length > 0 ? times.join(", ") : "unknown time";

        // Just report back what the last status was
        if (lastAction.status === "skipped") {
          reply = `You don't have any pending medications to confirm.\nYour ${meds} dose scheduled at ${timeStr} was already marked as missed.`;
        } else if (lastAction.status === "taken") {
          reply = `You don't have any pending medications to confirm.\nThe last medication you took was ${meds} scheduled at ${timeStr}.`;
        }
      } else {
        reply = "You don't have any pending medications to confirm.";
      }

      console.log(reply);
      handled = true;
    } else {
      // Mark most recent pending as taken
      const mostRecentNotification = pendingNotifications[0];
      mostRecentNotification.status = "taken";

      mostRecentNotification.scheduleIds.forEach((scheduleId) => {
        const scheduleItem = user.medicationSchedule.id(scheduleId);
        if (scheduleItem && scheduleItem.status === "pending") {
          scheduleItem.status = "taken";
          scheduleItem.takenAt = now;

          const prescription = user.prescriptions.id(
            scheduleItem.prescriptionId
          );
          if (prescription) {
            prescription.tracking.pillCount = Math.max(
              0,
              prescription.tracking.pillCount - prescription.dosage
            );
            prescription.tracking.dailyConsumption += prescription.dosage;
          }
        }
      });

      reply = `Confirmed! You've taken your medications.`;
      handled = true;
    }
  }

  //  change notification type to call if sms and sms if call

  if (lowerMsg === "n") {
    if (user.notificationType === "sms") {
      user.notificationType = "call";
      reply =
        "Thank you for using CareTrackRX. Notification type changed to Call.";
    } else {
      user.notificationType = "sms";
      reply =
        "Thank you for using CareTrackRX. Notification type changed to SMS.";
    }
    handled = true;
    await user.save();
  }
  if (!handled && lowerMsg === "s") {
    const pendingNotifications = user.notificationHistory
      .filter((n) => n.status === "pending")
      .sort((a, b) => b.sentAt - a.sentAt);

    if (pendingNotifications.length === 0) {
      // No pending → look for last skipped OR taken
      const lastAction = user.notificationHistory
        .filter((n) => n.status === "skipped" || n.status === "taken")
        .sort((a, b) => b.sentAt - a.sentAt)[0];

      if (lastAction) {
        const meds = lastAction.medications.join(", ");

        // 🔑 Get scheduled times from scheduleIds
        let times = [];
        for (const scheduleId of lastAction.scheduleIds || []) {
          const scheduleItem = user.medicationSchedule.id(scheduleId);
          if (scheduleItem?.scheduledTime) {
            times.push(
              moment(scheduleItem.scheduledTime)
                .tz(user.timezone)
                .format("h:mm A")
            );
          }
        }
        const timeStr = times.length > 0 ? times.join(", ") : "unknown time";

        if (lastAction.status === "skipped") {
          reply = `You don't have any pending medications to skip.\nThe last medication you skipped was ${meds} scheduled at ${timeStr}.`;
        } else {
          reply = `You don't have any pending medications to skip.\nThe last medication you took was ${meds} scheduled at ${timeStr}.`;
        }
      } else {
        reply = "You don't have any pending medications to skip.";
      }

      handled = true;
    } else {
      const mostRecentNotification = pendingNotifications[0];
      const skippedReminders = [];
      // update the tracking of skipped count as well
      user.prescriptions.forEach((p) => {
        if (mostRecentNotification.medications.includes(p.name)) {
          p.tracking.skippedCount += 1;
        }
      });

      mostRecentNotification.scheduleIds.forEach((scheduleId) => {
        const scheduleItem = user.medicationSchedule.id(scheduleId);
        if (scheduleItem && scheduleItem.status === "pending") {
          scheduleItem.status = "skipped";

          const prescription = user.prescriptions.id(
            scheduleItem.prescriptionId
          );
          if (prescription) {
            prescription.tracking.skippedCount += 1;

            skippedReminders.push({
              prescriptionName: prescription.name,
            });
          }
        }
      });

      // 🔑 mark the notification itself as skipped
      mostRecentNotification.status = "skipped";

      reply = `Skipped! You chose to skip your medications: ${mostRecentNotification.medications.join(
        ", "
      )}.`;
      console.log(reply);
      handled = true;

      if (skippedReminders.length > 0) {
        await notifyCaregivers(user, skippedReminders, "skipped");
      }
    }
  }

  if (lowerMsg === "stop") {
    user.status = "inactive";
    user.notificationsEnabled = false;
    user.prescriptions.forEach((p) => {
      p.remindersEnabled = false;
    });

    user.flowStep = "done";

    await user.save(); // Save immediately after updating status
    reply =
      "Reminders stopped for all medications. You can resume anytime by texting REMINDER.";
  }

  // resume
  if (!handled && lowerMsg === "resume") {
    if (user.status === "inactive") {
      user.status = "active";
      user.notificationsEnabled = true;
      user.prescriptions.forEach((p) => {
        p.remindersEnabled = true;
      });
    }
  }

  if (!handled && (lowerMsg === "t" || lowerMsg === "set time")) {
    const enabledMeds = user.prescriptions.filter((p) => p.remindersEnabled);

    if (enabledMeds.length === 0) {
      reply = "You don't have any active medications. Enable reminders first.";
      handled = true;
    } else {
      const userTimezone = user.timezone || "UTC";
      let needsSave = false;

      const medList = enabledMeds.map((p, i) => {
        let medTimes = [];

        // 1. Try to get effective times from schedule
        if (user.medicationSchedule && user.medicationSchedule.length > 0) {
          medTimes = user.medicationSchedule
            .filter((item) => item.prescriptionName === p.name)
            .map((item) =>
              moment(item.scheduledTime).tz(userTimezone).format("h:mm A")
            );
        }

        const uniqueTimes = [...new Set(medTimes)];
        return `${i + 1}. ${p.name} (Current times: ${uniqueTimes.join(", ") || "not set"
          })`;
      })
        .join("\n");

      reply = `Which pill would you like to set a custom time for?\nReply with a number:\n${medList.join("\n")}\n(Type the number of the pill you want to change.)`;
      user.flowStep = "set_time_select_med";
      user.temp = {};
      await user.save();
      handled = true;
    }
  }


  if (!handled && lowerMsg === "pause") {
    if (user.prescriptions.length === 0) {
      reply = "You don’t have any active medications to pause.";
      handled = true;
    } else {
      let list = "Which medication would you like to pause?\n";
      user.prescriptions.forEach((p, idx) => {
        list += `${idx + 1}. ${p.name}\n`;
      });

      reply = list + "Reply with the number(s), e.g. '1' or '1,2'";
      console.log(reply);
      user.flowStep = "pause_select"; // 🔑 move flow into selection mode
      handled = true;
    }
  }
  if (!handled && user.flowStep === "pause_select") {
    const numbers = lowerMsg.split(",").map((n) => parseInt(n.trim(), 10));
    const pausedMeds = [];

    numbers.forEach((num) => {
      const index = num - 1;
      if (!isNaN(index) && user.prescriptions[index]) {
        user.prescriptions[index].remindersEnabled = false;
        pausedMeds.push(user.prescriptions[index].name);
      }
    });

    if (pausedMeds.length > 0) {
      reply = `Paused reminders for: ${pausedMeds.join(", ")}.`;
    } else {
      reply = "Invalid selection. Please reply with valid medication numbers.";
    }
    console.log(reply);

    user.flowStep = "init"; // 🔑 reset flow
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
        ).map((r) => ({
          time: r.time,
          prescriptionName: p.name,
          prescriptionId: p._id, // CRITICAL: Add prescription ID
          pillCount: p.tracking.pillCount,
          dosage: p.dosage,
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

      user.medicationSchedule = generateMedicationSchedule(
        uniqueReminders,
        user.timezone
      );
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
          user.prescriptions.forEach((p) => {
            p.remindersEnabled = false;
          });
          user.status = "inactive";
          user.flowStep = "done";
          reply =
            "Thank you! Please continue to watch your medication intake.\nYou can return to CareTrackRX anytime by texting the word REMINDER.";
        } else {
          // Process medication selection
          const selected = msg
            .split(",")
            .map((num) => parseInt(num.trim()))
            .filter(
              (num) =>
                !isNaN(num) && num > 0 && num <= user.prescriptions.length
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
        if (!validateStrictTime(msg)) {
          reply = "Please enter correct time e.g (7:00am)";
        } else if (validateTime(msg, "morning")) {
          user.wakeTime = parseTime(msg);
          reply =
            "Great! Now, what time do you usually go to sleep? (e.g., 10 PM)";
          user.flowStep = "ask_sleep_time";
        } else {
          reply = "Please enter correct time e.g (7:00am)";
        }
        break;

      case "ask_sleep_time":
        if (!validateStrictTime(msg)) {
          reply = "Please enter correct time e.g (7:00pm)";
        } else {
          const parsed = parseTime(msg, "PM");
          if (parsed) {
            user.sleepTime = parsed;

            const enabledMeds = user.prescriptions.filter(
              (p) => p.remindersEnabled
            );

            const allReminders = enabledMeds.flatMap((p) => {
              const reminders = calculateReminderTimes(
                user.wakeTime,
                user.sleepTime,
                p.instructions,
                p.timesToTake,
                p.name,
                p.tracking.pillCount,
                p.dosage
              );

              // Save calculated times to prescription
              p.reminderTimes = reminders.map((r) => r.time);

              return reminders.map((r) => ({
                time: r.time,
                prescriptionName: p.name,
                pillCount: p.tracking.pillCount,
                dosage: p.dosage,
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
            user.medicationSchedule = generateMedicationSchedule(
              uniqueReminders,
              user.timezone
            );
            user.status = "active";
            user.notificationsEnabled = true;

            // Add this line to move to notification type selection
            user.flowStep = "ask_notification_type";

            // Group medications by time and format the message
            const groupedByMed = {};

            // Use the staggered schedule to show actual times
            // Fix: Only show the first day's schedule to avoid confusion if subsequent days differ
            if (user.medicationSchedule.length > 0) {
              const startDates = user.medicationSchedule.map(i => new Date(i.scheduledTime).getTime());
              const minDate = Math.min(...startDates);
              const windowEnd = minDate + 24 * 60 * 60 * 1000; // 24 hours from first item

              user.medicationSchedule.forEach((item) => {
                if (item.scheduledTime) {
                  const itemTime = new Date(item.scheduledTime).getTime();

                  if (itemTime < windowEnd) {
                    const time12h = moment(item.scheduledTime)
                      .tz(user.timezone)
                      .format("h:mm A");

                    if (!groupedByMed[item.prescriptionName]) {
                      groupedByMed[item.prescriptionName] = new Set();
                    }
                    groupedByMed[item.prescriptionName].add(time12h);
                  }
                }
              });
            }

            // Create the formatted message
            let medicationList = [];
            for (const [med, timesSet] of Object.entries(groupedByMed)) {
              // Sort times
              const times = Array.from(timesSet).sort(
                (a, b) => moment(a, "h:mm A") - moment(b, "h:mm A")
              );
              medicationList.push(`${med} at ${times.join(", ")}`);
            }

            const formattedSchedule = medicationList.join("\n");

            reply = `Thank you! Your reminders are set up for:\n${formattedSchedule}\n\nSelect your notification type:\n1. SMS notifications\n2. Phone call notifications\n\nReply with 1 or 2`;
          } else {
            reply = "Please enter a valid night time (e.g., 10 PM)";
          }
        }
        break;
      case "ask_notification_type":
        if (msg === "1") {
          user.notificationType = "sms";
          user.flowStep = "done";
          reply = `Thanks for using CareTrackRx! You’ll continue to receive SMS notifications for your medication reminders.  
For more details and history, please visit your dashboard: ${process.env.DASHBOARD_URL}. For assistance, reply with "H".`;
        } else if (msg === "2") {
          user.notificationType = "call";
          user.flowStep = "done";
          reply = `Thanks for using CareTrackRx! You’ll continue to receive Call notifications for your medication reminders.  
For more details and history, please visit your dashboard: ${process.env.DASHBOARD_URL}. For assistance, reply with "H".`;
        } else {
          reply =
            "Please select a valid option:\n1. SMS notifications\n2. Phone call notifications";
        }
        break;
      case "set_time_select_med":
        const medIndex = parseInt(msg) - 1;
        const enabledMeds = user.prescriptions.filter(
          (p) => p.remindersEnabled
        );

        if (isNaN(medIndex)) {
          reply = "Please enter a valid number from the list.";
        } else if (medIndex < 0 || medIndex >= enabledMeds.length) {
          reply = "Invalid selection. Please choose a number from the list.";
        } else {
          const selectedMed = enabledMeds[medIndex];
          user.temp = {
            ...user.temp,
            selectedMedName: selectedMed.name,
          };
          user.flowStep = "set_time_enter_time";
          await user.save();

          // Get current times in user's timezone
          let medTimes = (selectedMed.reminderTimes || []).map((t) =>
            moment(t, "HH:mm").format("h:mm A")
          );

          // Auto-repair: If too many times or empty
          if (medTimes.length === 0 || medTimes.length > selectedMed.timesToTake) {
            const calculated = calculateReminderTimes(
              user.wakeTime,
              user.sleepTime,
              selectedMed.instructions,
              selectedMed.timesToTake,
              selectedMed.name,
              selectedMed.tracking.pillCount,
              selectedMed.dosage
            );
            medTimes = calculated.map((r) =>
              moment(r.time, "HH:mm").format("h:mm A")
            );
            // Save back to prescription
            selectedMed.reminderTimes = calculated.map((r) => r.time);
            await user.save();
          }

          const uniqueTimes = [...new Set(medTimes)];
          const currentTimes = uniqueTimes.length
            ? uniqueTimes.join(", ")
            : "not set";

          reply = `You currently take *${selectedMed.name}* at: ${currentTimes}\n\nPlease reply with new time(s) in 12-hour format (e.g., 7am or 8:30pm).\n\nFor multiple times, separate with commas.`;
          handled = true;
        }
        break;
      case "set_time_enter_time":
        if (!user.temp?.selectedMedName) {
          reply = "Something went wrong. Please start over.";
          user.flowStep = "done";
          break;
        }

        const prescription = user.prescriptions.find(
          (p) => p.name === user.temp.selectedMedName
        );

        if (!prescription) {
          reply = "Medication not found. Please try again.";
          user.flowStep = "done";
          break;
        }

        const timeInputs = msg.split(",").map((t) => t.trim());
        const validTimes = [];
        const invalidTimes = [];

        // Parse and validate each time
        for (const timeInput of timeInputs) {
          const time24 = parseTime(timeInput);
          if (time24) {
            validTimes.push(time24);
          } else {
            invalidTimes.push(timeInput);
          }
        }

        if (validTimes.length === 0) {
          reply =
            "No valid times entered. Please use formats like 7am or 8:30pm.";
        } else {
          // Get the current times for this medication from the prescription
          const currentTimes = prescription.reminderTimes || [];

          // Replace with new times (remove duplicates if user entered same time twice)
          const updatedTimes = [...new Set(validTimes)];

          // Update the prescription's reminder times
          prescription.reminderTimes = updatedTimes;

          // Regenerate the medication schedule for this prescription only
          const userTimezone = user.timezone || "UTC";

          // Remove existing schedule entries for this prescription
          user.medicationSchedule = user.medicationSchedule.filter(
            (item) =>
              item.prescriptionName !== prescription.name ||
              item.status !== "pending"
          );

          // Generate new schedule for this prescription
          const now = moment().tz(userTimezone);
          const today = now.startOf("day");

          for (let day = 0; day < 7; day++) {
            const dayStart = today.clone().add(day, "days");

            for (const timeStr of updatedTimes) {
              const [hour, minute] = timeStr.split(":").map(Number);

              const scheduledTime = dayStart.clone().set({ hour, minute });

              if (scheduledTime.isAfter(now)) {
                user.medicationSchedule.push({
                  scheduledTime: scheduledTime.toDate(),
                  status: "pending",
                  prescriptionName: prescription.name,
                });
              }
            }
          }

          // === Apply Ripple Stagger to ensure 30-min gaps ===
          user.medicationSchedule = resolveScheduleConflicts(
            user.medicationSchedule,
            userTimezone
          );

          user.flowStep = "done";
          user.temp = {};

          // Format times in user's timezone for display
          const formattedTimes = updatedTimes.map((timeStr) => {
            const [hours, minutes] = timeStr.split(":");
            const hour = parseInt(hours, 10);
            const period = hour >= 12 ? "PM" : "AM";
            const hour12 = hour % 12 || 12;
            return `${hour12}:${minutes} ${period}`;
          });

          reply = `Times updated for ${prescription.name
            }! New times: ${formattedTimes.join(", ")}.`;

          if (invalidTimes.length > 0) {
            reply += `\nNote: These times were invalid: ${invalidTimes.join(
              ", "
            )}`;
          }
        }
        handled = true;
        break;
      default:
        reply = "Sorry, I didn't understand you. need help, text H.";
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

  // res.sendStatus(200);
});

// Helper function to send messages
async function sendMessage(phone, message) {
  try {
    // await client.messages.create({
    //   body: message,
    //   from: process.env.TWILIO_PHONE_NUMBER,
    //   to: `+${phone}`, // Use SMS format if needed
    // });
    console.log(message);
    console.log(`Message sent to ${phone}: ${message}`);
  } catch (error) {
    console.error("Error sending message:", error);
  }
}

// Validate time input (any time)
function validateTimeAny(input) {
  const timeRegex = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i;
  return timeRegex.test(input);
}

// Strict validation: 12-hour format with colon and AM/PM
function validateStrictTime(input) {
  const timeRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s*(am|pm)$/i;
  return timeRegex.test(input.trim());
}

// Validate time input (morning or night)
function validateTime(input, type) {
  if (!validateTimeAny(input)) return false;

  const timeRegex = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i;
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
function parseTime(input, defaultPeriod = null) {
  input = input.trim().toLowerCase();

  // Handle inputs like "1030" → "10:30"
  if (/^\d{3,4}$/.test(input)) {
    input =
      input.length === 3
        ? `${input[0]}:${input.slice(1)}`
        : `${input.slice(0, 2)}:${input.slice(2)}`;
  }

  const timeRegex = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i;
  const match = input.match(timeRegex);

  if (!match) return "08:00"; // default fallback if invalid

  let [_, hour, minute, period] = match;
  hour = parseInt(hour, 10);
  minute = minute ? parseInt(minute, 10) : 0;

  // Apply default AM/PM if user didn’t specify
  if (!period && defaultPeriod) {
    period = defaultPeriod.toLowerCase();
  }

  // Convert to 24-hour format
  if (period) {
    if (period === "pm" && hour < 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;
  }

  // Keep hours within 0–23
  hour = hour % 24;

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

router.patch("/updatewho/:id", async (req, res) => {
  try {
    const prescriptionId = req.params.id;
    const { forWho, username } = req.body;
    console.log(forWho, username);

    // Validate input
    if (
      !forWho ||
      typeof forWho !== "string" ||
      !username ||
      typeof username !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid input values",
      });
    }

    // Find the user who owns this prescription
    const user = await User.findOne({ "prescriptions._id": prescriptionId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found for this prescription",
      });
    }

    if (forWho === "myself") {
      user.username = username; // Set username to user's name
      await user.save();
    }

    // Update the prescription in the user's array
    const prescriptionIndex = user.prescriptions.findIndex(
      (p) => p._id.toString() === prescriptionId
    );

    if (prescriptionIndex !== -1) {
      user.prescriptions[prescriptionIndex].forWho = forWho;
      user.prescriptions[prescriptionIndex].username = username;
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: "Information updated successfully",
      prescription: user.prescriptions[prescriptionIndex],
    });
  } catch (error) {
    console.log(error);
    console.error("Error updating forWho:", error);

    // Handle specific errors
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid prescription ID format",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while updating information",
      error: error.message,
    });
  }
});

router.patch("/update/:id", async (req, res) => {
  const prescriptionId = req.params.id;
  const updateData = req.body;

  try {
    // 1️⃣ Find user
    const user = await User.findOne({ phoneNumber: updateData.phoneNumber });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // 2️⃣ Find the prescription
    const prescription = user.prescriptions.id(prescriptionId);
    if (!prescription) {
      return res
        .status(404)
        .json({ success: false, message: "Prescription not found" });
    }

    const oldName = prescription.name;

    // 3️⃣ Update editable fields
    const editableFields = [
      "name",
      "dosage",
      "timesToTake",
      "instructions",
      "sideEffects",
      "initialCount",
      "remindersEnabled",
      "reminderTimes",
    ];

    editableFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        prescription[field] = updateData[field];
      }
    });

    // 4️⃣ If times or dosage changed → regenerate schedule
    if (
      updateData.reminderTimes ||
      updateData.timesToTake ||
      updateData.initialCount ||
      updateData.dosage
    ) {
      const userTimezone = user.timezone || "Asia/Karachi";
      const wakeTime = user.wakeTime || "07:00";
      const sleepTime = user.sleepTime || "23:00";

      // Remove old schedule entries for this prescription
      user.medicationSchedule = user.medicationSchedule.filter(
        (item) => item.prescriptionName !== oldName
      );

      // Use provided reminder times if available, otherwise recalculate
      let reminderTimes = updateData.reminderTimes;

      // If not provided in update, check if prescription already has them saved
      if (!reminderTimes || reminderTimes.length === 0) {
        reminderTimes = prescription.reminderTimes;
      }

      // If still no times, calculate them
      if (!reminderTimes || reminderTimes.length === 0) {
        reminderTimes = calculateReminderTimes(
          wakeTime,
          sleepTime,
          prescription.instructions || "",
          prescription.timesToTake,
          prescription.name,
          prescription.initialCount,
          prescription.dosage
        );
      }

      // Ensure we save the calculated times to the prescription if they weren't there
      prescription.reminderTimes = reminderTimes;

      // Generate schedule dynamically
      const reminderObjects = reminderTimes.map((time) => ({
        prescriptionName: prescription.name,
        prescriptionId,
        time, // e.g. "07:45"
        dosage: prescription.dosage,
        pillCount: prescription.initialCount,
      }));

      const newSchedule = generateMedicationSchedule(
        reminderObjects,
        userTimezone,
        new Date()
      );

      // Append to medicationSchedule
      user.medicationSchedule.push(
        ...newSchedule.map((s) => ({
          scheduledTime: new Date(s.scheduledTime),
          status: "pending",
          prescriptionName: s.prescriptionName,
          prescriptionId,
          reminderSent: false,
        }))
      );
    }

    // 5️⃣ Re-run global conflict resolution (ripple stagger)
    user.medicationSchedule = resolveScheduleConflicts(
      user.medicationSchedule,
      user.timezone
    );

    // 6️⃣ Mark fields as modified for Mongoose
    user.markModified("prescriptions");
    user.markModified("medicationSchedule");

    // 6️⃣ Update metadata
    user.meta.updatedAt = new Date();

    // 7️⃣ Save user
    await user.save();

    console.log("✅ Prescription updated:", prescription.name);
    console.log("🕒 New schedule count:", user.medicationSchedule.length);

    return res.status(200).json({
      success: true,
      message: "Prescription updated and schedule regenerated successfully",
      prescription,
    });
  } catch (error) {
    console.error("❌ Error updating prescription:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating prescription",
      error: error.message,
    });
  }
});

// routes/user.js
router.delete(
  "/prescription/:phoneNumber/:prescriptionId",
  async (req, res) => {
    try {
      const { phoneNumber, prescriptionId } = req.params;

      // Find user
      const user = await User.findOne({ phoneNumber });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Find prescription
      const prescription = user.prescriptions.id(prescriptionId);
      if (!prescription) {
        return res.status(404).json({
          success: false,
          message: "Prescription not found",
        });
      }

      // Delete prescription
      prescription.deleteOne();

      // Remove schedule entries
      user.medicationSchedule = user.medicationSchedule.filter(
        (item) => item.prescriptionId?.toString() !== prescriptionId
      );

      // Clean up history
      user.notificationHistory.forEach((history) => {
        history.medications = history.medications.filter(
          (med) => med !== prescription.name
        );
      });

      await user.save();

      return res.status(200).json({
        success: true,
        message: "Prescription tracking stopped successfully",
      });
    } catch (error) {
      console.error("Error deleting prescription:", error);
      return res.status(500).json({
        success: false,
        message: "Server error while deleting prescription",
        error: error.message,
      });
    }
  }
);

// delete a medication and it's remainders
export default router;

export { sendMessage };
