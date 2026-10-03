"use client";

export default function DeleteAccount({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Delete your account and all your alerts? This can't be undone.")) e.preventDefault();
      }}
    >
      <button className="btn btn-ghost btn-small">Delete my account</button>
    </form>
  );
}
