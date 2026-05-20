export const checkQuoteFreshness = ({
  quotedAt,
  expiresAt,
  now
}: {
  quotedAt: Date | null | undefined;
  expiresAt: Date | null | undefined;
  now: Date;
}) => {
  if (!quotedAt || !expiresAt) {
    return ["Quote timestamp is missing"];
  }

  if (Number.isNaN(quotedAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
    return ["Quote timestamp is invalid"];
  }

  if (now.getTime() > expiresAt.getTime()) {
    return ["Quote is stale or expired"];
  }

  return [];
};
