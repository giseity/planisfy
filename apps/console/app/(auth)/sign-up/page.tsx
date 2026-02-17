"use client";

import { signUp } from "@planisfy/auth/client";
import { Button } from "@planisfy/ui/components/button";
import { Input } from "@planisfy/ui/components/input";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const router = useRouter();

  const handleSignUp = async () => {
    await signUp.email({
      email,
      password,
      name,
      callbackURL: "/dashboard",
      fetchOptions: {
        onSuccess: () => {
          router.push("/dashboard");
        },
        onError: (ctx: any) => {
          alert(ctx.error.message);
        },
      },
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-2xl font-bold">Sign Up for Planisfy</h1>
      <Input
        type="text"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full max-w-sm"
      />
      <Input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full max-w-sm"
      />
      <Input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full max-w-sm"
      />
      <Button onClick={handleSignUp}>Sign Up</Button>
    </div>
  );
}
