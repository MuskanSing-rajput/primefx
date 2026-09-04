'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { API_BASE } from '@lp/constants'
import { useToast } from '@/providers/ToastProvider'
import { Mail, Lock, Shield, CheckCircle, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react'
import styles from '../login/LoginForm.module.css'

function PulseLogo() {
  return (
    <>
      <img src="/logo_primefx.png" alt="PrimeFX Logo" className="logo-dark" style={{ height: 60, width: 'auto', objectFit: 'contain', display: 'block' }} />
      <img src="/logo_prime.png" alt="PrimeFX Logo" className="logo-light" style={{ height: 60, width: 'auto', objectFit: 'contain', display: 'block' }} />
    </>
  )
}

export default function ForgotPasswordPage() {
  const { error: showError, success: showSuccess } = useToast()

  // State variables
  const [step, setStep] = useState(0) // 0: Check Email, 1: Choose Method, 2: Reset Form, 3: Success
  const [emailInput, setEmailInput] = useState('')
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState<'2FA' | 'EMAIL'>('EMAIL')

  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState('')
  const [cooldown, setCooldown] = useState(0)

  // Timer for Email OTP resend cooldown
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown(c => c - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  // Password strength meter
  const getPasswordStrength = () => {
    let s = 0
    if (password.length >= 6) s++
    if (password.length >= 12) s++
    if (/[A-Z]/.test(password)) s++
    if (/[0-9]/.test(password)) s++
    return s
  }
  const strength = getPasswordStrength()
  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong']

  // Step 1: Check if email exists & fetch 2FA status
  const handleCheckAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!emailInput || !/^\S+@\S+\.\S+$/.test(emailInput)) {
      setLocalError('Please enter a valid email address.')
      return
    }

    setLoading(true)
    setLocalError('')
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput }),
      })

      const j = await res.json()
      if (!res.ok) {
        throw new Error(j.message || 'Verification check failed.')
      }

      setMfaEnabled(j.mfaEnabled)

      if (j.mfaEnabled) {
        // Go to Choose Method Step
        setSelectedMethod('2FA') // default select 2FA if enabled
        setStep(1)
      } else {
        // If MFA is not enabled, automatically send email OTP and go to verify step
        await triggerSendOtp(emailInput)
        setSelectedMethod('EMAIL')
        setStep(2)
      }
    } catch (err: any) {
      setLocalError(err.message || 'Failed to check account. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Trigger Send OTP helper
  const triggerSendOtp = async (targetEmail: string) => {
    const res = await fetch(`${API_BASE}/auth/forgot-password/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail }),
    })

    const j = await res.json()
    if (!res.ok) {
      throw new Error(j.message || 'Failed to send OTP code.')
    }

    showSuccess('Verification code sent to your email!')
    setCooldown(60)
  }

  // Resend OTP manually
  const handleResendOtp = async () => {
    if (cooldown > 0 || loading) return
    setLoading(true)
    setLocalError('')
    try {
      await triggerSendOtp(emailInput)
    } catch (err: any) {
      setLocalError(err.message || 'Failed to resend code.')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Proceed from Choose Method selection (MFA users only)
  const handleChooseMethod = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setLocalError('')
    try {
      if (selectedMethod === 'EMAIL') {
        await triggerSendOtp(emailInput)
      }
      setStep(2)
    } catch (err: any) {
      setLocalError(err.message || 'Failed to process selected option.')
    } finally {
      setLoading(false)
    }
  }

  // Step 3: Verify (OTP / 2FA) & Update Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length !== 6) {
      setLocalError('Please enter a valid 6-digit verification code.')
      return
    }

    if (!password || password.length < 12) {
      setLocalError('New password must be at least 12 characters.')
      return
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      setLocalError('Password must contain uppercase, lowercase, and a number.')
      return
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.')
      return
    }

    setLoading(true)
    setLocalError('')
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput,
          method: selectedMethod,
          code,
          password,
        }),
      })

      const j = await res.json()
      if (!res.ok) {
        throw new Error(j.message || 'Password reset failed.')
      }

      showSuccess('Password reset successfully!')
      setStep(3)
    } catch (err: any) {
      setLocalError(err.message || 'Reset failed. Please verify your code and try again.')
    } finally {
      setLoading(false)
    }
  }

  // ─── RENDERS ───

  // STEP 0: Email Input
  if (step === 0) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <Link href="/login" className={styles.brand}>
            <PulseLogo />
          </Link>
          <div className={styles.heading}>
            <h2 className={styles.title}>Forgot Password</h2>
            <p className={styles.subtitle}>Enter your email to verify your account</p>
          </div>

          {localError && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '12px 14px', borderRadius: '10px', color: '#f87171', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px' }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{localError}</span>
            </div>
          )}

          <form onSubmit={handleCheckAccount} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Email Address</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}><Mail size={15} /></span>
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={e => { setEmailInput(e.target.value); setLocalError('') }}
                  className={styles.input}
                  placeholder="you@company.com"
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className={styles.btnPrimary}>
              {loading ? <span className={styles.spinner} /> : null}
              <span>Continue</span>
              {!loading && <ArrowRight size={15} strokeWidth={2.5} />}
            </button>
          </form>

          <div className={styles.cardFooter}>
            <span className={styles.footerText}>
              Remember your password?{' '}
              <Link href="/login" className={styles.footerLink}>Sign In</Link>
            </span>
          </div>
        </div>
      </div>
    )
  }

  // STEP 1: Choose Verification Method (MFA users only)
  if (step === 1) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <Link href="/login" className={styles.brand}>
            <PulseLogo />
          </Link>
          <div className={styles.heading}>
            <h2 className={styles.title}>Security Verification</h2>
            <p className={styles.subtitle}>Select a verification method to reset your password</p>
          </div>

          {localError && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '12px 14px', borderRadius: '10px', color: '#f87171', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px' }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{localError}</span>
            </div>
          )}

          <form onSubmit={handleChooseMethod} className={styles.form}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '8px' }}>
              {/* Option 1: 2FA */}
              <div
                onClick={() => setSelectedMethod('2FA')}
                style={{
                  padding: '16px', borderRadius: '12px', background: selectedMethod === '2FA' ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
                  border: selectedMethod === '2FA' ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.06)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px', transition: 'all 150ms'
                }}
              >
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', color: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Shield size={18} />
                </div>
                <div style={{ textAlign: 'left', flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>Google Authenticator (2FA)</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Enter your 6-digit scanner code</div>
                </div>
                <input
                  type="radio"
                  name="method"
                  checked={selectedMethod === '2FA'}
                  onChange={() => setSelectedMethod('2FA')}
                  style={{ accentColor: '#6366f1' }}
                />
              </div>

              {/* Option 2: Email OTP */}
              <div
                onClick={() => setSelectedMethod('EMAIL')}
                style={{
                  padding: '16px', borderRadius: '12px', background: selectedMethod === 'EMAIL' ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
                  border: selectedMethod === 'EMAIL' ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.06)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px', transition: 'all 150ms'
                }}
              >
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', color: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Mail size={18} />
                </div>
                <div style={{ textAlign: 'left', flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>Email Verification Code</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Send a one-time OTP to your inbox</div>
                </div>
                <input
                  type="radio"
                  name="method"
                  checked={selectedMethod === 'EMAIL'}
                  onChange={() => setSelectedMethod('EMAIL')}
                  style={{ accentColor: '#6366f1' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
              <button type="button" className={styles.btnBack} style={{ flex: 1, height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={() => setStep(0)}>
                <ArrowLeft size={14} /> Back
              </button>
              <button type="submit" disabled={loading} className={styles.btnPrimary} style={{ flex: 2, height: '42px', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {loading && <span className={styles.spinner} />}
                <span>Continue</span>
                {!loading && <ArrowRight size={14} />}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // STEP 2: Code Verification & Password Reset Input
  if (step === 2) {
    const isEmailVerify = selectedMethod === 'EMAIL'

    return (
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <Link href="/login" className={styles.brand}>
            <PulseLogo />
          </Link>
          <div className={styles.heading}>
            <h2 className={styles.title}>Reset Password</h2>
            <p className={styles.subtitle}>
              {isEmailVerify
                ? `Enter the OTP sent to ${emailInput} and choose a new password`
                : 'Enter your 6-digit Authenticator code and choose a new password'}
            </p>
          </div>

          {localError && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '12px 14px', borderRadius: '10px', color: '#f87171', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px' }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{localError}</span>
            </div>
          )}

          <form onSubmit={handleResetPassword} className={styles.form}>
            {/* Verification Code */}
            <div className={styles.field}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className={styles.label}>{isEmailVerify ? 'Email OTP Code' : 'Authenticator (2FA) Code'}</label>
                {isEmailVerify && (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={cooldown > 0 || loading}
                    style={{ background: 'none', border: 'none', color: cooldown > 0 ? '#64748b' : '#818cf8', fontSize: '12px', fontWeight: 600, cursor: cooldown > 0 ? 'not-allowed' : 'pointer', textDecoration: 'underline', padding: 0 }}
                  >
                    {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend Code'}
                  </button>
                )}
              </div>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>{isEmailVerify ? <Mail size={15} /> : <Shield size={15} />}</span>
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={code}
                  onChange={e => { setCode(e.target.value.replace(/[^0-9]/g, '')); setLocalError('') }}
                  className={styles.input}
                  placeholder="000000"
                  style={{ textAlign: 'center', letterSpacing: '6px', fontFamily: 'monospace', fontWeight: 700 }}
                />
              </div>
            </div>

            {/* New Password */}
            <div className={styles.field}>
              <label className={styles.label}>New Password</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}><Lock size={15} /></span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => { setPassword(e.target.value); setLocalError('') }}
                  className={styles.input}
                  placeholder="Min 12 characters"
                />
                <button type="button" className={styles.toggleBtn} onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              {/* Password strength meter */}
              {password.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
                  {[1, 2, 3, 4].map(n => (
                    <div
                      key={n}
                      style={{
                        height: '4px',
                        flex: 1,
                        borderRadius: '2px',
                        background: strength >= n
                          ? (strength === 1 ? '#ef4444' : strength === 2 ? '#f59e0b' : strength === 3 ? '#3b82f6' : '#10b981')
                          : 'rgba(255, 255, 255, 0.08)',
                        transition: 'background 150ms'
                      }}
                    />
                  ))}
                  <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '6px', fontWeight: 600 }}>
                    {strengthLabels[strength]}
                  </span>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className={styles.field}>
              <label className={styles.label}>Confirm New Password</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}><Lock size={15} /></span>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setLocalError('') }}
                  className={styles.input}
                  placeholder="Confirm new password"
                />
                <button type="button" className={styles.toggleBtn} onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
              <button
                type="button"
                className={styles.btnBack}
                style={{ flex: 1, height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                onClick={() => {
                  setCode('')
                  setLocalError('')
                  if (mfaEnabled) {
                    setStep(1)
                  } else {
                    setStep(0)
                  }
                }}
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className={styles.btnPrimary}
                style={{ flex: 2, height: '42px', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {loading && <span className={styles.spinner} />}
                <span>Reset Password</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // STEP 3: Success Screen
  if (step === 3) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ color: '#10b981', display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <CheckCircle size={48} />
            </div>
            <h2 className={styles.title}>Password Reset Done</h2>
            <p className={styles.subtitle} style={{ marginTop: '12px', lineHeight: 1.5 }}>
              Your password has been changed successfully. You can now return to the sign in page and use your new credentials.
            </p>

            <div style={{ marginTop: '32px' }}>
              <Link href="/login" className={styles.btnPrimary} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', height: '42px', boxSizing: 'border-box' }}>
                <span>Return to Sign In</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
