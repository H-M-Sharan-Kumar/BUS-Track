import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";

const router = Router();

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { name, email, password, role, phone,
          usn, academic_year, branch, roll_no, section } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, password required" });
  }
  const userRole = role || "student";
  try {
    const hash = await bcrypt.hash(password, 10);
    // Student details only stored for students
    const isStudent = userRole === "student";
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, phone,
                          usn, academic_year, branch, roll_no, section)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, name, email, role`,
      [
        name, email, hash, userRole, phone || null,
        isStudent ? (usn || null) : null,
        isStudent ? (academic_year || null) : null,
        isStudent ? (branch || null) : null,
        isStudent ? (roll_no || null) : null,
        isStudent ? (section || null) : null,
      ]
    );
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Email already exists" });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  try {
    const { rows } = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
