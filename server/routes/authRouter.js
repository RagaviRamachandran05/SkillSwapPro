const express = require("express");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const User = require("../models/User");
const Request = require("../models/Request");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing in .env");
}

// ─── Certificate Image Upload Setup ──────────────────────────────────────────
// Saved under server/uploads/certificates so they're served at
// /uploads/certificates/<file> by the existing static file middleware in
// server.js (same uploads root used for chat files).
const certUploadsDir = path.join(__dirname, "..", "uploads", "certificates");
if (!fs.existsSync(certUploadsDir)) {
  fs.mkdirSync(certUploadsDir, { recursive: true });
}

const certStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, certUploadsDir),
  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() + "-" + Math.random().toString(36).slice(2, 10) + path.extname(file.originalname);
    cb(null, uniqueName);
  },
});

const certUpload = multer({
  storage: certStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedExts = /\.(jpe?g|png|gif|webp|pdf)$/i;
    const allowedMimes = /^(image\/(jpeg|jpg|png|gif|webp)|application\/pdf)$/i;
    const extOk = allowedExts.test(path.extname(file.originalname));
    const mimeOk = allowedMimes.test(file.mimetype);
    if (extOk && mimeOk) return cb(null, true);
    cb(new Error("Only images (jpg, png, gif, webp) or PDF allowed for certificates"));
  },
});

const auth = (req, res, next) => {
  const header = req.header("Authorization");
  const token = header && header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ error: "User already exists" });
    }

    const user = new User({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
    });

    await user.save();

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        name: user.name,
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        name: user.name,
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/profile/:userId", auth, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select(
      "name email avatar bio createdAt rating isTrainer github linkedin certificates"
    );
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const totalSwaps = await Request.countDocuments({
      status: "accepted",
      $or: [{ fromUser: userId }, { toUser: userId }],
    });

    const skillsTaught = await Request.countDocuments({
      fromUser: userId,
      status: "accepted",
    });

    const skillsLearned = await Request.countDocuments({
      toUser: userId,
      status: "accepted",
    });

    res.json({
      ...user.toObject(),
      totalSwaps,
      skillsTaught,
      skillsLearned,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/update-profile", auth, async (req, res) => {
  try {
    const { name, bio, avatar, github, linkedin } = req.body;
    const updates = {};

    if (typeof name === "string" && name.trim()) updates.name = name.trim();
    if (typeof bio === "string") updates.bio = bio.trim();
    if (typeof avatar === "string") updates.avatar = avatar.trim();
    if (typeof github === "string") updates.github = github.trim();
    if (typeof linkedin === "string") updates.linkedin = linkedin.trim();

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ─── POST /api/auth/certificates ─────────────────────────────────────────────
// Add a skill certificate: a title + either a verification link, an uploaded
// image/PDF of the certificate, or both. This is how a user proves they're
// actually skilled at what they're offering to teach.
router.post("/certificates", auth, certUpload.single("image"), async (req, res) => {
  try {
    const { title, issuer, url } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Certificate title is required" });
    }

    if (!req.file && (!url || !url.trim())) {
      return res.status(400).json({
        error: "Provide a certificate image/PDF, a verification link, or both",
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.certificates.push({
      title: title.trim(),
      issuer: issuer ? issuer.trim() : "",
      url: url ? url.trim() : "",
      imageUrl: req.file ? `/uploads/certificates/${req.file.filename}` : "",
    });

    await user.save();

    res.status(201).json({
      message: "Certificate added",
      certificates: user.certificates,
    });
  } catch (error) {
    console.error("Add certificate error:", error.message);
    res.status(500).json({ error: error.message || "Failed to add certificate" });
  }
});

// ─── DELETE /api/auth/certificates/:certId ───────────────────────────────────
router.delete("/certificates/:certId", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const cert = user.certificates.id(req.params.certId);
    if (!cert) return res.status(404).json({ error: "Certificate not found" });

    cert.deleteOne();
    await user.save();

    res.json({ message: "Certificate removed", certificates: user.certificates });
  } catch (error) {
    console.error("Delete certificate error:", error.message);
    res.status(500).json({ error: "Failed to remove certificate" });
  }
});

module.exports = router;