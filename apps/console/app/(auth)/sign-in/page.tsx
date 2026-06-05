"use client";

import { signIn } from "@planisfy/auth/client";
import { Button } from "@planisfy/ui/components/button";
import { Input } from "@planisfy/ui/components/input";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  const handleSignIn = async () => {
    await signIn.email({
      email,
      password,
      callbackURL: "/studio",
      fetchOptions: {
        onSuccess: () => {
          router.push("/studio");
        },
        onError: (ctx: { error: { message: string } }) => {
          toast.error(ctx.error.message);
        },
      },
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
      <h1 className="text-2xl font-bold">Sign In to Planisfy</h1>
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
      <Button onClick={handleSignIn} className="w-full max-w-sm">
        Sign In
      </Button>
      <Link
        href="/reset-password"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Forgot password?
      </Link>
      <p className="text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/sign-up" className="underline hover:text-foreground">
          Sign up
        </Link>
      </p>
    </div>
  );
}
