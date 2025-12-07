import { DateTime } from "luxon";

// =========================================================
// === FIXED REMINDER TIME CALCULATOR (UPDATED) =============
// =========================================================
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

  const [wakeHour, wakeMin] = wakeTime.split(":").map(Number);
  const [sleepHour, sleepMin] = sleepTime.split(":").map(Number);
  const wakeTotalMin = wakeHour * 60 + wakeMin;
  const sleepTotalMin = sleepHour * 60 + sleepMin;

  const formatTime = (m) => {
    const h = Math.floor(m / 60) % 24;
    const mm = m % 60;
    return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
  };

  // ---------------------------------------------------------
  // === FREQUENCY = 1 → ALWAYS ONE TIME PER DAY ============
  // ---------------------------------------------------------
  if (frequency === 1) {
    const oneDose = wakeTotalMin + 60; // 1 hr after wake
    times.push({
      prescriptionName: name,
      time: formatTime(oneDose),
      dosage,
      pillCount,
    });
    return times;
  }

  // ---------------------------------------------------------
  // === FREQUENCY = 2 → ALWAYS TWO FIXED TIMES =============
  // ---------------------------------------------------------
  if (frequency === 2) {
    const firstDose = wakeTotalMin + 60;      // 1 hr after wake
    const secondDose = sleepTotalMin - 60;    // 1 hr before sleep

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

  // ---------------------------------------------------------
  // === FREQUENCY >= 3 → evenly spaced ======================
  // ---------------------------------------------------------
  let start = wakeTotalMin + 60;
  let end = sleepTotalMin - 60;

  if (end <= start) end = start + 60 * frequency;

  const interval = (end - start) / (frequency - 1);

  for (let i = 0; i < frequency; i++) {
    const doseTime = start + i * interval;
    times.push({
      prescriptionName: name,
      time: formatTime(doseTime),
      dosage,
      pillCount,
    });
  }

  return times;
};


// =========================================================
// === GENERATE DAILY MEDICATION SCHEDULE ===================
// =========================================================
export const generateMedicationSchedule = (
  reminders,
  timezone,
  startDate = new Date()
) => {
  const now = DateTime.now().setZone(timezone);
  const schedule = [];

  // Group by prescription
  const grouped = reminders.reduce((acc, r) => {
    const key = r.prescriptionId || r.prescriptionName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  Object.entries(grouped).forEach(([_, reminderGroup]) => {
    const baseDate = DateTime.fromJSDate(startDate).setZone(timezone);
    const today = baseDate.startOf("day");

    const sample = reminderGroup[0];
    const pillCount = sample.pillCount || 0;
    const dosage = sample.dosage || 1;

    const dosesPerDay = reminderGroup.length;
    const pillsPerDay = dosage * dosesPerDay;

    // How many full days we can schedule
    let daysToGenerate = Math.floor(pillCount / pillsPerDay);

    // If pills don't last a full day, schedule partial day
    const remaining = pillCount % pillsPerDay;
    const needsPartialDay = remaining > 0;

    // Full days
    for (let d = 0; d < daysToGenerate; d++) {
      const thisDay = today.plus({ days: d });

      reminderGroup.forEach((r) => {
        const [hour, minute] = r.time.split(":").map(Number);
        let scheduled = thisDay.set({ hour, minute, second: 0, millisecond: 0 });

        if (scheduled > now) {
          schedule.push({
            prescriptionName: r.prescriptionName,
            prescriptionId: r.prescriptionId,
            scheduledTime: scheduled.toISO(),
            localTime: scheduled.toLocaleString(DateTime.DATETIME_MED),
            dosage: r.dosage,
            status: "pending",
            reminderSent: false,
          });
        }
      });
    }

    // Partial day (last day)
    if (needsPartialDay) {
      const lastDay = today.plus({ days: daysToGenerate });
      let remainingPills = remaining;

      reminderGroup.forEach((r) => {
        if (remainingPills <= 0) return;

        const [hour, minute] = r.time.split(":").map(Number);
        let scheduled = lastDay.set({ hour, minute, second: 0, millisecond: 0 });

        if (scheduled > now) {
          schedule.push({
            prescriptionName: r.prescriptionName,
            prescriptionId: r.prescriptionId,
            scheduledTime: scheduled.toISO(),
            localTime: scheduled.toLocaleString(DateTime.DATETIME_MED),
            dosage: r.dosage,
            status: "pending",
            reminderSent: false,
          });
        }

        remainingPills -= dosage;
      });
    }
  });

  return resolveScheduleConflicts(schedule, timezone);
};

// =========================================================
// === FIXED: RIPPLE CASCADE CONFLICT RESOLUTION ============
// =========================================================
export const resolveScheduleConflicts = (schedule, timezone) => {
  if (!schedule || schedule.length === 0) return [];

  const parseDate = (d) =>
    d instanceof Date
      ? DateTime.fromJSDate(d).setZone(timezone)
      : DateTime.fromISO(d).setZone(timezone);

  // 1. Sort by time
  schedule.sort((a, b) => parseDate(a.scheduledTime) - parseDate(b.scheduledTime));

  // 2. Cascade forward ripple stagger (every conflict is pushed)
  for (let i = 0; i < schedule.length - 1; i++) {
    let currentDt = parseDate(schedule[i].scheduledTime);

    for (let j = i + 1; j < schedule.length; j++) {
      const nextDt = parseDate(schedule[j].scheduledTime);
      const diff = nextDt.diff(currentDt, "minutes").minutes;

      if (diff < 30) {
        const newDt = currentDt.plus({ minutes: 30 });

        schedule[j].scheduledTime =
          schedule[j].scheduledTime instanceof Date
            ? newDt.toJSDate()
            : newDt.toISO();

        schedule[j].localTime = newDt.toLocaleString(DateTime.DATETIME_MED);

        currentDt = newDt;
      } else {
        break;
      }
    }
  }

  return schedule;
};
