import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { Loader2 } from "lucide-react";
import moment from "moment-timezone";
import "./Calender.css";

const CalendarPage = () => {
  const phoneNumber = useSelector((state) => state.auth.phoneNumber);
  const [userData, setUserData] = useState(null);
  const [currentView, setCurrentView] = useState("daily");
  const [currentDate, setCurrentDate] = useState(moment());
  const [calendarData, setCalendarData] = useState({});

  const getData = async () => {
    try {
      const response = await fetch(`/api/user/getData/${phoneNumber}`);
      if (!response.ok) throw new Error("Network response was not ok");
      const data = await response.json();
      setUserData(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    getData();
  }, []);

  useEffect(() => {
    if (!userData || !userData.medicationSchedule) return;

    // Process calendar data with timezone handling
    const data = {
      daily: processDailyData(),
      weekly: processWeeklyData(),
      monthly: processMonthlyData(),
    };
    setCalendarData(data);
  }, [userData, currentDate, currentView]);

  // Get user's timezone or default to UTC
  const getUserTimezone = () => {
    return userData?.timezone || "UTC";
  };

  // Convert UTC time to user's local time
  const toUserTime = (utcTime) => {
    return moment(utcTime).tz(getUserTimezone());
  };

  const getCombinedStatus = (scheduleEntry, userTz) => {
    // Use schedule status if it's already taken/skipped
    if (
      scheduleEntry.status === "taken" ||
      scheduleEntry.status === "skipped"
    ) {
      return scheduleEntry.status;
    }

    // Find matching notification
    const userScheduledTime = moment(scheduleEntry.scheduledTime).tz(userTz);
    const notification = userData.notificationHistory.find((notif) => {
      const notifTime = moment(notif.sentAt).tz(userTz);
      return (
        notif.medications.includes(scheduleEntry.prescriptionName) &&
        notifTime.isSame(userScheduledTime, "hour") &&
        notifTime.isSame(userScheduledTime, "day")
      );
    });

    return notification ? notification.status : scheduleEntry.status;
  };

  // Process data for daily view
  const processDailyData = () => {
    const userTz = getUserTimezone();
    const nowInUserTz = moment().tz(userTz);
    const userCurrentDate = currentDate.clone().tz(userTz);
    const dayStart = userCurrentDate.clone().startOf("day");
    const dayEnd = userCurrentDate.clone().endOf("day");

    const dayEvents = userData.medicationSchedule
      .filter((entry) => {
        const userScheduledTime = toUserTime(entry.scheduledTime);
        return userScheduledTime.isBetween(dayStart, dayEnd, null, "[]");
      })
      .map((entry) => {
        const userScheduledTime = toUserTime(entry.scheduledTime);
        const status = getCombinedStatus(entry, userTz);

        return {
          ...entry,
          userScheduledTime,
          formattedTime: userScheduledTime.format("h:mm A"),
          status, // Use combined status
        };
      });

    const taken = dayEvents.filter((e) => e.status === "taken");
    const skipped = dayEvents.filter((e) => e.status === "skipped");

    // Missed: pending AND in the past (in user's timezone)
    const missed = dayEvents.filter(
      (e) => e.status === "pending" && e.userScheduledTime.isBefore(nowInUserTz)
    );

    // Pending: pending AND in the future (in user's timezone)
    const pending = dayEvents.filter(
      (e) => e.status === "pending" && e.userScheduledTime.isAfter(nowInUserTz)
    );

    const missedMeds = [...new Set(missed.map((m) => m.prescriptionName))];

    return {
      date: userCurrentDate.format("dddd, MMMM D"),
      totalPills: dayEvents.length,
      takenCount: taken.length,
      missedCount: missed.length,
      skippedCount: skipped.length,
      pendingCount: pending.length,
      missedMeds,
      events: dayEvents,
      userCurrentDate,
    };
  };

  // Process data for weekly view
  const processWeeklyData = () => {
    const userTz = getUserTimezone();
    const nowInUserTz = moment().tz(userTz);
    const userCurrentDate = currentDate.clone().tz(userTz);
    const startOfWeek = userCurrentDate.clone().startOf("isoWeek");
    const endOfWeek = userCurrentDate.clone().endOf("isoWeek");

    const weekEvents = userData.medicationSchedule
      .filter((entry) => {
        const userScheduledTime = toUserTime(entry.scheduledTime);
        return userScheduledTime.isBetween(startOfWeek, endOfWeek, "day", "[]");
      })
      .map((entry) => {
        const userScheduledTime = toUserTime(entry.scheduledTime);
        const status = getCombinedStatus(entry, userTz);

        return {
          ...entry,
          userScheduledTime,
          status,
        };
      });

    const days = [];
    let currentDay = startOfWeek.clone();

    while (currentDay.isSameOrBefore(endOfWeek)) {
      const dayEvents = weekEvents.filter((entry) =>
        entry.userScheduledTime.isSame(currentDay, "day")
      );

      let status = "empty";
      if (dayEvents.length > 0) {
        const hasMissed = dayEvents.some(
          (e) =>
            e.status === "pending" && e.userScheduledTime.isBefore(nowInUserTz)
        );
        const hasSkipped = dayEvents.some((e) => e.status === "skipped");
        const hasPending = dayEvents.some(
          (e) =>
            e.status === "pending" && e.userScheduledTime.isAfter(nowInUserTz)
        );
        const allTaken = dayEvents.every((e) => e.status === "taken");

        if (hasMissed) status = "missed";
        else if (hasSkipped) status = "skipped";
        else if (hasPending) status = "pending";
        else if (allTaken) status = "taken";
      }

      days.push({
        date: currentDay.clone(),
        label: currentDay.format("dd")[0],
        status,
        dayEvents,
      });

      currentDay.add(1, "day");
    }

    const takenCount = weekEvents.filter((e) => e.status === "taken").length;
    const missedCount = weekEvents.filter(
      (e) => e.status === "pending" && e.userScheduledTime.isBefore(nowInUserTz)
    ).length;
    const skippedCount = weekEvents.filter(
      (e) => e.status === "skipped"
    ).length;

    return {
      range: `${startOfWeek.format("MMM D")} - ${endOfWeek.format("MMM D")}`,
      days,
      totalPills: weekEvents.length,
      takenCount,
      missedCount,
      skippedCount,
    };
  };

  // Process data for monthly view
  const processMonthlyData = () => {
    const userTz = getUserTimezone();
    const nowInUserTz = moment().tz(userTz);
    const userCurrentDate = currentDate.clone().tz(userTz);
    const startOfMonth = userCurrentDate.clone().startOf("month");
    const endOfMonth = userCurrentDate.clone().endOf("month");

    const monthEvents = userData.medicationSchedule
      .filter((entry) => {
        const userScheduledTime = toUserTime(entry.scheduledTime);
        return userScheduledTime.isBetween(
          startOfMonth,
          endOfMonth,
          "day",
          "[]"
        );
      })
      .map((entry) => {
        const userScheduledTime = toUserTime(entry.scheduledTime);
        const status = getCombinedStatus(entry, userTz);

        return {
          ...entry,
          userScheduledTime,
          status,
        };
      });

    const weeks = [];
    let currentDay = startOfMonth.clone().startOf("isoWeek");
    const endDay = endOfMonth.clone().endOf("isoWeek");

    while (currentDay.isSameOrBefore(endDay)) {
      const week = [];

      for (let i = 0; i < 7; i++) {
        const dayEvents = monthEvents.filter((entry) =>
          entry.userScheduledTime.isSame(currentDay, "day")
        );

        let status = "empty";
        if (dayEvents.length > 0) {
          const hasMissed = dayEvents.some(
            (e) =>
              e.status === "pending" &&
              e.userScheduledTime.isBefore(nowInUserTz)
          );
          const hasSkipped = dayEvents.some((e) => e.status === "skipped");
          const hasPending = dayEvents.some(
            (e) =>
              e.status === "pending" && e.userScheduledTime.isAfter(nowInUserTz)
          );
          const allTaken = dayEvents.every((e) => e.status === "taken");

          if (hasMissed) status = "missed";
          else if (hasSkipped) status = "skipped";
          else if (hasPending) status = "pending";
          else if (allTaken) status = "taken";
        }

        week.push({
          date: currentDay.clone(),
          inMonth: currentDay.isSame(userCurrentDate, "month"),
          status,
          dayEvents,
        });

        currentDay.add(1, "day");
      }

      weeks.push(week);
    }

    const takenCount = monthEvents.filter((e) => e.status === "taken").length;
    const missedCount = monthEvents.filter(
      (e) => e.status === "pending" && e.userScheduledTime.isBefore(nowInUserTz)
    ).length;
    const skippedCount = monthEvents.filter(
      (e) => e.status === "skipped"
    ).length;

    return {
      month: userCurrentDate.format("MMMM YYYY"),
      weeks,
      totalPills: monthEvents.length,
      takenCount,
      missedCount,
      skippedCount,
    };
  };

  const handlePrev = () => {
    if (currentView === "daily")
      setCurrentDate(currentDate.clone().subtract(1, "days"));
    else if (currentView === "weekly")
      setCurrentDate(currentDate.clone().subtract(1, "weeks"));
    else setCurrentDate(currentDate.clone().subtract(1, "months"));
  };

  const handleNext = () => {
    if (currentView === "daily")
      setCurrentDate(currentDate.clone().add(1, "days"));
    else if (currentView === "weekly")
      setCurrentDate(currentDate.clone().add(1, "weeks"));
    else setCurrentDate(currentDate.clone().add(1, "months"));
  };

  const handleToday = () => setCurrentDate(moment());

  return (
    <div className="calender-page-container custom-container">
      <div className="calender-page-header">
        <div>
          <h1>Pill Reminder Calendar</h1>
          <p>Keep track of your medication schedule</p>
        </div>

        <div className="calender-nav-controls">
          <button onClick={handlePrev} className="">
            &larr; Prev
          </button>
          <button onClick={handleNext} className="">
            Next &rarr;
          </button>
        </div>
      </div>

      <div className="calender-contents">
        {!userData ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="animate-spin w-6 h-6 text-blue-600" />
            <span className="ml-2 text-gray-600">Loading user data...</span>
          </div>
        ) : (
          <div className="calender-content">
            <div>
              <div className="">
                <div className="view-selector-btns" role="group">
                  <button
                    type="button"
                    className={` ${
                      currentView === "daily" ? "day-active" : ""
                    }`}
                    onClick={() => setCurrentView("daily")}
                  >
                    Daily
                  </button>
                  <button
                    type="button"
                    className={` ${
                      currentView === "weekly" ? "week-active" : ""
                    }`}
                    onClick={() => setCurrentView("weekly")}
                  >
                    Weekly
                  </button>
                  <button
                    type="button"
                    className={` ${
                      currentView === "monthly" ? "month-active" : ""
                    }`}
                    onClick={() => setCurrentView("monthly")}
                  >
                    Monthly
                  </button>
                </div>
              </div>

              {currentView === "daily" && (
                <DailyView data={calendarData.daily} />
              )}

              {currentView === "weekly" && (
                <WeeklyView data={calendarData.weekly} />
              )}

              {currentView === "monthly" && (
                <MonthlyView data={calendarData.monthly} />
              )}
            </div>

            <div className="legend-container">
              <h3 className="">Legend</h3>
              <div className="legends">
                <div className="legend">
                  <div className="legend-icon taken"></div>
                  <span>Taken</span>
                </div>
                <div className="legend">
                  <div className="legend-icon missed"></div>
                  <span>Missed</span>
                </div>
                <div className="legend">
                  <div className="legend-icon skipped"></div>
                  <span>Skipped</span>
                </div>
                <div className="legend">
                  <div className="legend-icon pending"></div>
                  <span>Pending</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Daily View Component
const DailyView = ({ data }) => {
  if (!data) return null;

  return (
    <div className="daily-view-container">
      <h2 className="daily-view-date">{data.date}</h2>

      <div className="daily-view-contents">
        <div className="daily-view-contents-left">
          {data.events.map((event, index) => {
            // Determine display status
            let displayStatus = event.status;
            if (
              event.status === "pending" &&
              event.userScheduledTime.isBefore(moment())
            ) {
              displayStatus = "missed";
            }

            return (
              <div key={index} className="daily-pill-info-box">
                <div className="daily-pill-info-box-left">
                  <div className={`pill-status-circle ${displayStatus}`}></div>
                  <div>
                    <h3 className="">{event.prescriptionName}</h3>
                    <p className="time">{event.formattedTime}</p>
                  </div>
                </div>
                <div className={`pill-status ${displayStatus}`}>
                  {displayStatus.charAt(0).toUpperCase() +
                    displayStatus.slice(1)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="daily-view-contents-right">
          <div>
            <div className="daily-view-contents-right-top">
              <div className="total-pills">
                <h3 className="">{data.totalPills}</h3>
                <p className="">Total Pills</p>
              </div>
              <div className="taken-pills">
                <h3 className="">{data.takenCount}</h3>
                <p className="">Taken</p>
              </div>
            </div>

            <p className="today-date-pills">
              {data.userCurrentDate.format("dddd")} – {data.takenCount} of{" "}
              {data.totalPills} pills taken
            </p>
          </div>

          <div className="">
            {data.missedCount > 0 && (
              <div className="daily-view-missed-meds">
                <p className="missed-pills-title">Today's missed Medicines</p>
                <div className="missed-pills-boxes">
                  {data.missedMeds.map((med, index) => (
                    <div key={index} className="missed-pill-box">
                      {med}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Weekly View Component
const WeeklyView = ({ data }) => {
  if (!data) return null;

  return (
    <div className="weekly-view-container">
      <h2 className="daily-view-date">Week: {data.range}</h2>

      <div className="daily-view-contents">
        <div className="weekly-view-contents-left">
          {data.days.map((day, index) => (
            <div key={index} className="weekly-pill-info-box">
              <div className="week-day">{day.date.format("ddd")}</div>
              <div className="date">{day.date.format("D")}</div>
              <div className={`status-label ${day.status}`}></div>
            </div>
          ))}
        </div>

        <div className="daily-view-contents-right">
          <div className="weekly-view-contents-right-top">
            <div className="total-pills">
              <h3 className="">{data.totalPills}</h3>
              <p className="">Total Pills</p>
            </div>
            <div className="total-taken">
              <h3 className="">{data.takenCount}</h3>
              <p className="">Taken</p>
            </div>
            <div className="total-missed">
              <h3 className="">{data.missedCount}</h3>
              <p className="">Missed</p>
            </div>
            <div className="total-skipped">
              <h3 className="">{data.skippedCount}</h3>
              <p className="">Skipped</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Monthly View Component
const MonthlyView = ({ data }) => {
  if (!data) return null;

  return (
    <div className="monthly-view-container">
      <h2 className="daily-view-date">{data.month}</h2>

      <div className="daily-view-contents">
        <div className="monthly-view-contents-left">
          <div className="monthly-view-contents-left-top">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="date">
                {day}
              </div>
            ))}
          </div>

          <div className="monthly-view-contents-left-bottom">
            {data.weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="monthly-pill-info-boxes">
                {week.map((day, dayIndex) => (
                  <div
                    key={dayIndex}
                    className={`monthly-pill-info-box ${
                      day.inMonth ? "" : "not-in-month"
                    }`}
                  >
                    <div className="monthly-date">{day.date.format("D")}</div>
                    <div className={`status-label ${day.status}`}></div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="daily-view-contents-right">
          <div className="weekly-view-contents-right-top">
            <div className="total-pills">
              <h3 className="">{data.totalPills}</h3>
              <p className="">Total Pills</p>
            </div>
            <div className="total-taken">
              <h3 className="">{data.takenCount}</h3>
              <p className="">Taken</p>
            </div>
            <div className="total-missed">
              <h3 className="">{data.missedCount}</h3>
              <p className="">Missed</p>
            </div>
            <div className="total-skipped">
              <h3 className="">{data.skippedCount}</h3>
              <p className="">Skipped</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarPage;
