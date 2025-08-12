// // import "./MedicationSetupPopup.css";

// // const MedicationSetupPopup = ({ onClose }) => {
// //   return (
// //     <div className="medication-setup-popup-wrapper" onClick={onClose}>
// //       MedicationSetupPopup
// //     </div>
// //   );
// // };

// // export default MedicationSetupPopup;

// import React, { useState } from "react";
// import { X, Pill, Sunrise, Sunset } from "lucide-react";
// import "./MedicationSetupPopup.css";

// const MedicationSetupPopup = ({ onClose }) => {
//   // State for each form input
//   const [medicationName, setMedicationName] = useState("");
//   const [timesPerDay, setTimesPerDay] = useState(1);
//   const [wakeUpTime, setWakeUpTime] = useState("07:00");
//   const [sleepTime, setSleepTime] = useState("22:00");
//   const [instructions, setInstructions] = useState("");
//   const [isSubmitting, setIsSubmitting] = useState(false);

//   // Stop propagation to prevent the modal from closing when clicking inside
//   const handlePopupContentClick = (e) => {
//     e.stopPropagation();
//   };

//   // Handle form submission
//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setIsSubmitting(true);

//     const formData = {
//       medicationName,
//       timesPerDay,
//       wakeUpTime,
//       sleepTime,
//       instructions,
//     };

//     console.log("Submitting Medication Data:", formData);

//     // --- TODO: Replace with your actual API call ---
//     // Example:
//     // try {
//     //   const response = await fetch('/api/medication/add', {
//     //     method: 'POST',
//     //     headers: { 'Content-Type': 'application/json' },
//     //     body: JSON.stringify(formData),
//     //   });
//     //   if (!response.ok) throw new Error('Failed to save medication');
//     //
//     //   // On success, you would show the success message and close the modal
//     //   console.log('Medication saved successfully!');
//     //   onClose(); // Close the modal
//     //
//     // } catch (error) {
//     //   console.error(error);
//     //   // Handle error state
//     // } finally {
//     //   setIsSubmitting(false);
//     // }
//     // --- End of TODO ---

//     // For demonstration purposes, we'll simulate a network request
//     setTimeout(() => {
//       setIsSubmitting(false);
//       onClose(); // Close the modal after submission
//     }, 1000);
//   };

//   return (
//     <div className="popup-overlay" onClick={onClose}>
//       <div className="popup-content" onClick={handlePopupContentClick}>
//         <div className="popup-header">
//           <h2 className="popup-title">Set Up Your First Medication</h2>
//           <button
//             className="popup-close-btn"
//             onClick={onClose}
//             aria-label="Close popup"
//           >
//             <X size={24} />
//           </button>
//         </div>
//         <p className="popup-subtitle">
//           Let's get your reminders configured. This will help us send timely
//           alerts.
//         </p>

//         <form className="setup-form" onSubmit={handleSubmit}>
//           {/* Medication Name */}
//           <div className="input-box">
//             <label htmlFor="medicationName">
//               {/* <Pill className="form-icon" />  */}
//               Medication Name
//             </label>
//             <input
//               type="text"
//               id="medicationName"
//               placeholder="e.g., Aspirin, Vitamin D"
//               value={medicationName}
//               onChange={(e) => setMedicationName(e.target.value)}
//               required
//             />
//           </div>

//           {/* Doses Per Day */}
//           <div className="input-box">
//             <label htmlFor="timesPerDay">How many times a day?</label>
//             <input
//               type="number"
//               id="timesPerDay"
//               value={timesPerDay}
//               onChange={(e) => setTimesPerDay(e.target.value)}
//               min="1"
//               max="10"
//               required
//             />
//           </div>

//           {/* Wake Up & Sleep Time Grid */}
//           <div className="input-group">
//             {/* Wake Up Time */}
//             <div className="input-box">
//               <label htmlFor="wakeUpTime">
//                 {/* <Sunrise className="form-icon" />  */}
//                 Wake-up Time
//               </label>
//               <input
//                 type="time"
//                 id="wakeUpTime"
//                 value={wakeUpTime}
//                 onChange={(e) => setWakeUpTime(e.target.value)}
//                 required
//               />
//             </div>

//             {/* Sleep Time */}
//             <div className="input-box">
//               <label htmlFor="sleepTime">
//                 {/* <Sunset className="form-icon" />  */}
//                 Sleep Time
//               </label>
//               <input
//                 type="time"
//                 id="sleepTime"
//                 value={sleepTime}
//                 onChange={(e) => setSleepTime(e.target.value)}
//                 required
//               />
//             </div>
//           </div>
//           <p className="form-hint">
//             We'll only send reminders between your wake-up and sleep times.
//           </p>

//           {/* Instructions */}
//           <div className="input-box">
//             <label htmlFor="instructions">Instructions (Optional)</label>
//             <textarea
//               id="instructions"
//               className="form-textarea"
//               placeholder="e.g., Take with food, store in a cool place"
//               value={instructions}
//               onChange={(e) => setInstructions(e.target.value)}
//               rows="3"
//             ></textarea>
//           </div>

