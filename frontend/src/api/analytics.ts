
export async function getPriceAverages(tier: string) {
  const res = await fetch(`/api/requests/averages?tier=${tier}`);

  if (!res.ok) {
    throw new Error("Failed to fetch averages");
  }
  const data = await res.json();
  return data.averages ?? {};
}

export async function getTiers(): Promise<string[]> {
  const res = await fetch("/api/requests/tiers");

  if (!res.ok) {
    throw new Error("Failed to fetch tiers");
  }

  const data = await res.json();
  return data.tiers;
}