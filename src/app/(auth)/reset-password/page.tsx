import type { Metadata } from "next";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "New password — MyPaddie" };

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
