import { Router } from "express";

/** Liveness only: no authentication, database query or paid provider call. */
export function createHealthRouter() {
  const router = Router();
  router.get("/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ status: "ok" });
  });
  return router;
}
