import express from "express";
import { getAllUsersCleaned } from "../services/snipeitassets.js";

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const users = await getAllUsersCleaned();
    res.json(users);
  } catch (err) {
    next(err);
  }
});

export default router;