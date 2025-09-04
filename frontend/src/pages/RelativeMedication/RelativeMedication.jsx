import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useParams, Link } from "react-router-dom";
import {
  Pill,
  Clock,
  Info,
  X,
  Edit,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import moment from "moment-timezone";
import clockIcon from "../../assets/clock-icon.png";
import "./RelativeMedication.css";
import { IoMdClose, IoMdInformationCircleOutline } from "react-icons/io";
import { FaRegEdit } from "react-icons/fa";

export default function RelativeMedication() {
  const { relativeName } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPrescription, setSelectedPrescription] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const phoneNumber = useSelector((state) => state.auth.phoneNumber);

  const getData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/user/getData/${phoneNumber}`);
      if (!response.ok) throw new Error("Network response was not ok");
      const result = await response.json();

      const relativePrescriptions =
        result.prescriptions?.filter((p) => p.username === relativeName) || [];

      setData({
        ...result,
        prescriptions: relativePrescriptions,
      });
    } catch (error) {
      console.error("Error fetching data:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (phoneNumber) getData();
  }, [phoneNumber, relativeName]);

  const formatTime = (isoString) => {
    if (!isoString) return "";
    const tz = data?.timezone || "UTC";
    return moment(isoString).tz(tz).format("hh:mm A");
  };

  const getNextDose = (prescriptionName) => {
    if (!data?.medicationSchedule) return "Not scheduled";
    const now = new Date();
    const futureDoses = data.medicationSchedule
      .filter(
        (item) =>
          item.prescriptionName === prescriptionName &&
          new Date(item.scheduledTime) > now &&
          item.status === "pending"
      )
      .sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));

    if (futureDoses.length === 0) return "No upcoming doses";

    const tz = data?.timezone || "UTC";
    return moment(futureDoses[0].scheduledTime).tz(tz).format("MMM D, hh:mm A");
  };

  const getReminderTimes = (prescriptionName) => {
    if (!data?.medicationSchedule) return [];

    const tz = data?.timezone || "UTC";

    const times = data.medicationSchedule
      .filter((item) => item.prescriptionName === prescriptionName)
      .map((item) => moment(item.scheduledTime).tz(tz).format("hh:mm A"));

    return [...new Set(times)];
  };

  const openDetailsModal = (prescription) => {
    setSelectedPrescription(prescription);
    setShowDetailsModal(true);
  };

  const closeModal = () => {
    setShowDetailsModal(false);
    setSelectedPrescription(null);
  };

  if (loading) {
    return (
      <div className="text-center py-10">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600"></div>
        <p className="mt-2 text-gray-600">
          Loading medications for {relativeName}...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10 text-red-600">
        <h3 className="font-medium">Error loading data</h3>
        <p>{error}</p>
        <button
          onClick={getData}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="relative-container custom-container page">
      <div className="page-header">
        <div>
          <h1 className="">Medications for {relativeName}</h1>
          <p>
            An overview of their current prescriptions and upcoming schedule.
          </p>
        </div>
      </div>

      {data.prescriptions.length === 0 ? (
        <div className="no-relative-medications">
          <h3>No medications found for {relativeName}</h3>
          <p>{relativeName} doesn't have any medications tracked yet</p>
        </div>
      ) : (
        <div className="relative-contents">
          {data.prescriptions.map((prescription) => (
            <div
              key={prescription._id}
              className={`relative-info-box ${
                prescription.remindersEnabled ? "green" : "yellow"
              }`}
            >
              <div className="relative-info-box-header">
                <div>
                  <h3>{prescription.name}</h3>
                  <div className="relative-info-box-subheader">
                    <span className="status who">{prescription.forWho}</span>
                    <span
                      className={`status ${
                        prescription.remindersEnabled ? "green" : "yellow"
                      }`}
                    >
                      {prescription.remindersEnabled ? "Active" : "Paused"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="relative-info-box-details">
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

              <div className="relative-info-box-footer">
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
                  <FaRegEdit className="icon edit" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {showDetailsModal && selectedPrescription && (
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
                <h3>{selectedPrescription.name}</h3>
                <p>
                  For: {relativeName} ({selectedPrescription.forWho})
                </p>
              </div>

              <div className="doses-container">
                <div>
                  <p className="label">Doses per day</p>
                  <p className="value">{selectedPrescription.timesToTake}</p>
                </div>
                <div>
                  <p className="label">Next Dose</p>
                  <p className="value">
                    {getNextDose(selectedPrescription.name)}
                  </p>
                </div>
              </div>

              <div className="reminder-times-container">
                <p className="label">Reminder Times</p>
                <div className="reminder-times">
                  {getReminderTimes(selectedPrescription.name).map(
                    (time, index) => (
                      <div key={index} className="reminder-time">
                        {time}
                      </div>
                    )
                  )}
                </div>
              </div>

              <div className="stats-container">
                <div className="stat-box stat-green">
                  <p className="label">Taken</p>
                  <p className="stat-value">
                    {selectedPrescription.tracking.pillCount}
                  </p>
                </div>
                <div className="stat-box stat-yellow">
                  <p className="label">Total Count</p>
                  <p className="stat-value">
                    {selectedPrescription.initialCount}
                  </p>
                </div>
                <div className="stat-box stat-red">
                  <p className="label">Skipped</p>
                  <p className="stat-value">
                    {selectedPrescription.tracking.dailyConsumption}
                  </p>
                </div>
              </div>

              <div>
                <p className="label">Instructions</p>
                <p className="info-box">
                  {selectedPrescription.instructions ||
                    "No specific instructions provided."}
                </p>
              </div>

              <div>
                <p className="label">Side Effects</p>
                <p className="info-box">
                  {selectedPrescription.sideEffects ||
                    "No significant side effects reported."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
