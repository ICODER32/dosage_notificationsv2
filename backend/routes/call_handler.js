import express from "express";
import User from "../models/user.model.js";
import twilio from "twilio";

const router = express.Router();

router.post("/handle", async (req, res) => {
  const { Digits } = req.body;
  const notificationId = req.query.notificationId; // you probably store this when scheduling
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

    // Find notification + related prescription
    const notification = user.notificationHistory.id(notificationId);
    if (!notification) {
      twiml.say("Invalid notification. Goodbye.");
      twiml.hangup();
      return res.type("text/xml").send(twiml.toString());
    }

    const scheduleItem = user.medicationSchedule.id(
      notification.scheduleIds[0]
    );
    const prescription = scheduleItem
      ? user.prescriptions.find((p) => p.name === scheduleItem.prescriptionName)
      : null;

    const prescriptionName = prescription?.name || "your medication";
    const dosage = prescription?.dosage || 1;

    const forWho = prescription?.forWho || "myself";
    const username = prescription?.username || null;

    const buildIntro = () => {
      if (!username) {
        // Case 1: unknown user
        return `Hello. This is CareTrackRx, your pill reminder service. It is now time to take your medication: ${prescriptionName}. You are scheduled to take ${dosage} pill${
          dosage > 1 ? "s" : ""
        }.`;
      } else if (forWho === "myself") {
        // Case 2: user for themselves
        return `Hello ${username}. This is CareTrackRx, your pill reminder service. It’s time to take your medication: ${prescriptionName}. You are scheduled to take ${dosage} pill${
          dosage > 1 ? "s" : ""
        }.`;
      } else {
        // Case 3: caregiver
        return `Hello ${
          user.username || "Caregiver"
        }. This is CareTrackRx calling with a pill reminder for ${username}. It’s time for ${username} to take their medication: ${prescriptionName}. The scheduled dose is ${dosage} pill${
          dosage > 1 ? "s" : ""
        }.`;
      }
    };

    // === NO INPUT YET → Play intro and gather ===
    if (!Digits) {
      twiml.say(buildIntro());
      const gather = twiml.gather({
        numDigits: 1,
        input: "dtmf speech", // <-- allows press OR say
        speechTimeout: "auto",
        action: `/api/calls/handle?notificationId=${notificationId}`,
        method: "POST",
      });
      gather.say(
        "If the medication has been taken, press 1 or say taken. If skipping this dose, press 2 or say skip."
      );
      return res.type("text/xml").send(twiml.toString());
    }

    // === HANDLE RESPONSE ===
    if (
      Digits === "1" ||
      req.body.SpeechResult?.toLowerCase().includes("taken")
    ) {
      notification.status = "taken";
      scheduleItem.status = "taken";
      scheduleItem.takenAt = new Date();
      prescription.tracking.pillCount = Math.max(
        0,
        prescription.tracking.pillCount - prescription.dosage
      );
      prescription.tracking.dailyConsumption += prescription.dosage;

      if (forWho === "myself") {
        twiml.say(
          `Thank you ${username}. Your medication ${prescriptionName} has been marked as taken.`
        );
      } else {
        twiml.say(
          `Thank you, ${
            user.username || "Caregiver"
          }. ${username}'s medication ${prescriptionName} has been marked as taken. CareTrackRx appreciates your support.`
        );
      }
    } else if (
      Digits === "2" ||
      req.body.SpeechResult?.toLowerCase().includes("skip")
    ) {
      notification.status = "skipped";
      scheduleItem.status = "skipped";
      prescription.tracking.skippedCount += 1;

      if (forWho === "myself") {
        twiml.say(
          `Thank you ${username}. Your medication ${prescriptionName} has been marked as skipped.`
        );
      } else {
        twiml.say(
          `Thank you, ${
            user.username || "Caregiver"
          }. ${username}'s medication ${prescriptionName} has been marked as skipped. CareTrackRx appreciates your support.`
        );
      }
    } else {
      twiml.say("Invalid option. Let's try again.");
      const gather = twiml.gather({
        numDigits: 1,
        input: "dtmf speech",
        action: `/api/calls/handle?notificationId=${notificationId}`,
        method: "POST",
      });
      gather.say("Press 1 or say taken. Press 2 or say skip.");
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
