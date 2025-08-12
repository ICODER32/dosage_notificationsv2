import { configureStore } from "@reduxjs/toolkit";

import authReducer from "./auth/authslice";

const store = configureStore({
  reducer: {
    auth: authReducer,
  },
});
export default store;
// Export actions for use in components
