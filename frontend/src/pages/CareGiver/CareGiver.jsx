import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { UserPlus, User, X, Save, Trash2, Edit } from "lucide-react";
import { RiUserAddFill } from "react-icons/ri";
import "./CareGiver.css";
import { IoMdClose } from "react-icons/io";
import Swal from "sweetalert2";
import { toast } from "react-toastify";

const CaregiverPage = () => {
  const phoneNumber = useSelector((state) => state.auth.phoneNumber);
  const [caregivers, setCaregivers] = useState([]);
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingCaregiver, setEditingCaregiver] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    countryCode: "+1",
    phoneNumber: "",
    forPersons: [],
    notificationsEnabled: true,
  });

  // Fetch caregivers and persons
  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch caregivers
      const caregiversResponse = await fetch(`/api/caregivers/${phoneNumber}`);
      if (!caregiversResponse.ok) {
        throw new Error("Failed to fetch caregivers");
      }
      const caregiversData = await caregiversResponse.json();
      setCaregivers(caregiversData.caregivers);

      // Fetch user data to get persons
      const userResponse = await fetch(`/api/user/getData/${phoneNumber}`);
      if (!userResponse.ok) {
        throw new Error("Failed to fetch user data");
      }
      const userData = await userResponse.json();

      // Extract unique persons from prescriptions
      const uniquePersons = [
        ...new Set(
          userData.prescriptions
            .filter((p) => p.username)
            .map((p) => p.username)
        ),
      ];
      setPersons(uniquePersons);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (phoneNumber) {
      fetchData();
    }
  }, [phoneNumber]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "countryCode") {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
      return;
    }

    if (name === "phoneNumber") {
      if (isNaN(value)) return;
      if (value.length > 15) return;
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCheckboxChange = (person) => {
    setFormData((prev) => {
      const newPersons = prev.forPersons.includes(person)
        ? prev.forPersons.filter((p) => p !== person)
        : [...prev.forPersons, person];
      return {
        ...prev,
        forPersons: newPersons,
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const isEditing = !!editingCaregiver;

    if (isEditing) {
      const confirmResult = await Swal.fire({
        title: "Update Caregiver?",
        text: "Are you sure you want to save these changes?",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Yes, Update",
      });
      if (!confirmResult.isConfirmed) return;
    }

    try {
      // Combine country code and phone number without +
      const fullPhoneNumber = `${formData.countryCode.replace("+", "")}${
        formData.phoneNumber
      }`;
      const caregiverPayload = {
        ...formData,
        phoneNumber: fullPhoneNumber,
      };

      delete caregiverPayload.countryCode; // Remove temporary field

      const url = isEditing
        ? `/api/caregivers/${editingCaregiver._id}`
        : "/api/caregivers";
      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          caregiver: caregiverPayload,
        }),
      });

      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(
          responseData.message ||
            `Failed to ${isEditing ? "update" : "add"} caregiver`
        );
      }

      toast.success(
        `Caregiver ${isEditing ? "updated" : "added"} successfully!`
      );

      // Reset form
      setShowForm(false);
      setEditingCaregiver(null);
      setFormData({
        name: "",
        countryCode: "+1",
        phoneNumber: "",
        forPersons: [],
        notificationsEnabled: true,
      });
      fetchData();
    } catch (err) {
      toast.error(err.message);
      setError(err.message);
    }
  };

  const handleEdit = (caregiver) => {
    // Extract country code from stored phone number
    let countryCode = "+1";
    let phoneWithoutCode = caregiver.phoneNumber;

    if (caregiver.phoneNumber.startsWith("+")) {
      const spaceIndex = caregiver.phoneNumber.indexOf(" ");
      if (spaceIndex > -1) {
        countryCode = caregiver.phoneNumber.substring(0, spaceIndex);
        phoneWithoutCode = caregiver.phoneNumber.substring(spaceIndex + 1);
      } else {
        // Fallback if no space
        countryCode = "+1";
        phoneWithoutCode = caregiver.phoneNumber.replace("+1", "");
      }
    }

    setEditingCaregiver(caregiver);
    setFormData({
      name: caregiver.name,
      countryCode,
      phoneNumber: phoneWithoutCode,
      forPersons: caregiver.forPersons,
      notificationsEnabled: caregiver.notificationsEnabled,
    });
    setShowForm(true);
  };

  const handleDelete = async (caregiverId) => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: "This caregiver will be permanently deleted.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!",
    });

    if (result.isConfirmed) {
      try {
        const response = await fetch(`/api/caregivers/${caregiverId}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber }),
        });

        const responseData = await response.json();
        if (!response.ok) {
          throw new Error(responseData.message || "Failed to delete caregiver");
        }

        toast.success("Caregiver deleted successfully.");
        fetchData();
      } catch (err) {
        toast.error(err.message);
        setError(err.message);
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
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 p-4 rounded-lg">
          <h3 className="text-lg font-medium text-red-800">Error</h3>
          <p className="text-red-700 mt-2">{error}</p>
          <button
            onClick={fetchData}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="caregiver-container custom-container">
      <div className="page-header">
        <div>
          <h1>Caregiver Management</h1>
          <p>Manage your caregivers and their medication schedules.</p>
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingCaregiver(null);
          }}
        >
          <RiUserAddFill />
          Add Caregiver
        </button>
      </div>

      {/* Caregiver Form Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">
                {editingCaregiver ? "Edit Caregiver" : "Add New Caregiver"}
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingCaregiver(null);
                  setFormData({
                    name: "",
                    countryCode: "+1",
                    phoneNumber: "",
                    forPersons: [],
                    notificationsEnabled: true,
                  });
                }}
                className="modal-close-btn"
              >
                <IoMdClose className="icon" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="medication-modal-details">
              <div className="input-box">
                <label>Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="Enter caregiver name"
                />
              </div>

              <div className="input-box">
                <label>Phone Number</label>
                <div className="phone-input-group">
                  <div className="country-code-wrapper">
                    <select
                      name="countryCode"
                      value={formData.countryCode}
                      onChange={handleChange}
                      className="country-code-select"
                    >
                      <option value="+1">🇺🇸 +1</option>
                    </select>
                  </div>
                  <input
                    type="tel"
                    name="phoneNumber"
                    value={formData.phoneNumber}
                    maxLength={10}
                    onChange={handleChange}
                    className="phone-number-input"
                    required
                    pattern="[0-9]{7,15}"
                    title="7-15 digit phone number"
                    placeholder="1234567890"
                  />
                </div>
              </div>

              <div className="checkbox-container">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    name="notificationsEnabled"
                    checked={formData.notificationsEnabled}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        notificationsEnabled: e.target.checked,
                      }))
                    }
                  />
                  <span>Enable notifications for this caregiver</span>
                </label>
              </div>

              <div className="input-box">
                <div className="input-detail">
                  <label>Responsible For</label>
                  <p>Select persons this caregiver should manage</p>
                </div>
                <div className="name-checkbox-container">
                  {persons.length > 0 ? (
                    persons.map((person) => (
                      <label key={person} className="name-checkbox">
                        <input
                          type="checkbox"
                          checked={formData.forPersons.includes(person)}
                          onChange={() => handleCheckboxChange(person)}
                        />
                        <span>{person}</span>
                      </label>
                    ))
                  ) : (
                    <p>No persons found. Add medications for others first.</p>
                  )}
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingCaregiver(null);
                    setFormData({
                      name: "",
                      countryCode: "+1",
                      phoneNumber: "",
                      forPersons: [],
                      notificationsEnabled: true,
                    });
                  }}
                  className="cancel-button"
                >
                  Cancel
                </button>
                <button type="submit" className="submit-button">
                  {editingCaregiver ? "Update" : "Add"} Caregiver
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {caregivers[0] === null ? (
        <div className="no-caregivers-container">
          <h3>No caregivers added</h3>
          <p>Add caregivers to help manage medications for others</p>
          <button
            onClick={() => setShowForm(true)}
            className="add-first-caregiver-btn"
          >
            Add Your First Caregiver
          </button>
        </div>
      ) : (
        <div className="caregivers-contents">
          {caregivers.map((caregiver) => (
            <div
              key={caregiver._id}
              className={`caregiver-info-box ${
                caregiver?.notificationsEnabled ? "green" : "yellow"
              }`}
            >
              <div className="caregiver-header">
                <div>
                  <h3>{caregiver?.name}</h3>
                  <p className="caregiver-phone">{caregiver?.phoneNumber}</p>
                  <span
                    className={`notification-status ${
                      caregiver?.notificationsEnabled ? "green" : "yellow"
                    }`}
                  >
                    {caregiver?.notificationsEnabled
                      ? "Notifications Enabled"
                      : "Notifications Disabled"}
                  </span>
                </div>
                <div className="caregiver-actions">
                  <button
                    onClick={() => handleEdit(caregiver)}
                    className="edit-button"
                    title="Edit caregiver"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(caregiver?._id)}
                    className="delete-button"
                    title="Delete caregiver"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="managing-for">
                <h4>Managing medications for:</h4>
                {caregiver?.forPersons.length > 0 ? (
                  <div className="label-values">
                    {caregiver?.forPersons.map((person) => (
                      <span key={person} className="label-value">
                        {person}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p>Not assigned to any persons</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CaregiverPage;
