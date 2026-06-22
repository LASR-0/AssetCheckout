import { Router } from "express";

import requestRoutes from "./requestRoutes.js";
import userRoutes from "./userRoutes.js";
import approvalRoutes from "./approvalRoutes.js";
import authRoutes from "./authRoutes.js"
import categoryRoutes from "./categoryRoutes.js";
import settingsRoutes from "./settingsRoutes.js";
import snipeRoutes from "./snipeRoutes.js";
import jobRoutes from "./jobRoutes.js";
import integrationsRoutes from "./integrationRoutes.js";




const router = Router();

router.use("/requests", requestRoutes);
router.use("/users", userRoutes);
router.use("/approval", approvalRoutes);
router.use("/auth", authRoutes);
router.use("/", categoryRoutes);
router.use("/settings", settingsRoutes);
router.use("/snipe", snipeRoutes);
router.use("/job", jobRoutes);
router.use("/integrations", integrationsRoutes);

export default router;