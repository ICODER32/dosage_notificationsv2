import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { useParams, useNavigate } from "react-router-dom";
import { Pill, Clock, Save, Trash2, Pause, Play, X } from "lucide-react";
import Swal from "sweetalert2";
import { toast } from "react-toastify";
import "./EditPrescription.css";

export default function EditPrescription() {
  const phoneNumber = useSelector((state) => state.auth.phoneNumber);
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userData, setUserData] = useState(null);
  const [prescription, setPrescription] = useState(null);
  const [reminderTimes, setReminderTimes] = useState([]);
  const [originalReminderTimes, setOriginalReminderTimes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    dosage: 1,
    timesToTake: 1,
    instructions: "",
    sideEffects: "",
    initialCount: 0,
    remindersEnabled: true,
  });

  // Helper function to convert time to 12-hour format
  const formatTimeTo12Hour = (timeString) => {
    if (!timeString) return "";

    // Handle cases like "14:30", "02:15 PM", or even full ISO strings
    let hours, minutes;

    if (timeString.includes("AM") || timeString.includes("PM")) {
      // Already 12h format → return as-is
      return timeString;
    } else if (timeString.includes("T")) {
      // ISO string → extract hours/minutes
      const date = new Date(timeString);
      if (isNaN(date.getTime())) return "";
      hours = date.getHours();
      minutes = date.getMinutes();
    } else {
      // HH:mm format
      const parts = timeString.split(":");
      if (parts.length < 2) return "";
      hours = parseInt(parts[0], 10);
      minutes = parseInt(parts[1], 10);
    }

    // Convert to 12h
    const period = hours >= 12 ? "PM" : "AM";
    const hours12 = hours % 12 || 12;
    const formattedMinutes = String(minutes).padStart(2, "0");

    return `${hours12}:${formattedMinutes} ${period}`;
  };

  // Helper function to convert 12-hour format to 24-hour
  const formatTimeTo24Hour = (time12h) => {
    if (!time12h) return "";

    // If already in 24-hour format (no AM/PM), return as-is
    if (!time12h.includes("AM") && !time12h.includes("PM")) {
      return time12h;
    }

    const [time, period] = time12h.split(" ");
    let [hours, minutes] = time.split(":");

    if (period === "PM" && hours !== "12") {
      hours = String(parseInt(hours, 10) + 12);
    } else if (period === "AM" && hours === "12") {
      hours = "00";
    }

    return `${hours.padStart(2, "0")}:${minutes}`;
  };

  const getData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/user/getData/${phoneNumber}`);
      if (!response.ok) throw new Error("Network response was not ok");
      const data = await response.json();
      setUserData(data);

      // Find the specific prescription
      const foundPrescription = data.prescriptions.find((p) => p._id === id);

      if (!foundPrescription) {
        throw new Error("Prescription not found");
      }

      setPrescription(foundPrescription);
      setFormData({
        name: foundPrescription.name,
        dosage: foundPrescription.dosage,
        timesToTake: foundPrescription.timesToTake,
        instructions: foundPrescription.instructions || "",
        sideEffects: foundPrescription.sideEffects || "",
        initialCount: foundPrescription.initialCount,
        remindersEnabled: foundPrescription.remindersEnabled,
      });

      // Store original reminder times
      setOriginalReminderTimes(foundPrescription.reminderTimes || []);

      // Get reminder times for this prescription
      if (data.medicationSchedule) {
        const times = data.medicationSchedule
          .filter((item) => item.prescriptionName === foundPrescription.name)
          .map((item) => {
            const date = new Date(item.scheduledTime);
            // Format to 12-hour format directly
            return date.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            });
          });

        // Remove duplicates and take only the required number of times
        const uniqueTimes = [...new Set(times)];
        setReminderTimes(uniqueTimes.slice(0, foundPrescription.timesToTake));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (phoneNumber) {
      getData();
    }
  }, [phoneNumber, id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleNumberChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: Number(value),
    }));
  };

  const handleTimeChange = (index, newTime) => {
    // Create a new array with the updated time
    const updatedTimes = [...reminderTimes];
    updatedTimes[index] = newTime;
    setReminderTimes(updatedTimes);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      // Convert reminderTimes to 24h format
      const updatedTimes = reminderTimes.map((time) =>
        formatTimeTo24Hour(time)
      );

      // Merge with original times and remove duplicates
      const finalTimes = [
        ...new Set([...originalReminderTimes, ...updatedTimes]),
      ];

      const response = await fetch(`/api/user/update/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          phoneNumber,
          reminderTimes: finalTimes,
        }),
      });

      if (!response.ok) throw new Error("Failed to update prescription");

      // Update original times with the new values
      setOriginalReminderTimes(finalTimes);

      toast.success("Changes saved successfully!");
    } catch (err) {
      toast.error(err.message || "Failed to save changes.");
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: "You will permanently stop tracking this medication. This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, stop tracking!",
    });

    if (result.isConfirmed) {
      setDeleting(true);
      try {
        const response = await fetch(
          `/api/user/prescription/${phoneNumber}/${id}`,
          {
            method: "DELETE",
          }
        );
        if (!response.ok) throw new Error("Failed to delete prescription");

        toast.success("Prescription tracking has been stopped.");

        setTimeout(() => {
          navigate("/dashboard");
        }, 2000);
      } catch (err) {
        toast.error(err.message || "Could not stop tracking.");
        setDeleting(false);
      }
    }
  };

  const toggleReminders = async () => {
    const action = formData.remindersEnabled ? "Pause" : "Resume";

    const result = await Swal.fire({
      title: `${action} Reminders?`,
      text: `Do you want to ${action.toLowerCase()} all reminders for this medication?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: `Yes, ${action}`,
    });

    if (result.isConfirmed) {
      try {
        const response = await fetch(`/api/user/update/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phoneNumber,
            remindersEnabled: !formData.remindersEnabled,
          }),
        });

        if (!response.ok) throw new Error("Failed to update reminder status");

        const updatedRemindersEnabled = !formData.remindersEnabled;
        setFormData((prev) => ({
          ...prev,
          remindersEnabled: updatedRemindersEnabled,
        }));

        toast.success(
          `Reminders ${
            updatedRemindersEnabled ? "resumed" : "paused"
          } successfully!`
        );
      } catch (err) {
        toast.error(err.message || "Could not update status.");
      }
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-red-50 p-4 rounded-lg text-center">
          <h3 className="text-lg font-medium text-red-800">Error</h3>
          <p className="text-red-700 mt-2">{error}</p>
          <button
            onClick={getData}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!prescription) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-yellow-50 p-4 rounded-lg text-center">
          <h3 className="text-lg font-medium text-yellow-800">
            Prescription Not Found
          </h3>
          <p className="text-yellow-700 mt-2">
            The requested prescription does not exist
          </p>
          <button
            onClick={() => navigate("/dashboard")}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="editing-prescription-container custom-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Medication Settings</h1>
          <p className="page-subtitle">
            Adjust the details for <strong>{prescription.name}</strong> below.
          </p>
        </div>
      </div>

      <div className="edit-prescription-content-container">
        <div className="edit-prescription-form-container">
          <div className="back-button-container">
            <button onClick={() => navigate(-1)} className="back-button">
              <X size={24} className="back-icon" />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <div className="input-box">
                <label className="">Medication Name</label>
                <input
                  type="text"
                  name="name"
                  disabled
                  value={formData.name}
                  onChange={handleChange}
                  className=""
                  required
                />
              </div>

              <div className="input-box">
                <label className="">For</label>
                <div className="relative-input">
                  {prescription.username} ({prescription.forWho})
                </div>
              </div>

              <div className="input-box">
                <label className="">Dosage (pills per dose)</label>
                <input
                  type="number"
                  name="dosage"
                  disabled
                  value={formData.dosage}
                  onChange={handleNumberChange}
                  min="1"
                  className=""
                  required
                />
              </div>
            </div>

            <div className="input-group two-column">
              <div className="input-box">
                <label className="">Times to take per day</label>
                <input
                  type="number"
                  name="timesToTake"
                  disabled
                  value={formData.timesToTake}
                  onChange={handleNumberChange}
                  min="1"
                  max="10"
                  className=""
                  required
                />
              </div>

              <div className="input-box">
                <label className="">Initial Pill Count</label>
                <input
                  type="number"
                  name="initialCount"
                  disabled
                  value={formData.initialCount}
                  onChange={handleNumberChange}
                  min="1"
                  className=""
                  required
                />
              </div>
            </div>

            <div className="input-group">
              <div className="input-box">
                <label className="">Reminder Status</label>
                <button
                  type="button"
                  onClick={toggleReminders}
                  className={`reminders-button ${
                    formData.remindersEnabled ? "active" : "paused"
                  } `}
                >
                  {formData.remindersEnabled ? (
                    <>
                      <Play className="w-4 h-4" />
                      Active
                    </>
                  ) : (
                    <>
                      <Pause className="w-4 h-4 " />
                      Paused
                    </>
                  )}
                </button>
              </div>

              <div className="input-box">
                <div className="times-header">
                  <label className="">Reminder Times</label>
                  <button
                    type="submit"
                    disabled={saving}
                    className="times-save-btn"
                  >
                    {saving ? (
                      <>
                        <svg
                          className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save Times
                      </>
                    )}
                  </button>
                </div>
                <div className="time-inputs-container">
                  {reminderTimes.map((time, index) => (
                    <div key={index} className="time-input-row">
                      <Clock size={18} className="clock-icon" />
                      <input
                        type="time"
                        value={formatTimeTo24Hour(time) || ""}
                        onChange={(e) =>
                          handleTimeChange(index, e.target.value)
                        }
                        className="time-input"
                      />
                      {/* change to 12 hour format */}
                      <span className="time-display">
                        {formatTimeTo12Hour(time)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="input-group two-column">
              <div className="input-box">
                <label className="">Instructions</label>
                <input
                  name="instructions"
                  disabled
                  value={formData.instructions}
                  onChange={handleChange}
                  className=""
                  placeholder="Enter instructions for taking this medication"
                />
              </div>

              <div className="input-box">
                <label className="">Side Effects</label>
                <input
                  name="sideEffects"
                  value={formData.sideEffects}
                  disabled
                  onChange={handleChange}
                  className="side-effects-input"
                  placeholder="No side effects reported"
                />
              </div>
            </div>

            <div className="input-group stats-group">
              <div className="stats taken">
                <p className="">Taken</p>
                <p className="value">
                  {prescription.initialCount - prescription.tracking.pillCount}
                </p>
              </div>
              <div className="stats total">
                <p className="">Total Count</p>
                <p className="value">{prescription.tracking.pillCount}</p>
              </div>
              <div className="stats skipped">
                <p className="">Skipped</p>
                <p className="value">{prescription.tracking.skippedCount}</p>
              </div>
            </div>

            <div className="input-group btns">
              <button
                type="submit"
                disabled={saving}
                className={` ${saving ? "" : ""} save-btn`}
              >
                {saving ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={toggleReminders}
                className={` ${
                  formData.remindersEnabled ? "" : ""
                } reminder-btn `}
              >
                {formData.remindersEnabled ? (
                  <>
                    <Pause className="w-4 h-4" />
                    Pause Reminders
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Resume Reminders
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className={` ${deleting ? "" : ""} delete-btn`}
              >
                {deleting ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 " />
                    Stop Tracking
                  </>
                )}
              </button>
            </div>

            {error && <div className="">{error}</div>}
          </form>
        </div>
      </div>
    </div>
  );
}
