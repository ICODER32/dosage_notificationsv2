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

  // Normalize all events into user timezone and correct status
  const normalizeEvents = (schedule, userTz, notifications) => {
    const now = moment().tz(userTz);

    return schedule.map((entry) => {
      const userScheduledTime = moment(entry.scheduledTime).tz(userTz);

      // Find matching notification
      const notification = notifications.find((notif) => {
        const notifTime = moment(notif.sentAt).tz(userTz);
        return (
          notif.medications.includes(entry.prescriptionName) &&
          notifTime.isSame(userScheduledTime, "minute")
        );
      });

      let status = entry.status || "pending";
      if (notification) status = notification.status;

      // If still pending, decide missed or pending
      if (status === "pending") {
        if (userScheduledTime.isBefore(now)) status = "missed";
      }

      return {
        ...entry,
        userScheduledTime,
        formattedTime: userScheduledTime.format("h:mm A"),
        status,
      };
    });
  };

  // Daily view
  const processDailyData = () => {
    const userTz = getUserTimezone();
    const userCurrentDate = currentDate.clone().tz(userTz);
    const dayStart = userCurrentDate.clone().startOf("day");
    const dayEnd = userCurrentDate.clone().endOf("day");

    const events = normalizeEvents(
      userData.medicationSchedule,
      userTz,
      userData.notificationHistory || []
    ).filter((e) =>
      e.userScheduledTime.isBetween(dayStart, dayEnd, null, "[]")
    );

    const taken = events.filter((e) => e.status === "taken");
    const missed = events.filter((e) => e.status === "missed");
    const skipped = events.filter((e) => e.status === "skipped");
    const pending = events.filter((e) => e.status === "pending");

    const getEventDosage = (event) => {
      const p = userData?.prescriptions?.find(
        (p) => p.name === event.prescriptionName
      );
      return p?.dosage || 1;
    };

    const countPills = (list) =>
      list.reduce((acc, e) => acc + getEventDosage(e), 0);

    return {
      date: userCurrentDate.format("dddd, MMMM D"),
      userCurrentDate,
      totalPills: countPills(events),
      takenCount: countPills(taken),
      missedCount: countPills(missed),
      skippedCount: countPills(skipped),
      pendingCount: countPills(pending),
      missedMeds: [...new Set(missed.map((m) => m.prescriptionName))],
      events,
    };
  };

  // Weekly view
  const processWeeklyData = () => {
    const userTz = getUserTimezone();
    const userCurrentDate = currentDate.clone().tz(userTz);
    const startOfWeek = userCurrentDate.clone().startOf("isoWeek");
    const endOfWeek = userCurrentDate.clone().endOf("isoWeek");

    const events = normalizeEvents(
      userData.medicationSchedule,
      userTz,
      userData.notificationHistory || []
    ).filter((e) =>
      e.userScheduledTime.isBetween(startOfWeek, endOfWeek, "day", "[]")
    );

    const days = [];
    let currentDay = startOfWeek.clone();
    while (currentDay.isSameOrBefore(endOfWeek)) {
      const dayEvents = events.filter((e) =>
        e.userScheduledTime.isSame(currentDay, "day")
      );

      let status = "empty";
      if (dayEvents.length) {
        if (dayEvents.some((e) => e.status === "missed")) status = "missed";
        else if (dayEvents.some((e) => e.status === "skipped"))
          status = "skipped";
        else if (dayEvents.some((e) => e.status === "pending"))
          status = "pending";
        else if (dayEvents.every((e) => e.status === "taken")) status = "taken";
      }

      days.push({
        date: currentDay.clone(),
        label: currentDay.format("dd")[0],
        status,
        dayEvents,
      });

      currentDay.add(1, "day");
    }

    const getEventDosage = (event) => {
      const p = userData?.prescriptions?.find(
        (p) => p.name === event.prescriptionName
      );
      return p?.dosage || 1;
    };

    const countPills = (list) =>
      list.reduce((acc, e) => acc + getEventDosage(e), 0);

    return {
      range: `${startOfWeek.format("MMM D")} - ${endOfWeek.format("MMM D")}`,
      days,
      totalPills: countPills(events),
      takenCount: countPills(events.filter((e) => e.status === "taken")),
      missedCount: countPills(events.filter((e) => e.status === "missed")),
      skippedCount: countPills(events.filter((e) => e.status === "skipped")),
    };
  };

  // Monthly view
  const processMonthlyData = () => {
    const userTz = getUserTimezone();
    const userCurrentDate = currentDate.clone().tz(userTz);
    const startOfMonth = userCurrentDate.clone().startOf("month");
    const endOfMonth = userCurrentDate.clone().endOf("month");

    const events = normalizeEvents(
      userData.medicationSchedule,
      userTz,
      userData.notificationHistory || []
    ).filter((e) =>
      e.userScheduledTime.isBetween(startOfMonth, endOfMonth, "day", "[]")
    );

    const weeks = [];
    let currentDay = startOfMonth.clone().startOf("isoWeek");
    const endDay = endOfMonth.clone().endOf("isoWeek");

    while (currentDay.isSameOrBefore(endDay)) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        const dayEvents = events.filter((e) =>
          e.userScheduledTime.isSame(currentDay, "day")
        );

        let status = "empty";
        if (dayEvents.length) {
          if (dayEvents.some((e) => e.status === "missed")) status = "missed";
          else if (dayEvents.some((e) => e.status === "skipped"))
            status = "skipped";
          else if (dayEvents.some((e) => e.status === "pending"))
            status = "pending";
          else if (dayEvents.every((e) => e.status === "taken"))
            status = "taken";
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

    const getEventDosage = (event) => {
      const p = userData?.prescriptions?.find(
        (p) => p.name === event.prescriptionName
      );
      return p?.dosage || 1;
    };

    const countPills = (list) =>
      list.reduce((acc, e) => acc + getEventDosage(e), 0);

    return {
      month: userCurrentDate.format("MMMM YYYY"),
      weeks,
      totalPills: countPills(events),
      takenCount: countPills(events.filter((e) => e.status === "taken")),
      missedCount: countPills(events.filter((e) => e.status === "missed")),
      skippedCount: countPills(events.filter((e) => e.status === "skipped")),
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
          <button onClick={handlePrev}>
            &larr;{" "}
            {currentView === "daily"
              ? "Prev Day"
              : currentView === "weekly"
                ? "Prev Week"
                : "Prev Month"}
          </button>

          <button onClick={handleToday}>
            {currentView === "daily"
              ? "Today"
              : currentView === "weekly"
                ? "This Week"
                : "This Month"}
          </button>

          <button onClick={handleNext}>
            {currentView === "daily"
              ? "Next Day"
              : currentView === "weekly"
                ? "Next Week"
                : "Next Month"}{" "}
            &rarr;
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
            <div className="view-selector-btns" role="group">
              <button
                type="button"
                className={`${currentView === "daily" ? "day-active" : ""}`}
                onClick={() => setCurrentView("daily")}
              >
                Daily
              </button>
              <button
                type="button"
                className={`${currentView === "weekly" ? "week-active" : ""}`}
                onClick={() => setCurrentView("weekly")}
              >
                Weekly
              </button>
              <button
                type="button"
                className={`${currentView === "monthly" ? "month-active" : ""}`}
                onClick={() => setCurrentView("monthly")}
              >
                Monthly
              </button>
            </div>

            {currentView === "daily" && <DailyView data={calendarData.daily} />}
            {currentView === "weekly" && (
              <WeeklyView data={calendarData.weekly} />
            )}
            {currentView === "monthly" && (
              <MonthlyView data={calendarData.monthly} />
            )}

            <div className="legend-container">
              <h3>Legend</h3>
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
          {data.events.map((event, index) => (
            <div key={index} className="daily-pill-info-box">
              <div className="daily-pill-info-box-left">
                <div className={`pill-status-circle ${event.status}`}></div>
                <div>
                  <h3>{event.prescriptionName}</h3>
                  <p className="time">{event.formattedTime}</p>
                </div>
              </div>
              <div className={`pill-status ${event.status}`}>
                {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
              </div>
            </div>
          ))}
        </div>

        <div className="daily-view-contents-right">
          <div className="daily-view-contents-right-top">
            <div className="total-pills">
              <h3>{data.totalPills}</h3>
              <p>Total Pills</p>
            </div>
            <div className="taken-pills">
              <h3>{data.takenCount}</h3>
              <p>Taken</p>
            </div>
            <div className="missed-pills">
              <h3>{data.missedCount}</h3>
              <p>Missed</p>
            </div>
            <div className="skipped-pills">
              <h3>{data.skippedCount}</h3>
              <p>Skipped</p>
            </div>
          </div>

          {data.missedCount > 0 && (
            <div className="daily-view-missed-meds">
              <p className="missed-pills-title">Today's missed medicines</p>
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
              <h3>{data.totalPills}</h3>
              <p>Total Pills</p>
            </div>
            <div className="total-taken">
              <h3>{data.takenCount}</h3>
              <p>Taken</p>
            </div>
            <div className="total-missed">
              <h3>{data.missedCount}</h3>
              <p>Missed</p>
            </div>
            <div className="total-skipped">
              <h3>{data.skippedCount}</h3>
              <p>Skipped</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Monthly View Component
// Monthly View Component
const MonthlyView = ({ data }) => {
  if (!data) return null;

  return (
    <div className="monthly-view-container">
      <h2 className="daily-view-date">{data.month}</h2>

      <div className="daily-view-contents">
        <div className="monthly-view-contents-left">
          <div className="monthly-view-contents-left-bottom">
            {data.weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="monthly-pill-info-boxes">
                {week.map((day, dayIndex) => (
                  <div
                    key={dayIndex}
                    className={`monthly-pill-info-box ${day.inMonth ? "" : "not-in-month"
                      }`}
                  >
                    {/* Show weekday + date in each box */}
                    <div className="monthly-day">
                      {day.date.format("ddd")} {/* e.g., Mon, Tue */}
                    </div>
                    <div className="monthly-date">{day.date.format("D")}</div>

                    {/* Status indicator */}
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
              <h3>{data.totalPills}</h3>
              <p>Total Pills</p>
            </div>
            <div className="total-taken">
              <h3>{data.takenCount}</h3>
              <p>Taken</p>
            </div>
            <div className="total-missed">
              <h3>{data.missedCount}</h3>
              <p>Missed</p>
            </div>
            <div className="total-skipped">
              <h3>{data.skippedCount}</h3>
              <p>Skipped</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarPage;
