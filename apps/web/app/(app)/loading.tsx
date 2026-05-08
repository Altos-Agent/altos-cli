import { LoadingCard } from "../../components/loading-card";

export default function Loading() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <LoadingCard />
      <LoadingCard />
      <LoadingCard />
      <LoadingCard />
    </div>
  );
}
