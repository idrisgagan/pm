"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import { getMe, logout, type User } from "@/lib/api";

type Session = { status: "loading" } | { status: "signed-out" } | { status: "signed-in"; user: User };

export default function Home() {
  const [session, setSession] = useState<Session>({ status: "loading" });

  useEffect(() => {
    getMe()
      .then((user) => setSession({ status: "signed-in", user }))
      .catch(() => setSession({ status: "signed-out" }));
  }, []);

  const handleSignOut = async () => {
    // Show the login form even if the request fails. A reload re-checks the session.
    await logout().catch(() => undefined);
    setSession({ status: "signed-out" });
  };

  if (session.status === "loading") {
    return null;
  }
  if (session.status === "signed-out") {
    return <LoginForm onSignedIn={(user) => setSession({ status: "signed-in", user })} />;
  }
  return <KanbanBoard onSignOut={handleSignOut} />;
}