//           {/* Submit Button */}
//           <div className="form-footer">
//             <button
//               type="submit"
//               className="submit-btn"
//               disabled={isSubmitting}
//             >
//               {isSubmitting ? "Saving..." : "Save and Start Tracking"}
//             </button>
//           </div>
//         </form>
//       </div>
//     </div>
//   );
// };

// export default MedicationSetupPopup;

import React, { useState } from "react";
import { useSelector } from "react-redux"; // Import useSelector
import { X, Pill, Sunrise, Sunset } from "lucide-react";
import { toast } from "react-toastify"; // Import toast
import "./MedicationSetupPopup.css";

const MedicationSetupPopup = ({ onClose, onMedicationAdded }) => {
  // Get the current user's phone number from Redux store
  const { phoneNumber } = useSelector((state) => state.auth);

  // State for each form input
  const [medicationName, setMedicationName] = useState("");
  const [timesPerDay, setTimesPerDay] = useState(1);
  const [wakeUpTime, setWakeUpTime] = useState("07:00");
  const [sleepTime, setSleepTime] = useState("22:00");
  const [instructions, setInstructions] = useState("");
  // Added two more fields based on backend schema
  const [dosage, setDosage] = useState(1);
  const [initialCount, setInitialCount] = useState(30);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Stop propagation to prevent the modal from closing when clicking inside
  const handlePopupContentClick = (e) => {
    e.stopPropagation();
  };

  // --- UPDATED HANDLE SUBMIT FUNCTION ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!phoneNumber) {
      toast.error("User phone number not found. Please log in again.");
      return;
    }
    setIsSubmitting(true);

    // This is the prescription object that matches the `remainders.routes.js`
    const prescriptionData = {
      name: medicationName,
      timesToTake: parseInt(timesPerDay, 10),
      instructions: instructions,
      dosage: parseInt(dosage, 10),
      initialCount: parseInt(initialCount, 10),
    };

    // This is the main request body
    const requestBody = {
      phoneNumber,
      wakeTime: wakeUpTime,
      sleepTime: sleepTime,
      prescription: prescriptionData,
    };

    try {
      const response = await fetch("/api/reminders/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        // Throw an error to be caught by the catch block
        throw new Error(data.message || "Failed to save medication.");
      }

      // Show success toast
      toast.success("Medication added successfully!");

      // We call this function to tell the Dashboard to refresh its data
      if (onMedicationAdded) {
        onMedicationAdded();
      }

      onClose(); // Close the modal on success
    } catch (error) {
      console.error("Error submitting medication:", error);
      // Show error toast
      toast.error(error.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-content" onClick={handlePopupContentClick}>
        <div className="popup-header">
          <h2 className="popup-title">Set Up Your First Medication</h2>
          <button
            className="popup-close-btn"
            onClick={onClose}
            aria-label="Close popup"
          >
            <X size={24} />
          </button>
        </div>
        <p className="popup-subtitle">
          Let's get your reminders configured. This will help us send timely
          alerts.
        </p>

        <form className="setup-form" onSubmit={handleSubmit}>
          {/* Form fields remain the same, with two additions */}
          <div className="input-box">
            <label htmlFor="medicationName">Medication Name</label>
            <input
              type="text"
              id="medicationName"
              placeholder="e.g., Aspirin, Vitamin D"
              value={medicationName}
              onChange={(e) => setMedicationName(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <div className="input-box">
              <label htmlFor="dosage">Dosage (pills per dose)</label>
              <input
                type="number"
                id="dosage"
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
                min="1"
                required
              />
            </div>
            <div className="input-box">
              <label htmlFor="initialCount">Total Pill Count</label>
              <input
                type="number"
                id="initialCount"
                value={initialCount}
                onChange={(e) => setInitialCount(e.target.value)}
                min="1"
                required
              />
            </div>
          </div>

          <div className="input-box">
            <label htmlFor="timesPerDay">How many times a day?</label>
            <input
              type="number"
              id="timesPerDay"
              value={timesPerDay}
              onChange={(e) => setTimesPerDay(e.target.value)}
              min="1"
              max="10"
              required
            />
          </div>

          <div className="input-group">
            <div className="input-box">
              <label htmlFor="wakeUpTime">Wake-up Time</label>
              <input
                type="time"
                id="wakeUpTime"
                value={wakeUpTime}
                onChange={(e) => setWakeUpTime(e.target.value)}
                required
              />
            </div>
            <div className="input-box">
              <label htmlFor="sleepTime">Sleep Time</label>
              <input
                type="time"
                id="sleepTime"
                value={sleepTime}
                onChange={(e) => setSleepTime(e.target.value)}
                required
              />
            </div>
          </div>
          <p className="form-hint">
            We'll only send reminders between your wake-up and sleep times.
          </p>

          <div className="input-box">
            <label htmlFor="instructions">Instructions (Optional)</label>
            <textarea
              id="instructions"
              className="form-textarea"
              placeholder="e.g., Take with food, store in a cool place"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows="3"
            ></textarea>
          </div>

          <div className="form-footer">
            <button
              type="submit"
              className="submit-btn"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save and Start Tracking"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MedicationSetupPopup;
