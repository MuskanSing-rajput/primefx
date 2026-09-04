'use client'

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { RegisterBrokerSchema, type RegisterBrokerInput } from '@lp/validators'
import { API_BASE, API_ROUTES } from '@lp/constants'
import { useToast } from '@/providers/ToastProvider'
import {
  Building2, Globe, Hash, Award,
  User, Mail, Phone, Lock,
  Upload, CheckCircle, ArrowRight, ArrowLeft, Check
} from 'lucide-react'
import styles from './RegisterForm.module.css'

const COUNTRIES = [
  'Australia','Bahrain','Brazil','Canada','China','Cyprus','Egypt','France',
  'Germany','Hong Kong','India','Indonesia','Japan','Kenya','Kuwait','Malaysia',
  'Mexico','Nigeria','Oman','Philippines','Qatar','Saudi Arabia','Singapore',
  'South Africa','Switzerland','Thailand','United Arab Emirates','United Kingdom',
  'United States','Vietnam',
]

interface CountryDropdownProps {
  value: string
  onChange: (val: string) => void
  error?: boolean
}

function CountryDropdown({ value, onChange, error }: CountryDropdownProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const filtered = COUNTRIES.filter(c => c.toLowerCase().includes(search.toLowerCase()))

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus()
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch('') }}
        style={{
          width: '100%', height: 44, padding: '0 14px 0 42px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.04)', border: `1.5px solid ${error ? '#ef4444' : open ? 'rgba(99,102,241,0.8)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 10, cursor: 'pointer', color: value ? '#f8fafc' : 'rgba(248,250,252,0.4)',
          fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
          boxShadow: open ? '0 0 0 3px rgba(99,102,241,0.15)' : 'none',
          transition: 'border-color 200ms, box-shadow 200ms', textAlign: 'left',
        }}
      >
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(248,250,252,0.4)', display: 'flex' }}>
          <Globe size={15} />
        </span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value || 'Select Country...'}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms', color: 'rgba(248,250,252,0.4)', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 9999,
          background: 'rgba(15,23,42,0.98)', backdropFilter: 'blur(20px)',
          border: '1.5px solid rgba(99,102,241,0.3)', borderRadius: 12,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)', overflow: 'hidden',
        }}>
          {/* Search bar */}
          <div style={{ padding: '10px 10px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ position: 'relative' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(248,250,252,0.35)' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                ref={searchRef}
                type="text"
                placeholder="Search country..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px 8px 32px', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
                  color: '#f8fafc', fontSize: 12, fontFamily: 'inherit', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Options list */}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: 'rgba(248,250,252,0.4)' }}>No results found</div>
            ) : filtered.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setOpen(false); setSearch('') }}
                style={{
                  width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center',
                  gap: 10, background: value === c ? 'rgba(99,102,241,0.15)' : 'transparent',
                  border: 'none', cursor: 'pointer', color: value === c ? '#a5b4fc' : '#f8fafc',
                  fontSize: 13, fontFamily: 'inherit', textAlign: 'left',
                  transition: 'background 120ms',
                }}
                onMouseEnter={e => { if (value !== c) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => { if (value !== c) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <span style={{ width: 18, height: 18, borderRadius: 4, background: 'rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#a5b4fc', flexShrink: 0 }}>
                  {c.substring(0, 2).toUpperCase()}
                </span>
                {c}
                {value === c && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth={3} style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const STEPS = [
  { label: 'Company', description: 'Company Profile' },
  { label: 'Contact', description: 'Business Contact' },
  { label: 'Docs', description: 'Documents & Agreement' },
]


export default function RegisterPage() {
  const { error: showError, success: showSuccess } = useToast()
  const [step, setStep] = useState(0) // 0-indexed
  const [done, setDone] = useState(false)
  const [incorporationFile, setIncorporationFile] = useState<File | null>(null)
  const [directorIdFile, setDirectorIdFile] = useState<File | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [agreementModal, setAgreementModal] = useState(false)

  const [verifiedEmail, setVerifiedEmail] = useState('')
  const [otpModalOpen, setOtpModalOpen] = useState(false)
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpError, setOtpError] = useState('')
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown(c => c - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  const handleResendOtp = async () => {
    if (cooldown > 0) return
    setOtpLoading(true)
    setOtpError('')
    try {
      const email = watch('email')
      const res = await fetch(`${API_BASE}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const j = await res.json()
      if (!res.ok) {
        throw new Error(j.message || 'Failed to send verification code')
      }
      showSuccess('Verification code sent successfully!')
      setCooldown(60)
    } catch (e: any) {
      setOtpError(e.message || 'Error sending code. Please try again.')
    } finally {
      setOtpLoading(false)
    }
  }

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) return
    setOtpLoading(true)
    setOtpError('')
    try {
      const email = watch('email')
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: otpCode }),
      })
      const j = await res.json()
      if (!res.ok) {
        throw new Error(j.message || 'Invalid or expired code')
      }
      setVerifiedEmail(email)
      setOtpModalOpen(false)
      setOtpCode('')
      setStep(s => s + 1)
      showSuccess('Email verified successfully!')
    } catch (e: any) {
      setOtpError(e.message || 'Verification failed. Please check the code.')
    } finally {
      setOtpLoading(false)
    }
  }

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterBrokerInput>({
    resolver: zodResolver(RegisterBrokerSchema),
  })

  const password = watch('password') || ''

  const getStrength = () => {
    let s = 0
    if (password.length >= 6) s++
    if (password.length >= 12) s++
    if (/[A-Z]/.test(password)) s++
    if (/[0-9!@#$%^&*]/.test(password)) s++
    return s
  }

  const strength = getStrength()
  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  const strengthClasses = ['', styles.strengthBar1, styles.strengthBar2, styles.strengthBar3, styles.strengthBar4]

  const STEP_FIELDS: (keyof RegisterBrokerInput)[][] = [
    ['companyName', 'country', 'entityType', 'businessTaxId'],
    ['contactName', 'email', 'phone', 'password'],
    ['agreementAccepted'],
  ]

  const goNext = async () => {
    const valid = await trigger(STEP_FIELDS[step])
    if (!valid) return

    // Email OTP Verification Check
    if (step === 1) {
      const email = watch('email') || ''
      if (email.toLowerCase() !== verifiedEmail.toLowerCase()) {
        setOtpLoading(true)
        setOtpError('')
        try {
          const res = await fetch(`${API_BASE}/auth/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          })
          const j = await res.json()
          if (!res.ok) {
            throw new Error(j.message || 'Failed to send verification code')
          }
          setCooldown(60)
          setOtpModalOpen(true)
        } catch (e: any) {
          showError(e.message || 'Failed to send verification code. Please check your email details.')
        } finally {
          setOtpLoading(false)
        }
        return
      }
    }

    if (step < 2) { setStep(s => s + 1); return }
    // Step 3: submit
    if (!incorporationFile) { showError('Certificate of Incorporation is required'); return }
    if (!directorIdFile) { showError("Director's ID / Passport is required"); return }
    await handleSubmit(onSubmit)()
  }

  const onSubmit = async (data: RegisterBrokerInput) => {
    setUploading(true)
    try {
      const kycDocs = []

      const upload = async (file: File, name: string) => {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch(`${API_BASE}/auth/upload`, { method: 'POST', body: fd })
        if (!res.ok) throw new Error(`Failed to upload ${name}`)
        const j = await res.json()
        return { name, key: j.data?.key || j.key, mimeType: j.data?.mimeType || j.mimeType, uploadedAt: j.data?.uploadedAt || j.uploadedAt }
      }

      kycDocs.push(await upload(incorporationFile!, 'Certificate of Incorporation'))
      kycDocs.push(await upload(directorIdFile!, "Director's ID / Passport"))

      const res = await fetch(`${API_BASE}${API_ROUTES.AUTH.REGISTER}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, kycDocuments: kycDocs }),
      })

      if (!res.ok) {
        const err = await res.json() as { message?: string }
        showError(err.message ?? 'Registration failed')
        return
      }

      showSuccess('Application submitted successfully!')
      setDone(true)
    } catch (e: any) {
      showError(e.message ?? 'Network error. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  if (done) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <div className={styles.successCard}>
            <div className={styles.successIcon}>
              <CheckCircle size={26}/>
            </div>
            <h2 className={styles.successTitle}>Application Submitted</h2>
            <p className={styles.successBody}>
              Your broker registration is under review by our compliance team. You will receive an email once your account is approved.
            </p>
            <Link href="/login" className={styles.footerLink}>Return to Sign In</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>

        {/* Page heading */}
        <div className={styles.pageTitle}>
          <h1 className={styles.pageTitleText}>Broker Registration</h1>
          <p className={styles.pageTitleSub}>Complete the compliance form to apply for broker access</p>
        </div>
        {/* Step progress */}
        <div className={styles.stepProgress}>
          {STEPS.map((s, i) => (
            <React.Fragment key={i}>
              <div className={`${styles.stepDot} ${i === step ? styles.stepDotActive : i < step ? styles.stepDotDone : ''}`}>
                {i < step ? <Check size={14} strokeWidth={3}/> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`${styles.stepLine} ${i < step ? styles.stepLineDone : ''}`}/>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step label */}
        <div className={styles.stepLabel}>
          Step {step + 1} of {STEPS.length} — {STEPS[step]?.description}
        </div>

        {/* ─── STEP 1: Company Profile ─── */}
        {step === 0 && (
          <div className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Company Name *</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}><Building2 size={15}/></span>
                <input
                  {...register('companyName')}
                  className={`${styles.input} ${errors.companyName ? styles.inputError : ''}`}
                  placeholder="e.g. Acme Capital Ltd"
                />
              </div>
              {errors.companyName && <span className={styles.error}>{errors.companyName.message}</span>}
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label}>Country *</label>
                <CountryDropdown
                  value={watch('country') || ''}
                  onChange={(val) => { setValue('country', val, { shouldValidate: true }) }}
                  error={!!errors.country}
                />
                {errors.country && <span className={styles.error}>{errors.country.message}</span>}
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Entity Type *</label>
                <select
                  {...register('entityType')}
                  className={`${styles.input} ${styles.inputNoIcon} ${errors.entityType ? styles.inputError : ''}`}
                >
                  <option value="">Select...</option>
                  <option value="Corporation">Corporation</option>
                  <option value="LLC">LLC</option>
                  <option value="Partnership">Partnership</option>
                  <option value="Sole Proprietorship">Sole Proprietorship</option>
                </select>
                {errors.entityType && <span className={styles.error}>{errors.entityType.message}</span>}
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label}>Business / Tax ID *</label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon}><Hash size={15}/></span>
                  <input
                    {...register('businessTaxId')}
                    className={`${styles.input} ${errors.businessTaxId ? styles.inputError : ''}`}
                    placeholder="e.g. TAX-12345678"
                  />
                </div>
                {errors.businessTaxId && <span className={styles.error}>{errors.businessTaxId.message}</span>}
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Regulatory License</label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon}><Award size={15}/></span>
                  <input
                    {...register('regulatoryLicense')}
                    className={`${styles.input} ${errors.regulatoryLicense ? styles.inputError : ''}`}
                    placeholder="e.g. FCA 123456 (Optional)"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP 2: Contact Details ─── */}
        {step === 1 && (
          <div className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Contact Name *</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}><User size={15}/></span>
                <input
                  {...register('contactName')}
                  className={`${styles.input} ${errors.contactName ? styles.inputError : ''}`}
                  placeholder="e.g. John Smith"
                />
              </div>
              {errors.contactName && <span className={styles.error}>{errors.contactName.message}</span>}
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Email Address *</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}><Mail size={15}/></span>
                <input
                  type="email"
                  {...register('email')}
                  className={`${styles.input} ${errors.email ? styles.inputError : ''}`}
                  placeholder="e.g. john@acmecapital.com"
                />
              </div>
              {errors.email && <span className={styles.error}>{errors.email.message}</span>}
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label}>Phone Number *</label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon}><Phone size={15}/></span>
                  <input
                    {...register('phone')}
                    className={`${styles.input} ${errors.phone ? styles.inputError : ''}`}
                    placeholder="e.g. +442079460958"
                    onInput={(e) => {
                      e.currentTarget.value = e.currentTarget.value.replace(/[^0-9+]/g, '')
                    }}
                  />
                </div>
                {errors.phone && <span className={styles.error}>{errors.phone.message}</span>}
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Password *</label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon}><Lock size={15}/></span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    {...register('password')}
                    className={`${styles.input} ${errors.password ? styles.inputError : ''}`}
                    placeholder="Min 12 characters"
                  />
                  <button type="button" className={styles.toggleBtn} onClick={() => setShowPassword(p => !p)}>
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {errors.password && <span className={styles.error}>{errors.password.message}</span>}

                {/* Password strength meter */}
                {password.length > 0 && (
                  <div className={styles.strength}>
                    {[1,2,3,4].map(n => (
                      <div key={n} className={`${styles.strengthBar} ${strength >= n ? strengthClasses[strength] : ''}`}/>
                    ))}
                    <span className={styles.strengthLabel}>{strengthLabels[strength]}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP 3: Documents & Agreement ─── */}
        {step === 2 && (
          <div className={styles.form}>
            {/* File upload boxes */}
            <div className={styles.row}>
              <div className={styles.fileField}>
                <label className={styles.label}>Certificate of Incorporation *</label>
                <div className={`${styles.fileBox} ${incorporationFile ? styles.fileBoxDone : ''}`}>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    className={styles.fileInput}
                    onChange={e => setIncorporationFile(e.target.files?.[0] ?? null)}
                  />
                  {incorporationFile ? (
                    <div className={styles.fileBoxDoneText}>
                      <CheckCircle size={14}/> {incorporationFile.name.length > 18 ? incorporationFile.name.slice(0,18) + '…' : incorporationFile.name}
                    </div>
                  ) : (
                    <div className={styles.fileBoxText}>
                      <Upload size={18} style={{ color: '#475569' }}/>
                      <span>Upload PDF, PNG or JPG</span>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.fileField}>
                <label className={styles.label}>Director&apos;s ID / Passport *</label>
                <div className={`${styles.fileBox} ${directorIdFile ? styles.fileBoxDone : ''}`}>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    className={styles.fileInput}
                    onChange={e => setDirectorIdFile(e.target.files?.[0] ?? null)}
                  />
                  {directorIdFile ? (
                    <div className={styles.fileBoxDoneText}>
                      <CheckCircle size={14}/> {directorIdFile.name.length > 18 ? directorIdFile.name.slice(0,18) + '…' : directorIdFile.name}
                    </div>
                  ) : (
                    <div className={styles.fileBoxText}>
                      <Upload size={18} style={{ color: '#475569' }}/>
                      <span>Upload PDF, PNG or JPG</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Agreement */}
            <div className={styles.checkRow}>
              <input
                type="checkbox"
                id="agreement"
                {...register('agreementAccepted')}
              />
              <label htmlFor="agreement" className={styles.checkLabel}>
                I have read and accept the{' '}
                <button type="button" className={styles.checkLabelLink} onClick={() => setAgreementModal(true)}>
                  LP Partnership Agreement
                </button>
                {' '}and confirm all information provided is accurate.
              </label>
            </div>
            {errors.agreementAccepted && <span className={styles.error}>{errors.agreementAccepted.message}</span>}
          </div>
        )}

        {/* Nav buttons */}
        <div className={styles.navRow}>
          {step > 0 ? (
            <button type="button" className={styles.btnBack} onClick={() => setStep(s => s - 1)}>
              <ArrowLeft size={14}/> Back
            </button>
          ) : <div/>}

          <button
            type="button"
            className={styles.btnNext}
            onClick={goNext}
            disabled={isSubmitting || uploading}
          >
            {(isSubmitting || uploading) && <span className={styles.spinner}/>}
            <span>{step < 2 ? 'Continue' : (uploading ? 'Submitting…' : 'Submit Application')}</span>
            {!isSubmitting && !uploading && <ArrowRight size={14} strokeWidth={2.5}/>}
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className={styles.cardFooter}>
        <p className={styles.footerText}>
          Already have an account?{' '}
          <Link href="/login" className={styles.footerLink}>Sign in</Link>
        </p>
      </div>

      {/* Partnership Agreement Modal */}
      {agreementModal && (
        <div
          onClick={() => setAgreementModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#0f131e', border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '16px', padding: '32px', maxWidth: '540px', width: '100%',
              maxHeight: '75vh', overflowY: 'auto',
              boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
            }}
          >
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", color: '#f1f5f9', fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
              PrimeFX Partnership Agreement
            </h2>
            <div style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p><strong style={{color:'#94a3b8'}}>1. Introduction</strong><br/>This agreement governs the provision of liquidity, trade execution, and risk management services to the Broker client by PrimeFX.</p>
              <p><strong style={{color:'#94a3b8'}}>2. Wallet & Credits</strong><br/>The Broker must maintain an active wallet with PrimeFX. Trading credits are allocated based on deposits and are subject to utilization terms.</p>
              <p><strong style={{color:'#94a3b8'}}>3. Execution Policy</strong><br/>All trades are routed to the assigned execution account. Slippage, deviations, and rejections are governed by system rules.</p>
              <p><strong style={{color:'#94a3b8'}}>4. Confidentiality</strong><br/>The Broker agrees to keep all API keys, execution backend configurations, and technical specifications confidential and must not disclose them to third parties.</p>
              <p><strong style={{color:'#94a3b8'}}>5. Compliance</strong><br/>The Broker must comply with all applicable financial regulations in their jurisdiction and maintain necessary regulatory licenses.</p>
            </div>
            <button
              type="button"
              onClick={() => setAgreementModal(false)}
              style={{
                marginTop: '24px', width: '100%', height: '42px',
                background: 'linear-gradient(105deg, #2dd4bf, #e879f9)',
                border: 'none', borderRadius: '10px',
                fontSize: '14px', fontWeight: 600, color: '#080b12',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* OTP Verification Modal */}
      {otpModalOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            style={{
              background: '#0f131e', border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: '16px', padding: '32px', maxWidth: '440px', width: '100%',
              boxShadow: '0 32px 80px rgba(0,0,0,0.85), 0 0 30px rgba(99,102,241,0.05)',
              textAlign: 'center',
            }}
          >
            <div style={{
              width: '56px', height: '56px', borderRadius: '12px',
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', color: '#818cf8'
            }}>
              <Mail size={24} />
            </div>

            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", color: '#ffffff', fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>
              Verify your Email
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5, marginBottom: '24px' }}>
              We sent a 6-digit verification code to<br/>
              <strong style={{ color: '#c7d2fe' }}>{watch('email')}</strong>
            </p>

            <div style={{ marginBottom: '20px' }}>
              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={e => {
                  setOtpCode(e.target.value.replace(/[^0-9]/g, ''))
                  setOtpError('')
                }}
                placeholder="000000"
                style={{
                  width: '100%', height: '50px', background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px',
                  fontSize: '24px', fontWeight: 700, color: '#ffffff', textAlign: 'center',
                  letterSpacing: '10px', textIndent: '10px', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {otpError && (
                <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '8px', textAlign: 'center' }}>
                  {otpError}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={cooldown > 0 || otpLoading}
                style={{
                  flex: 1, height: '42px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px',
                  fontSize: '13px', fontWeight: 600, color: cooldown > 0 ? '#64748b' : '#f8fafc',
                  cursor: cooldown > 0 ? 'not-allowed' : 'pointer',
                  transition: 'background 120ms',
                }}
              >
                {cooldown > 0 ? `Resend (${cooldown}s)` : 'Resend'}
              </button>

              <button
                type="button"
                onClick={handleVerifyOtp}
                disabled={otpCode.length !== 6 || otpLoading}
                style={{
                  flex: 1, height: '42px',
                  background: 'linear-gradient(105deg, #6366f1, #4f46e5)',
                  border: 'none', borderRadius: '10px',
                  fontSize: '13px', fontWeight: 600, color: '#ffffff',
                  cursor: (otpCode.length !== 6 || otpLoading) ? 'not-allowed' : 'pointer',
                  opacity: (otpCode.length !== 6 || otpLoading) ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}
              >
                {otpLoading && <span className={styles.spinner} style={{ width: 14, height: 14, borderWidth: 2 }}/>}
                <span>Verify Code</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setOtpModalOpen(false)
                setOtpError('')
                setOtpCode('')
              }}
              style={{
                background: 'none', border: 'none', color: '#64748b',
                fontSize: '12px', marginTop: '16px', cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Cancel and edit details
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
