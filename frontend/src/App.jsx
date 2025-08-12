import {
  BrowserRouter as Router,
  Route,
  Routes,
  BrowserRouter,
} from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import LoginPage from "./pages/Login/Login";
import Dashboard from "./pages/Dashboard/Dashboard";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { checkAuth } from "./store/auth/authslice"; // Adjust the import path
import ProtectedRoute from "./components/ProtectedRoute";
import Footer from "./components/Footer";
import Navbar from "./components/Navbar";
import CalendarPage from "./pages/Calender/Calender";
import RelativeMedication from "./pages/RelativeMedication/RelativeMedication";
import EditPrescription from "./pages/EditPrescription/EditPrescription";
import CaregiverPage from "./pages/CareGiver/CareGiver";

export default function App() {
  const dispatch = useDispatch();
  console.log(Intl.DateTimeFormat().resolvedOptions().timeZone);

  const { loading } = useSelector((state) => state.auth);

  useEffect(() => {
    dispatch(checkAuth());
  }, [dispatch]);

  if (loading) {
    return <div>Loading authentication...</div>; // Replace with spinner if you like
  }

  // code from twilio
  // NS4KPX655RZB1DEM987ZV1H1
  // New code from twilio
  // 66UYVHBWN3CPNST4QHBEJN4F

  return (
    <BrowserRouter>
      <Navbar />

      {/* Toast */}
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />

      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calendar"
          element={
            <ProtectedRoute>
              <CalendarPage />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/relative/:relativeName"
          element={
            <ProtectedRoute>
              <RelativeMedication />
            </ProtectedRoute>
          }
        />
        <Route
          path="prescription/edit/:id"
          element={
            <ProtectedRoute>
              <EditPrescription />
            </ProtectedRoute>
          }
        />
        <Route
          path="/add-caregiver"
          element={
            <ProtectedRoute>
              <CaregiverPage />
            </ProtectedRoute>
          }
        />
      </Routes>
      <Footer />
    </BrowserRouter>
  );
}
