import express from "express";
import User from "../models/user.model.js";
import twilio from "twilio";
import { notifyCaregivers } from "../cron-jobs/cronScheduler.js";

const router = express.Router();

router.post("/handle", async (req, res) => {
  const { Digits } = req.body;
  const notificationId = req.query.notificationId;
  const twiml = new twilio.twiml.VoiceResponse();

  try {
    const user = await User.findOne({
      "notificationHistory._id": notificationId,
    });

    if (!user) {
      twiml.say("We could not find your reminder. Goodbye.");
      twiml.hangup();
      return res.type("text/xml").send(twiml.toString());
    }

    const notification = user.notificationHistory.id(notificationId);
    if (!notification) {
      twiml.say("Invalid notification. Goodbye.");
      twiml.hangup();
      return res.type("text/xml").send(twiml.toString());
    }

    // Get all medications for this notification
    const scheduleItems = notification.scheduleIds
      .map((scheduleId) => user.medicationSchedule.id(scheduleId))
      .filter((item) => item !== null);

    if (scheduleItems.length === 0) {
      twiml.say("No medications found for this reminder. Goodbye.");
      twiml.hangup();
      return res.type("text/xml").send(twiml.toString());
    }

    // Get prescription details for all medications
    const prescriptions = scheduleItems
      .map((item) =>
        user.prescriptions.find((p) => p.name === item.prescriptionName)
      )
      .filter((p) => p !== undefined);

    // Build the medication list message
    const medList = prescriptions.map((p) => p.name).join(", ");
    const dosageList = prescriptions.map((p) => p.dosage).join(", ");
    const forWhoList = [...new Set(prescriptions.map((p) => p.forWho))];
    const usernameList = [
      ...new Set(prescriptions.map((p) => p.username).filter((u) => u)),
    ];

    const buildIntro = () => {
      if (usernameList.length === 0) {
        return `Welcome to CareTrackRx, your pill reminder service. It is now time to take your medications: ${medList}.`;
      } else if (forWhoList.includes("myself")) {
        return `Hello ${usernameList[0]}. This is CareTrackRx, your pill reminder service. It's time to take your medications: ${medList}.`;
      } else {
        return `Hello ${
          user.username || "Caregiver"
        }. This is CareTrackRx calling with a pill reminder for ${usernameList.join(
          " and "
        )}. It's time for ${usernameList.join(
          " and "
        )} to take their medications: ${medList}.`;
      }
    };

    // === NO DIGITS YET ===
    if (!Digits) {
      twiml.say(buildIntro());
      const gather = twiml.gather({
        numDigits: 1,
        action: `/api/calls/handle?notificationId=${notificationId}`,
        method: "POST",
      });
      gather.say(
        "If the medications have been taken, press 1. If skipping this dose, press 2."
      );
      return res.type("text/xml").send(twiml.toString());
    }

    // === HANDLE TAKEN ===
    if (Digits === "1") {
      notification.status = "taken";

      // Update all schedule items
      for (const scheduleItem of scheduleItems) {
        scheduleItem.status = "taken";
        scheduleItem.takenAt = new Date();

        const prescription = user.prescriptions.find(
          (p) => p.name === scheduleItem.prescriptionName
        );

        if (prescription) {
          prescription.tracking.pillCount = Math.max(
            0,
            prescription.tracking.pillCount - prescription.dosage
          );
          prescription.tracking.dailyConsumption += prescription.dosage;
        }
      }

      if (forWhoList.includes("myself")) {
        twiml.say(
          `Thank you ${usernameList[0]}. Your medications ${medList} have been marked as taken.`
        );
      } else {
        twiml.say(
          `Thank you, ${user.username || "Caregiver"}. ${usernameList.join(
            " and "
          )}'s medications ${medList} have been marked as taken. CareTrackRx appreciates your support.`
        );
      }
    }

    // === HANDLE SKIP ===
    else if (Digits === "2") {
      notification.status = "skipped";

      // Update all schedule items
      for (const scheduleItem of scheduleItems) {
        scheduleItem.status = "skipped";

        const prescription = user.prescriptions.find(
          (p) => p.name === scheduleItem.prescriptionName
        );

        if (prescription) {
          prescription.tracking.skippedCount += 1;
        }
      }

      if (forWhoList.includes("myself")) {
        twiml.say(
          `Thank you ${usernameList[0]}. Your medications ${medList} have been marked as skipped.`
        );
      } else {
        twiml.say(
          `Thank you, ${user.username || "Caregiver"}. ${usernameList.join(
            " and "
          )}'s medications ${medList} have been marked as skipped. CareTrackRx appreciates your support.`
        );
      }

      // Notify caregivers for all skipped medications
      const skippedMeds = prescriptions.map((p) => ({
        prescriptionName: p.name,
      }));
      await notifyCaregivers(user, skippedMeds, "skipped");
    }

    // === INVALID INPUT ===
    else {
      twiml.say("Invalid option. Let's try again.");
      const gather = twiml.gather({
        numDigits: 1,
        action: `/api/calls/handle?notificationId=${notificationId}`,
        method: "POST",
      });
      gather.say("Press 1 for taken. Press 2 for skip.");
      return res.type("text/xml").send(twiml.toString());
    }

    await user.save();
    twiml.hangup();
  } catch (err) {
    console.error("Error handling call:", err);
    twiml.say("We encountered an error. Goodbye.");
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
});

export default router;
