export const shortenAddress = (address: string, size = 6) => {
  if (address.length <= size * 2 + 2) {
    return address;
  }

  return `${address.slice(0, size + 2)}...${address.slice(-size)}`;
};

export const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));

export const formatOptionalUsd = (value: string | null) =>
  value === null ? "Not set" : `$${Number(value).toLocaleString()}`;

export const formatTokenAmount = (value: string | null) =>
  value === null ? "Pending" : Number(value).toLocaleString();
