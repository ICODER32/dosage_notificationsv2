// store/authSlice.js
import { createSlice } from "@reduxjs/toolkit";
import { jwtDecode } from "jwt-decode"; // Ensure you have jwt-decode installed

const initialState = {
  isAuthenticated: false,
  phoneNumber: "",
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    checkAuth(state) {
      const token = localStorage.getItem("token");
      if (!token) {
        state.isAuthenticated = false;
        state.error = "Token not found";
        return;
      }

      try {
        const decoded = jwtDecode(token);

        // Optional: Check token expiry
        const now = Date.now() / 1000;
        if (decoded.exp && decoded.exp < now) {
          state.isAuthenticated = false;
          state.error = "Token expired";
          localStorage.removeItem("token");
        } else {
          state.isAuthenticated = true;
          state.phoneNumber = decoded.phoneNumber || ""; // Assuming phoneNumber is in the token
          state.error = null;
        }
      } catch (err) {
        console.log(err);
        state.isAuthenticated = false;
        state.error = "Invalid token";
        localStorage.removeItem("token");
      }
    },

    logout(state) {
      localStorage.removeItem("token");
      state.isAuthenticated = false;
      state.error = null;
    },

    login(state, payload) {
      const { token } = payload.payload; // Assuming payload contains the token
      if (!token) {
        state.error = "No token provided";
        return;
      }

      try {
        const decoded = jwtDecode(token);
        state.isAuthenticated = true;
        state.phoneNumber = decoded.phoneNumber || ""; // Assuming phoneNumber is in the token
        localStorage.setItem("token", token);
        state.error = null;
      } catch (err) {
        console.error("Invalid token:", err);
        state.isAuthenticated = false;
        state.error = "Invalid token";
        localStorage.removeItem("token");
      }
    },
  },
});

export const { checkAuth, logout, login } = authSlice.actions;
export default authSlice.reducer;
