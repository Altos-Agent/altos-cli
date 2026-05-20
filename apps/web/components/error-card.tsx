"use client";

import { ErrorState } from "./ui";

export const ErrorCard = ({
  title,
  description
}: {
  title: string;
  description: string;
}) => <ErrorState title={title} description={description} />;
