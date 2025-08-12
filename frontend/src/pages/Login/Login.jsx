import { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import Swal from "sweetalert2";
import { toast } from "react-toastify";
import { login } from "../../store/auth/authslice";
import "./Login.css"; // Import the new CSS file

const countryCodes = [
  { code: "+1", flag: "🇺🇸", name: "United States" },
  {
    code: "+92",
    flag: "🇵🇰",
    name: "Pakistan",
  },
];

const LoginPage = () => {
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedCountry, setSelectedCountry] = useState(countryCodes[0]); // Default to Bangladesh
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [fullPhone, setFullPhone] = useState("");
  const { isAuthenticated } = useSelector((state) => state.auth);
  const dispatch = useDispatch();

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  const handlePhoneSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const countryCodeDigits = selectedCountry.code.slice(1);
    const fullPhoneNumber = `${countryCodeDigits}${phoneNumber}`;

    try {
      await axios.post("/api/login/get-otp", { phoneNumber: fullPhoneNumber });
      setFullPhone(`${selectedCountry.code}${phoneNumber}`);
      setOtpSent(true);
    } catch (err) {
      console.log(err);
      setError(err.response?.data?.message || "Failed to send OTP");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (e, index) => {
    const value = e.target.value;
    if (/^\d*$/.test(value) && index < 4) {
      const newOtp = [...otp];
      newOtp[index] = value;
      setOtp(newOtp);

      // Move to next input if a digit is entered
      if (value && index < 3) {
        document.getElementById(`otp-${index + 1}`).focus();
      }
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    const otpCode = otp.join("");

    if (otpCode.length !== 4) {
      setError("Please enter a valid 4-digit OTP");

      Swal.fire({
        icon: "error",
        title: "Invalid OTP",
        text: "Please enter a valid 4-digit OTP.",
        confirmButtonText: "Retry",
      });

      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const countryCodeDigits = selectedCountry.code.slice(1);
      const fullPhoneNumber = `${countryCodeDigits}${phoneNumber}`;

      const data = await axios.post("/api/login/verify-otp", {
        phoneNumber: fullPhoneNumber,
        otp: otpCode,
      });
      console.log("Login successful:", data);

      localStorage.setItem("token", data.data.token);
      dispatch(login(data.data.token));

      // Show success toast
      toast.success("Login Successful! Redirecting...");

      setTimeout(() => {
        window.location.replace("/");
        // navigate("/");
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.message || "Invalid OTP");

      Swal.fire({
        icon: "error",
        title: "Login Failed",
        text: "Incorrect code or verification failed. Please try again.",
        confirmButtonText: "Retry",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page-container custom-container">
      <div className="login-content">
        <h1>Welcome to CareTrackRX</h1>
        <p className="subtitle">Your health, our priority</p>

        {error && <div className="error-message">{error}</div>}

        {!otpSent ? (
          <form onSubmit={handlePhoneSubmit}>
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <div className="phone-input-group">
                <select
                  value={selectedCountry.code}
                  onChange={(e) => {
                    const country = countryCodes.find(
                      (c) => c.code === e.target.value
                    );
                    setSelectedCountry(country);
                  }}
                  className="country-code-select"
                  // style={{
                  //   backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyBmaWxsPSdub25lJyBoZWlnaHQ9JzI0JyB2aWV3Qm94PScwIDAgMjQgMjQnIHdpZHRoPScyNCcgeG1sbnM9J2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJz48cGF0aCBkPSdNNyAxMGw1IDUgNS01JyBzdHJva2U9JyM2YjcyOGEnIHN0cm9rZS13aWR0aD0nMicgc3Ryb2tlLWxpbmVjYXA9J3JvdW5kJyBzdHJva2UtbGluZWpvaW49J3JvdW5kJy8+PC9zdmc+")`,
                  // }}
                >
                  {countryCodes.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.flag} {country.code}
                    </option>
                  ))}
                </select>
                {/* keyboard type numeric */}
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="Enter your phone number"
                  className="phone-input"
                  value={phoneNumber}
                  onChange={(e) =>
                    setPhoneNumber(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  required
                />
              </div>
              <p className="form-label">
                We'll send you a verification code via SMS
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="submit-button"
            >
              {isLoading ? "Sending OTP..." : "Continue"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit}>
            <div className="form-group">
              <label className="form-label otp-label">
                Enter 4-digit OTP sent via SMS to {fullPhone}
              </label>
              <div className="otp-inputs-container">
                {otp.map((digit, index) => (
                  <input
                    inputMode="numeric"
                    key={index}
                    id={`otp-${index}`}
                    type="text"
                    maxLength="1"
                    value={digit}
                    onChange={(e) => handleOtpChange(e, index)}
                    className="otp-input"
                    autoFocus={index === 0}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="submit-button"
            >
              {isLoading ? "Verifying..." : "Verify OTP"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
