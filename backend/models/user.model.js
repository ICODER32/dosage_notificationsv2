import mongoose from "mongoose";

const caregiverSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  phoneNumber: {
    type: String,
    required: true,
    validate: {
      validator: function (v) {
        return /^\d{10,15}$/.test(v);
      },
      message: (props) => `${props.value} is not a valid phone number!`,
    },
  },
  forPersons: [
    {
      type: String,
      required: true,
    },
  ],
  notificationsEnabled: {
    type: Boolean,
    default: false,
  },
});

const prescriptionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  forWho: {
    type: String,
    default: "",
  },
  username: {
    type: String,
  },

  timesToTake: {
    type: Number,
    required: true,
    min: 1,
    max: 10,
  },
  dosage: {
    type: Number,
    required: true,
    min: 1,
  },
  instructions: {
    type: String,
    default: "",
  },
  sideEffects: {
    type: String,
    default: "",
  },
  initialCount: {
    type: Number,
    required: true,
    min: 1,
  },
  remindersEnabled: {
    type: Boolean,
    default: false,
  },
  tracking: {
    pillCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    dailyConsumption: {
      type: Number,
      default: 0,
      min: 0,
    },
    skippedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
});

const userSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    validate: {
      validator: function (v) {
        return /^\d{10,15}$/.test(v);
      },
      message: (props) => `${props.value} is not a valid phone number!`,
    },
  },
  username: {
    type: String,
  },
  notificationType: {
    type: String,
    enum: ["sms", "call"],
    default: "sms",
  },
  timezone: {
    type: String,
  },
  sleepTime: String,
  wakeTime: String,
  prescriptions: [prescriptionSchema],
  caregivers: [caregiverSchema],
  reminderTimes: {
    type: [String],
    validate: {
      validator: function (v) {
        return v.every((time) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(time));
      },
      message: (props) =>
        `${props.value} contains invalid time format! Use HH:mm`,
    },
  },
  flowStep: {
    type: String,
    default: "init",
  },
  notificationHistory: [
    {
      sentAt: {
        type: Date,
        default: Date.now,
      },
      medications: [
        {
          type: String,
        },
      ],
      message: String,
      status: {
        type: String,
        enum: ["pending", "taken", "skipped", "failed"],
        default: "pending",
      },
      resends: {
        type: Number,
        default: 0,
      },
      scheduleIds: [
        {
          // NEW: Store schedule item IDs
          type: mongoose.Schema.Types.ObjectId,
        },
      ],
    },
  ],
  notificationsEnabled: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ["active", "paused", "inactive"],
    default: "inactive",
  },
  verification: {
    otp: String,
    expiresAt: Date,
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  medicationSchedule: [
    {
      scheduledTime: Date,
      takenAt: Date,
      status: {
        type: String,
        enum: ["pending", "taken", "skipped"],
        default: "pending",
      },
      prescriptionName: String,
      prescriptionId: mongoose.Schema.Types.ObjectId,
      remainderSent: {
        type: Boolean,
        default: false,
      },
    },
  ],
  tracking: {
    optOutDate: Date,
    lastReminderSent: {
      type: Date,
      default: null,
    },
    lastInteraction: Date,
  },
  otp: {
    type: String,
    default: null,
  },
  customTimes: [String],
  meta: {
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: Date,
  },
  temp: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
});

userSchema.pre("save", function (next) {
  this.meta.updatedAt = Date.now();

  if (this.isModified("status") && this.status === "active") {
    this.prescriptions.forEach((p) => {
      if (p.tracking.pillCount === 0) {
        p.tracking.pillCount = p.initialCount;
      }
    });
  }

  next();
});

const User = mongoose.model("User", userSchema);
export default User;
