import { DateTime } from "luxon";

// === Calculate reminder times ===
export const calculateReminderTimes = (
  wakeTime,
  sleepTime,
  instructions,
  frequency,
  name,
  pillCount,
  dosage
) => {
  const times = [];
  const normalizedInstructions = instructions.toLowerCase();

  // Parse times to minutes since midnight
  const [wakeHour, wakeMin] = wakeTime.split(":").map(Number);
  const [sleepHour, sleepMin] = sleepTime.split(":").map(Number);
  const wakeTotalMin = wakeHour * 60 + wakeMin;
  const sleepTotalMin = sleepHour * 60 + sleepMin;

  const formatTime = (totalMinutes) => {
    const hour = Math.floor(totalMinutes / 60) % 24;
    const min = Math.floor(totalMinutes % 60);
    return `${hour.toString().padStart(2, "0")}:${min
      .toString()
      .padStart(2, "0")}`;
  };

  // Helper keywords
  const isBeforeBed =
    normalizedInstructions.includes("bed") ||
    normalizedInstructions.includes("sleep");
  const isWithBreakfast =
    normalizedInstructions.includes("breakfast") ||
    normalizedInstructions.includes("morning");
  const isAfterMeal =
    normalizedInstructions.includes("after meal") ||
    normalizedInstructions.includes("after food");
  const isBeforeMeal =
    normalizedInstructions.includes("before meal") ||
    normalizedInstructions.includes("before food");

  // Single dose
  if (frequency === 1) {
    let reminderMin;
    if (isBeforeBed) {
      reminderMin = sleepTotalMin - 60;
    } else if (isWithBreakfast) {
      reminderMin = wakeTotalMin + 60;
    } else if (isAfterMeal || isBeforeMeal) {
      reminderMin =
        wakeTotalMin + Math.floor((sleepTotalMin - wakeTotalMin) / 2);
    } else {
      reminderMin = wakeTotalMin + 60;
    }

    times.push({
      prescriptionName: name,
      time: formatTime(reminderMin),
      dosage,
      pillCount,
    });
    return times;
  }

  // Two doses
  if (frequency === 2) {
    let firstDose, secondDose;

    if (isBeforeBed || isWithBreakfast) {
      firstDose = wakeTotalMin + 60;
      secondDose = sleepTotalMin - 60;
    } else if (normalizedInstructions.includes("dinner")) {
      firstDose = wakeTotalMin + 60;
      secondDose = sleepTotalMin - 60;
    } else {
      firstDose = wakeTotalMin + 60;
      secondDose = sleepTotalMin - 60;
    }

    times.push({
      prescriptionName: name,
      time: formatTime(firstDose),
      dosage,
      pillCount,
    });
    times.push({
      prescriptionName: name,
      time: formatTime(secondDose),
      dosage,
      pillCount,
    });
    return times;
  }

  // Three or more doses
  const buffer = 60;
  let startTime = wakeTotalMin;
  let endTime = sleepTotalMin;

  if (isWithBreakfast) startTime += 60;
  if (isBeforeBed) endTime -= 60;
  if (endTime <= startTime) endTime = startTime + 60 * frequency;

  const timeRange = endTime - startTime;
  const interval = timeRange / (frequency - 1);

  for (let i = 0; i < frequency; i++) {
    let doseTime = startTime + i * interval;

    if (isBeforeBed && i === frequency - 1) {
      doseTime = sleepTotalMin - 60;
    } else if (isWithBreakfast && i === 0) {
      doseTime = wakeTotalMin + 60;
    }

    times.push({
      prescriptionName: name,
      time: formatTime(doseTime),
      dosage,
      pillCount,
    });
  }

  return times;
};

export const generateMedicationSchedule = (
  reminders,
  timezone,
  startDate = new Date()
) => {
  const now = DateTime.now().setZone(timezone);
  const schedule = [];

  // === Group reminders by prescription ===
  const groupedByPrescription = reminders.reduce((acc, r) => {
    const key = r.prescriptionId || r.prescriptionName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  Object.entries(groupedByPrescription).forEach(
    ([prescriptionKey, reminderArray]) => {
      const adjustedStart = DateTime.fromJSDate(startDate).setZone(timezone);
      const today = adjustedStart.startOf("day");

      // === Dynamic days based on available pills ===
      const sampleReminder = reminderArray[0];
      const { pillCount = 0, dosage = 1 } = sampleReminder;
      const timesPerDay = reminderArray.length;
      let daysToGenerate = Math.floor(pillCount / (dosage * timesPerDay));
      if (daysToGenerate < 1 && pillCount > 0) daysToGenerate = 1; // Generate at least 1 day if pills exist, else 0

      // === Generate schedule for each day & dose ===
      for (let day = 0; day < daysToGenerate; day++) {
        const currentDay = today.plus({ days: day });

        reminderArray.forEach((r) => {
          const [hour, minute] = r.time.split(":").map(Number);
          const scheduledTime = currentDay.set({
            hour,
            minute,
            second: 0,
            millisecond: 0,
          });

          // Only future reminders are added
          if (scheduledTime > now) {
            schedule.push({
              prescriptionName: r.prescriptionName,
              prescriptionId: r.prescriptionId,
              scheduledTime: scheduledTime.toISO(),
              localTime: scheduledTime.toLocaleString(DateTime.DATETIME_MED),
              dosage: r.dosage,
              status: "pending",
              reminderSent: false,
            });
          }
        });
      }
    }
  );

  // === Conflict resolution (Ripple Stagger) ===
  return resolveScheduleConflicts(schedule, timezone);
};

// === Ripple Stagger Logic ===
export const resolveScheduleConflicts = (schedule, timezone) => {
  if (!schedule || schedule.length === 0) return [];

  // 1. Sort by time
  schedule.sort(
    (a, b) =>
      DateTime.fromISO(a.scheduledTime) - DateTime.fromISO(b.scheduledTime)
  );

  // 2. Ripple stagger
  for (let i = 0; i < schedule.length - 1; i++) {
    const current = schedule[i];
    const next = schedule[i + 1];

    const currentDt = DateTime.fromISO(current.scheduledTime).setZone(timezone);
    const nextDt = DateTime.fromISO(next.scheduledTime).setZone(timezone);

    const diffMinutes = nextDt.diff(currentDt, "minutes").minutes;

    if (diffMinutes < 30) {
      // Move next item to be exactly 30 mins after current
      const newNextDt = currentDt.plus({ minutes: 30 });

      next.scheduledTime = newNextDt.toISO();
      next.localTime = newNextDt.toLocaleString(DateTime.DATETIME_MED);
    }
  }

  return schedule;
};
