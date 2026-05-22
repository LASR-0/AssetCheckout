export async function checkoutAsset(data: any) {
  const payload = {
    user_id: data.userId,
    user_name: data.userName,
    category_id: data.categoryId,
    spec_level: data.specLevel,
    reason: data.reason,
    call_text: data.callText,
    new_number: data.newNumber,
    manager: data.manager,
    manager_id: data.managerId
  };

  console.log("🚀 FINAL PAYLOAD BEING SENT:", payload);

  const res = await fetch("/api/requests/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const info = await res.json();

  if (!res.ok) {
    throw new Error(info.message || info.error || "Checkout failed");
  }

  return info;
}