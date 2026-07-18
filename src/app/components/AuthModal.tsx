"use client";

import { useState } from "react";
import { supabase } from "@/app/lib/supabaseClient";
import { useData } from "@/app/lib/DataContext";
import { X, Loader2 } from "lucide-react";
import TermsPrivacyModal from "./TermsPrivacyModal";
import { motion, AnimatePresence } from "framer-motion";

type AuthMode = "login" | "signup";

type Props = {
  onClose: () => void;
};

const emptyForm = {
  firstName: "",
  lastName: "",
  contactNumber: "",
  email: "",
  password: "",
  confirmPassword: "",
  role: "resident",
  passcode: "",
  roleDescription: "",
  agreedToTerms: false,
};

const MODAL_BACKDROP_CLASS = "fixed inset-0 bg-white/10 backdrop-blur-sm";

export default function AuthModal({ onClose }: Props) {
  const { refetch: refetchData } = useData();
  const [mode, setMode] = useState<AuthMode>("login");
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showTermsPrivacy, setShowTermsPrivacy] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = e.target;
    const value = target.type === "checkbox" ? (target as HTMLInputElement).checked : target.value;
    setForm({ ...form, [target.name]: value });
    if (error) setError("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) {
      e.preventDefault();
      if (mode === "login") handleLogin();
      else if (step === 1) handleNextStep();
      else handleSignup();
    }
  };

  const handleModeSwitch = () => {
    setMode(mode === "login" ? "signup" : "login");
    setForm(emptyForm);
    setError("");
    setStep(1);
  };

  const validateContactNumber = (num: string): boolean => {
    const phoneRegex = /^09\d{9}$/;
    return phoneRegex.test(num);
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) return "Password must be at least 8 characters long.";
    if (!/[A-Z]/.test(pwd)) return "Password must contain at least one uppercase letter.";
    if (!/[a-z]/.test(pwd)) return "Password must contain at least one lowercase letter.";
    if (!/[0-9]/.test(pwd)) return "Password must contain at least one number.";
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd))
      return "Password must contain at least one special character (e.g., !@#$%^&*).";
    return null;
  };

  const validateStep1 = (): boolean => {
    if (!form.firstName.trim()) {
      setError("First name is required.");
      return false;
    }
    if (!form.lastName.trim()) {
      setError("Last name is required.");
      return false;
    }
    if (!validateContactNumber(form.contactNumber)) {
      setError("Contact number must start with 09 and be exactly 11 digits (e.g., 09123456789).");
      return false;
    }
    if (!form.email.trim()) {
      setError("Email address is required.");
      return false;
    }
    if (!validateEmail(form.email)) {
      setError("Please enter a valid email address (e.g., name@example.com).");
      return false;
    }
    const pwdError = validatePassword(form.password);
    if (pwdError) {
      setError(pwdError);
      return false;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return false;
    }
    return true;
  };

  const handleNextStep = () => {
    setError("");
    setTimeout(() => {
      if (validateStep1()) {
        setError("");
        setStep(2);
      }
    }, 10);
  };

  const handleBackStep = () => {
    setStep(1);
    setError("");
  };

  const handleSignup = async () => {
    setError("");
    setLoading(true);

    try {
      if (!form.agreedToTerms) {
        setError("You must agree to the Terms and Conditions and Privacy Policy.");
        setLoading(false);
        return;
      }

      const officialPasscode = process.env.NEXT_PUBLIC_OFFICIAL_PASSCODE || "";
      const responderPasscode = process.env.NEXT_PUBLIC_RESPONDER_PASSCODE || "";
      const residentPasscode = process.env.NEXT_PUBLIC_RESIDENT_PASSCODE || "";

      if (form.role === "official" && form.passcode !== officialPasscode) {
        setError("Invalid barangay official passcode.");
        setLoading(false);
        return;
      }
      if (form.role === "responder" && form.passcode !== responderPasscode) {
        setError("Invalid responder passcode.");
        setLoading(false);
        return;
      }
      if (form.role === "resident" && form.passcode !== residentPasscode) {
        setError("Invalid resident passcode.");
        setLoading(false);
        return;
      }

      if ((form.role === "official" || form.role === "responder") && !form.roleDescription.trim()) {
        setError("Please enter a role description (e.g., Kagawad, Fire Men).");
        setLoading(false);
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            first_name: form.firstName,
            last_name: form.lastName,
            contact_number: form.contactNumber,
            role: form.role,
          },
        },
      });

      if (authError) throw authError;

      const userId = authData.user?.id;
      if (!userId) throw new Error("No user ID after signup.");

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: userId,
          first_name: form.firstName,
          last_name: form.lastName,
          contact_number: form.contactNumber,
          email: form.email,
          role: form.role,
          role_description: (form.role === "official" || form.role === "responder") ? form.roleDescription.trim() : null,
        });

      if (profileError) throw profileError;

      alert("Account created successfully! Please log in.");
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setError("");
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });
      if (error) throw error;

      refetchData();
      onClose();
    } catch (err: any) {
      setError(err.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  const panelVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  };

  return (
    <>
      <AnimatePresence>
        {!showTermsPrivacy && (
          <motion.div
            className={`${MODAL_BACKDROP_CLASS} z-[9999] flex items-center justify-center p-4`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          >
            <motion.div
              className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={handleKeyDown}
            >
              <button
                onClick={onClose}
                className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>

              <div>
                <div className="mb-6 text-center">
                  <h2 className="text-2xl font-semibold tracking-tight text-blue-900">
                    {mode === "login" ? "Welcome Back!" : "Create an Account"}
                  </h2>
                  <p className="mt-1.5 text-sm text-blue-900/80">
                    {mode === "login"
                      ? "Enter your credentials to continue."
                      : step === 1
                      ? "First, tell us about yourself."
                      : "Almost done! Choose your role and enter passcode."}
                  </p>
                </div>

                <AnimatePresence mode="wait">
                  {mode === "login" ? (
                    <motion.div
                      key="login"
                      variants={panelVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      transition={{ duration: 0.2 }}
                      className="space-y-4"
                    >
                      <input
                        name="email"
                        type="email"
                        placeholder="Email Address"
                        value={form.email}
                        onChange={handleChange}
                        className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-blue-400 focus:outline-none"
                        disabled={loading}
                      />

                      <input
                        name="password"
                        type="password"
                        placeholder="Password"
                        value={form.password}
                        onChange={handleChange}
                        className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-blue-400 focus:outline-none"
                        disabled={loading}
                        autoComplete="current-password"
                      />

                      {error && (
                        <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
                          {error}
                        </div>
                      )}

                      <div className="mt-6 space-y-3">
                        <button
                          onClick={handleLogin}
                          disabled={loading}
                          className="w-full rounded-lg bg-blue-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-50"
                        >
                          {loading ? (
                            <div className="flex items-center justify-center">
                              <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                          ) : (
                            "Sign In"
                          )}
                        </button>

                        <button
                          onClick={handleModeSwitch}
                          disabled={loading}
                          className="w-full py-1 text-sm text-blue-900/80 transition-colors hover:text-blue-900"
                        >
                          Don&apos;t have an account? Sign Up
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="signup"
                      variants={panelVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      transition={{ duration: 0.2 }}
                    >
                      <AnimatePresence mode="wait">
                        {step === 1 ? (
                          <motion.div
                            key="step1"
                            variants={panelVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            transition={{ duration: 0.2 }}
                            className="space-y-4"
                          >
                            <div className="grid grid-cols-2 gap-3">
                              <input
                                name="firstName"
                                type="text"
                                placeholder="First Name"
                                value={form.firstName}
                                onChange={handleChange}
                                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-blue-400 focus:outline-none"
                                disabled={loading}
                              />
                              <input
                                name="lastName"
                                type="text"
                                placeholder="Last Name"
                                value={form.lastName}
                                onChange={handleChange}
                                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-blue-400 focus:outline-none"
                                disabled={loading}
                              />
                            </div>

                            <input
                              name="contactNumber"
                              type="tel"
                              placeholder="Contact Number"
                              value={form.contactNumber}
                              onChange={handleChange}
                              className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-blue-400 focus:outline-none"
                              disabled={loading}
                            />

                            <input
                              name="email"
                              type="email"
                              placeholder="Email Address"
                              value={form.email}
                              onChange={handleChange}
                              className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-blue-400 focus:outline-none"
                              disabled={loading}
                            />

                            <div>
                              <p className="text-xs text-gray-500">
                                Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character.
                              </p>
                              <input
                                name="password"
                                type="password"
                                placeholder="Password"
                                value={form.password}
                                onChange={handleChange}
                                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-blue-400 focus:outline-none"
                                disabled={loading}
                                autoComplete="new-password"
                              />
                            </div>

                            <input
                              name="confirmPassword"
                              type="password"
                              placeholder="Confirm Password"
                              value={form.confirmPassword}
                              onChange={handleChange}
                              className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-blue-400 focus:outline-none"
                              disabled={loading}
                              autoComplete="new-password"
                            />

                            {error && (
                              <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
                                {error}
                              </div>
                            )}

                            <div className="flex justify-end">
                              <button
                                onClick={handleNextStep}
                                className="bg-blue-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-800"
                                disabled={loading}
                              >
                                Next
                              </button>
                            </div>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="step2"
                            variants={panelVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            transition={{ duration: 0.2 }}
                            className="space-y-4"
                          >
                            <select
                              name="role"
                              value={form.role}
                              onChange={handleChange}
                              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-blue-400 focus:outline-none"
                              disabled={loading}
                            >
                              <option value="resident">Resident</option>
                              <option value="official">Barangay Official</option>
                              <option value="responder">Responder</option>
                            </select>

                            {(form.role === "official" || form.role === "responder") && (
                              <input
                                name="roleDescription"
                                type="text"
                                placeholder={form.role === "official" ? "e.g., Kagawad, Tanod" : "e.g., Fire Men, Rescue"}
                                value={form.roleDescription}
                                onChange={handleChange}
                                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-blue-400 focus:outline-none"
                                disabled={loading}
                              />
                            )}

                            <input
                              name="passcode"
                              type="text"
                              placeholder={
                                form.role === "official"
                                  ? "Official Passcode"
                                  : form.role === "responder"
                                  ? "Responder Passcode"
                                  : "Resident Passcode"
                              }
                              value={form.passcode}
                              onChange={handleChange}
                              className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-blue-400 focus:outline-none"
                              disabled={loading}
                            />

                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                name="agreedToTerms"
                                checked={form.agreedToTerms}
                                onChange={handleChange}
                                className="h-4 w-4 rounded border-gray-300 text-blue-900 focus:ring-blue-500"
                                disabled={loading}
                              />
                              <label className="text-xs text-gray-600">
                                I agree to the{" "}
                                <button
                                  type="button"
                                  onClick={() => setShowTermsPrivacy(true)}
                                  className="text-blue-900 underline hover:text-blue-700"
                                >
                                  Terms and Conditions and Privacy Policy
                                </button>
                              </label>
                            </div>

                            {error && (
                              <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
                                {error}
                              </div>
                            )}

                            <div className="flex gap-3 justify-between mt-4">
                              <button
                                onClick={handleBackStep}
                                className="text-blue-900/80 hover:text-blue-900 text-sm"
                                disabled={loading}
                              >
                                Back
                              </button>
                              <button
                                onClick={handleSignup}
                                disabled={loading}
                                className="bg-blue-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-800 disabled:opacity-50"
                              >
                                {loading ? (
                                  <div className="flex items-center justify-center">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  </div>
                                ) : (
                                  "Create Account"
                                )}
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="mt-3">
                        <button
                          onClick={handleModeSwitch}
                          disabled={loading}
                          className="w-full py-1 text-sm text-blue-900/80 transition-colors hover:text-blue-900"
                        >
                          Already have an account? Sign In
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTermsPrivacy && (
          <motion.div
            className="fixed inset-0 z-[10000] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <TermsPrivacyModal
              isOpen={showTermsPrivacy}
              onClose={() => {
                setShowTermsPrivacy(false);
                setError("");
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}