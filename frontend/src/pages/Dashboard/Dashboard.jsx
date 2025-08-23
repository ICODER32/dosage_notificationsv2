import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Pill,
  CheckCircle,
  AlertTriangle,
  X,
  Clock,
  Info,
  Pause,
  Play,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { IoMdInformationCircleOutline, IoMdClose } from "react-icons/io";
import { FaRegEdit } from "react-icons/fa";
import clockIcon from "../../assets/clock-icon.png";
import "./Dashboard.css";

const Dashboard = () => {
  const { isAuthenticated } = useSelector((state) => state.auth);
  const phoneNumber = useSelector((state) => state.auth.phoneNumber);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userData, setUserData] = useState(null);
  const [showForWhoModal, setShowForWhoModal] = useState(false);
  const [forWhoInputs, setForWhoInputs] = useState({});
  const [saving, setSaving] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState(null);
  const [modalType, setModalType] = useState(null);
  const [editableTimes, setEditableTimes] = useState([]);
  const [newTime, setNewTime] = useState("");

  const [showSetupPopup, setShowSetupPopup] = useState(false);

  const getData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/user/getData/${phoneNumber}`);
      if (!response.ok) throw new Error("Network response was not ok");
      const data = await response.json();
      setUserData(data);

      if (
        data.prescriptions?.filter((p) => p.forWho === "myself").length === 0
      ) {
        setShowSetupPopup(true);
      }

      const needsForWho = data.prescriptions?.some((p) => !p.forWho);
      if (needsForWho) {
        const inputs = {};
        data.prescriptions?.forEach((prescription) => {
          if (!prescription.forWho) {
            inputs[prescription._id] = {
              relation: "myself",
              name: prescription.name === "Myself" ? data.username : "",
            };
          }
        });
        setForWhoInputs(inputs);
        setShowForWhoModal(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && phoneNumber) getData();
  }, [isAuthenticated, phoneNumber]);

  const handleRelationChange = (id, value) => {
    setForWhoInputs((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        relation: value,
        name:
          value === "myself" ? userData?.username || "" : prev[id]?.name || "",
      },
    }));
  };

  const handleNameChange = (id, value) => {
    setForWhoInputs((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        name: value,
      },
    }));
  };

  const saveForWho = async () => {
    setSaving(true);
    try {
      const updatePromises = Object.entries(forWhoInputs).map(([id, data]) => {
        let forWhoValue = "";
        let usernameValue = "";

        if (data.relation === "myself") {
          forWhoValue = "myself";
          usernameValue = data.name.trim() || "myself";
        } else {
          forWhoValue = data.relation;
          usernameValue = data.name.trim();
        }

        return fetch(`/api/user/updatewho/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            forWho: forWhoValue,
            username: usernameValue,
          }),
        });
      });

      await Promise.all(updatePromises);
      setShowForWhoModal(false);
      getData();
    } catch (err) {
      setError("Failed to save names: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getNextDose = (prescriptionName) => {
    if (!userData?.medicationSchedule) return "Not scheduled";

    const now = new Date();
    const futureDoses = userData.medicationSchedule
      .filter(
        (item) =>
          item.prescriptionName === prescriptionName &&
          new Date(item.scheduledTime) > now &&
          item.status === "pending"
      )
      .sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));

    if (futureDoses.length === 0) return "No upcoming doses";
    const nextDose = futureDoses[0].scheduledTime;

    return new Date(nextDose).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getReminderTimes = (prescriptionId) => {
    if (!userData?.medicationSchedule) return [];
    const times = userData.medicationSchedule
      .filter((item) => item.prescriptionId === prescriptionId)
      .map((item) => formatTime(item.scheduledTime));
    return [...new Set(times)];
  };

  const openDetailsModal = (prescription) => {
    setSelectedPrescription(prescription);
    console.log(prescription);
    setModalType("details");
  };

  const closeModal = () => {
    setSelectedPrescription(null);
    setModalType(null);
    setEditableTimes([]);
    setNewTime("");
  };

  if (!isAuthenticated) {
    return (
      <div className="status-message error">
        You are not authenticated. Please login.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="status-message">Loading your medication data...</div>
    );
  }

  if (error) {
    return (
      <div className="status-message error">Error loading data: {error}</div>
    );
  }

  if (!userData) return null;

  const myPrescriptions =
    userData.prescriptions?.filter((p) => p.forWho === "myself") || [];
  const caregivers =
    // eslint-disable-next-line no-constant-binary-expression
    [
      ...new Set(
        userData.prescriptions
          ?.filter((p) => p.forWho !== "myself")
          ?.map((p) => p.username)
      ),
    ] || [];

  return (
    <div className="dashboard-container custom-container">
      <div className="dashboard-header-container">
        <h1>Medication Dashboard</h1>
        <p>
          Real-time pill tracking. Missed doses, taken meds, and daily
          insights—all in one place.
        </p>
      </div>

      {showForWhoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-700 p-6 relative">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    Who is this medication for?
                  </h2>
                  <p className="text-indigo-100 mt-1">
                    Please specify who each medication is intended for
                  </p>
                </div>
                <button
                  onClick={() => setShowForWhoModal(false)}
                  className="text-indigo-100 hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="max-h-[60vh] overflow-y-auto p-6 custom-scrollbar">
              {userData.prescriptions?.map(
                (prescription) =>
                  !prescription.forWho && (
                    <div
                      key={prescription._id}
                      className="bg-white rounded-lg border border-gray-200 mb-4 transition-all hover:shadow-md"
                    >
                      <div className="flex items-start p-4">
                        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center mr-4">
                          <Pill className="text-white" size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-lg text-gray-800 truncate">
                            {prescription.name}
                          </h3>
                          <p className="text-gray-500 text-sm mt-1">
                            {prescription.instructions}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border-t border-gray-100">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Relationship
                          </label>
                          <select
                            value={
                              forWhoInputs[prescription._id]?.relation ||
                              "myself"
                            }
                            onChange={(e) =>
                              handleRelationChange(
                                prescription._id,
                                e.target.value
                              )
                            }
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors"
                          >
                            <option value="myself">Myself</option>
                            <option value="child">My Child</option>
                            <option value="parent">My Parent</option>
                            <option value="spouse">My Spouse</option>
                            <option value="other">Someone Else</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {forWhoInputs[prescription._id]?.relation ===
                            "myself"
                              ? "Your Name"
                              : "Person's Name"}
                          </label>
                          <input
                            type="text"
                            value={forWhoInputs[prescription._id]?.name || ""}
                            onChange={(e) =>
                              handleNameChange(prescription._id, e.target.value)
                            }
                            required
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors"
                            placeholder={
                              forWhoInputs[prescription._id]?.relation ===
                              "myself"
                                ? "Your full name"
                                : "Enter full name"
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 p-6 border-t border-gray-200 flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3">
              <button
                onClick={() => setShowForWhoModal(false)}
                className="px-6 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveForWho}
                disabled={saving}
                className={`px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center ${
                  saving ? "opacity-70 cursor-not-allowed" : ""
                }`}
              >
                {saving ? (
                  <span className="flex items-center">
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
                  </span>
                ) : (
                  <span className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 mr-1"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Save Information
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalType === "details" && selectedPrescription && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">Medication Details</h2>
              <button onClick={closeModal} className="modal-close-btn">
                <IoMdClose className="icon" />
              </button>
            </div>
            <div className="medication-modal-details">
              <div className="medication-modal-details-header">
                <p className="label">Medication Name</p>
                <h3>{selectedPrescription?.name}</h3>
              </div>
              <div className="doses-container">
                <div>
                  <p className="label">Doses per day</p>
                  <p className="value">{selectedPrescription?.timesToTake}</p>
                </div>
                <div>
                  <p className="label">Next Dose</p>
                  <p className="value">
                    {getNextDose(selectedPrescription?.name)}
                  </p>
                </div>
              </div>
              <div>
                <p className="label">Reminder Times</p>
                <div className="tags-container">
                  {getReminderTimes(selectedPrescription?._id).map(
                    (time, index) => (
                      <span key={index} className="tag">
                        {time}
                      </span>
                    )
                  )}
                </div>
              </div>
              <div className="stats-container">
                <div className="stat-box stat-green">
                  <p className="label">Taken</p>
                  <p className="stat-value">
                    {selectedPrescription.initialCount -
                      selectedPrescription.tracking.pillCount}
                  </p>
                </div>
                <div className="stat-box stat-yellow">
                  <p className="label">Total Count</p>
                  <p className="stat-value">
                    {selectedPrescription?.tracking.pillCount}
                  </p>
                </div>
                <div className="stat-box stat-red">
                  <p className="label">Skipped</p>
                  <p className="stat-value">
                    {selectedPrescription.tracking.skippedCount}
                  </p>
                </div>
              </div>
              <div>
                <p className="label">Instructions</p>
                <p className="info-box">
                  {selectedPrescription?.instructions ||
                    "No specific instructions provided."}
                </p>
              </div>
              <div>
                <p className="label">Side Effects</p>
                <p className="info-box">
                  {selectedPrescription?.sideEffects ||
                    "No significant side effects reported."}
                </p>
              </div>
            </div>
            <div className="">
              <button onClick={closeModal} className="modal-footer-close-btn">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-top-container">
        {/*      {/* My Medications Section */}
        <div className="section-container">
          <h2 className="section-title">My Medications</h2>
          {myPrescriptions.length === 0 ? (
            <div className="empty-state">
              <h3 className="empty-state-title">No medications found</h3>
              {/* <p className="empty-state-subtitle">
                Add your first medication to get started
              </p> */}
            </div>
          ) : (
            <div className="my-medications-container">
              {myPrescriptions.map((prescription) => (
                <div
                  key={prescription._id}
                  className={`prescription-card ${
                    prescription.remindersEnabled ? "active" : "paused"
                  }`}
                >
                  <div className="prescription-card-body">
                    <div className="prescription-card-header">
                      <div>
                        <h3 className="prescription-card-title">
                          {prescription.name}
                        </h3>
                        <div
                          className={`prescription-card-activity ${
                            prescription.remindersEnabled
                              ? "status-green"
                              : "status-yellow"
                          }`}
                        >
                          {prescription.remindersEnabled ? "Active" : "Paused"}
                        </div>
                      </div>
                    </div>
                    <div className="prescription-card-details">
                      <div>
                        <p className="details-label">Doses per day</p>
                        <div className="details-value">
                          <p>{prescription.timesToTake}</p>
                        </div>
                      </div>
                      <div>
                        <p className="details-label">Next Dose</p>
                        <div className="details-value">
                          <img src={clockIcon} alt="" />
                          <p>{getNextDose(prescription.name)}</p>
                        </div>
                      </div>
                    </div>
                    <div className="prescription-card-footer">
                      <button
                        onClick={() => openDetailsModal(prescription)}
                        className="card-link"
                      >
                        <IoMdInformationCircleOutline className="icon" />
                        Details
                      </button>
                      <Link
                        to={`/prescription/edit/${prescription._id}`}
                        className="card-link"
                      >
                        {/* Edit */}
                        <FaRegEdit className="icon edit" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/*      {/* My Care Circle Section */}
        <div className="section-container">
          <h2 className="section-title">My Care Circle</h2>
          {caregivers.length === 0 ? (
            <div className="empty-state">
              <h3 className="empty-state-title">No family members added</h3>
              {/* <p className="empty-state-subtitle">
                Add family members to manage their medications
              </p> */}
            </div>
          ) : (
            <div className="caregivers-container">
              {caregivers.map((person, index) => (
                <div key={index} className="caregiver-card">
                  <div className="caregiver-card-header">
                    <div className="icon-box">
                      <Users className="icon-sm text-blue" />
                    </div>
                    <div>
                      <h3 className="caregiver-card-title">{person}</h3>
                      <p className="details-label">Family Member</p>
                    </div>
                  </div>
                  <div className="caregiver-card-footer">
                    <Link to={`/relative/${person}`} className="card-link">
                      View Medications →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
