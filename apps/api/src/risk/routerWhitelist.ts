import type { Router } from "../db/schema.js";

const normalizeAddress = (value: string) => value.toLowerCase();

export const resolveRouter = ({
  requestedRouter,
  preferredRouter,
  fallbackRouter,
  routers
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
      reasons: ["No router selected"]
    };
  }

  const router = routers.find((candidate) => candidate.name === routerName);
  if (!router) {
    return {
      routerName,
      reasons: ["Unknown router"]
    };
  }

  if (!router.enabled) {
    return {
      routerName,
      reasons: ["Router is disabled"]
    };
  }

  return {
    routerName,
    reasons: []
  };
};

export const checkAllowanceTarget = ({
  allowanceTarget,
  routers
}: {
  allowanceTarget: string | null;
  routers: Router[];
}) => {
  if (!allowanceTarget) {
    return [];
  }

  const enabledRouterAddresses = routers
    .filter((router) => router.enabled && router.address)
    .map((router) => normalizeAddress(router.address as string));

  if (!enabledRouterAddresses.includes(normalizeAddress(allowanceTarget))) {
    return ["Unknown allowance target"];
  }

  return [];
};
