import express from "express";
import User from "../models/user.model.js";
const router = express.Router();
import twilio from "twilio";
router.post("/handle", async (req, res) => {
  const Digits = req.body.Digits;
  const notificationId = req.query.notificationId;
  console.log(req.body);

  const twiml = new twilio.twiml.VoiceResponse();

  if (!Digits) {
    // Initial call - present the options
    twiml.say("This is your medication reminder from CareTrackRX.");
    twiml.pause({ length: 1 });
    twiml.say("Please press 1 to confirm you've taken your medication.");
    twiml.say("Or press 2 if you need to skip this dose.");
    twiml.gather({
      numDigits: 1,
      action: `/api/calls/handle?notificationId=${notificationId}`,
      method: "POST",
    });
  } else {
    try {
      // Find the user with this notification
      const user = await User.findOne({
        "notificationHistory._id": notificationId,
      });

      if (!user) {
        twiml.say("Error processing your response. Please try again later.");
        twiml.hangup();
        return res.type("text/xml").send(twiml.toString());
      }

      const notification = user.notificationHistory.id(notificationId);

      if (Digits === "1") {
        // User pressed 1 - confirmed taken
        notification.status = "taken";

        // Update ALL linked schedule items
        notification.scheduleIds.forEach((scheduleId) => {
          const scheduleItem = user.medicationSchedule.id(scheduleId);
          if (scheduleItem && scheduleItem.status === "pending") {
            scheduleItem.status = "taken";
            scheduleItem.takenAt = new Date();

            // Update prescription counts
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

        twiml.say(
          "Thank you for confirming you've taken your medication. Goodbye."
        );
      } else if (Digits === "2") {
        // User pressed 2 - skipped
        notification.status = "skipped";

        notification.scheduleIds.forEach((scheduleId) => {
          const scheduleItem = user.medicationSchedule.id(scheduleId);
          if (scheduleItem && scheduleItem.status === "pending") {
            scheduleItem.status = "skipped";

            // Update prescription tracking
            const prescription = user.prescriptions.id(
              scheduleItem.prescriptionId
            );
            if (prescription) {
              prescription.tracking.skippedCount += 1;
            }
          }
        });

        twiml.say("You've chosen to skip this dose. Goodbye.");

        // Notify caregivers if needed
        const skippedReminders = notification.medications.map((name) => ({
          prescriptionName: name,
        }));
        await notifyCaregivers(user, skippedReminders);
      } else {
        twiml.say("Invalid option. Please try again later.");
      }

      await user.save();
    } catch (error) {
      console.error("Error processing call response:", error);
      twiml.say("Error processing your response. Please try again later.");
    }

    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
});

export default router;
