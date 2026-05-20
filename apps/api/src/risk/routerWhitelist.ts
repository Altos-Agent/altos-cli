import type { Router } from "../db/schema.js";
import { BLOCKED_STATUSES } from "./verification.js";

const normalizeAddress = (value: string) => value.toLowerCase();

export const resolveRouter = ({
  requestedRouter,
  preferredRouter,
  fallbackRouter,
  routers,
}: {
  requestedRouter?: string | null | undefined;
  preferredRouter?: string | null | undefined;
  fallbackRouter?: string | null | undefined;
  routers: Router[];
}) => {
  const routerName = requestedRouter ?? preferredRouter ?? fallbackRouter ?? null;

  if (!routerName) {
    return {
      routerName: null,
      reasons: ["No router selected"],
    };
  }

  const router = routers.find((candidate) => candidate.name === routerName);
  if (!router) {
    return {
      routerName,
      reasons: ["Unknown router"],
    };
  }

  if (!router.enabled) {
    return {
      routerName,
      reasons: ["Router is disabled"],
    };
  }

  if (BLOCKED_STATUSES.has(router.verificationStatus)) {
    return {
      routerName,
      reasons: [`Router is ${router.verificationStatus} and cannot be used`],
    };
  }

  if (router.verificationStatus === "UNVERIFIED") {
    return {
      routerName,
      reasons: [
        `Router is UNVERIFIED — mark VERIFIED or BLOCKED before live use`,
      ],
    };
  }

  return {
    routerName,
    reasons: [],
  };
};

export const checkAllowanceTarget = ({
  allowanceTarget,
  routers,
}: {
  allowanceTarget: string | null;
  routers: Router[];
}) => {
  if (!allowanceTarget) {
    return [];
  }

  const allowedRouterAddresses = routers
    .filter((router) => router.enabled && router.address && router.verificationStatus === "VERIFIED")
    .map((router) => normalizeAddress(router.address as string));

  if (!allowedRouterAddresses.includes(normalizeAddress(allowanceTarget))) {
    return ["Unknown or unverified allowance target"];
  }

  return [];
};