const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: { type: String, required: true },
    bio: { type: String, default: "" },
    avatar: {
      type: String,
      default: "https://ui-avatars.com/api/?name=User&background=0d8abc&color=fff",
    },
    skills: [{ type: String }],
    location: { type: String, default: "" },
    rating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
    isTrainer: { type: Boolean, default: false },
    github: { type: String, default: "", trim: true },
    linkedin: { type: String, default: "", trim: true },
    certificates: [
      {
        title: { type: String, required: true, trim: true },
        issuer: { type: String, default: "", trim: true },
        url: { type: String, default: "", trim: true }, // link to the certificate (Coursera/Udemy verify link, etc.)
        imageUrl: { type: String, default: "" }, // uploaded photo of the certificate
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);