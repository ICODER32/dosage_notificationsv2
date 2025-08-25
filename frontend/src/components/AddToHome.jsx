import { useState, useEffect } from "react";

const AddToHomeButton = () => {
  const [instructions, setInstructions] = useState("");

  const detectDevice = () => {
    const ua = navigator.userAgent.toLowerCase();

    if (/iphone|ipad|ipod/.test(ua)) {
      return "ios";
    }
    if (/android/.test(ua)) {
      return "android";
    }
    return "desktop";
  };

  const handleAddToHome = () => {
    const device = detectDevice();

    if (device === "ios") {
      setInstructions(
        "Tap the Share button (Safari) → Scroll down → 'Add to Home Screen'."
      );
    } else if (device === "android") {
      setInstructions(
        "Open browser menu (⋮ in Chrome) → 'Add to Home Screen'."
      );
    } else {
      setInstructions("This option works best on mobile browsers.");
    }
  };

  return (
    <div className="flex flex-col items-center mt-4">
      <button
        onClick={handleAddToHome}
        className="bg-indigo-600 text-white px-4 py-2 rounded-md shadow-md hover:bg-indigo-700"
      >
        Add to Home Screen
      </button>

      {instructions && (
        <p className="mt-3 text-sm text-gray-700 text-center max-w-xs">
          {instructions}
        </p>
      )}
    </div>
  );
};

export default AddToHomeButton;
