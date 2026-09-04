'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { LoginSchema, type LoginInput } from '@lp/validators'
import { API_BASE, API_ROUTES } from '@lp/constants'
import { useToast } from '@/providers/ToastProvider'
import { Mail, Lock, ArrowRight, AlertTriangle } from 'lucide-react'
import styles from './LoginForm.module.css'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { error: showError } = useToast()
  const [showPassword, setShowPassword] = useState(false)
  const isExpired = searchParams.get('reason') === 'expired'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(LoginSchema) })

  const onSubmit = async (data: LoginInput) => {
    try {
      const res = await fetch(`${API_BASE}${API_ROUTES.AUTH.LOGIN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json() as { message?: string }
        showError(err.message ?? 'Login failed')
        return
      }
      const body = await res.json() as { data: { user: { role: string } } }
      const role = body.data?.user?.role
      const targetFrom = searchParams.get('from')
      const targetUrl = targetFrom && targetFrom.startsWith('/') && !targetFrom.startsWith('//')
        ? targetFrom
        : (role === 'super_admin' ? '/admin/dashboard' : '/broker/dashboard')
      router.push(targetUrl)
    } catch {
      showError('Network error. Please try again.')
    }
  }

  return (
    <div className={styles.wrapper}>
      {/* Card */}
      <div className={styles.card}>
        {isExpired && (
          <div className={styles.warningBanner}>
            <AlertTriangle size={18} />
            <span>Your session has expired. Please sign in again.</span>
          </div>
        )}

        <div className={styles.heading}>
          <h1 className={styles.title}>Sign in</h1>
          <p className={styles.subtitle}>Enter your credentials to access your account</p>
        </div>

        {/* Form */}
        <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
          {/* Email */}
          <div className={styles.field}>
            <label className={styles.label}>Email address</label>
            <div className={styles.inputWrap}>
              <span className={styles.inputIcon}><Mail size={15}/></span>
              <input
                type="email"
                autoComplete="email"
                autoFocus
                className={`${styles.input} ${errors.email ? styles.inputError : ''}`}
                placeholder="you@company.com"
                {...register('email')}
              />
            </div>
            {errors.email && <span className={styles.error}>{errors.email.message}</span>}
          </div>

          {/* Password */}
          <div className={styles.field}>
            <div className={styles.fieldTop}>
              <label className={styles.label}>Password</label>
              <Link href="/forgot-password" className={styles.forgotLink}>Forgot password?</Link>
            </div>
            <div className={styles.inputWrap}>
              <span className={styles.inputIcon}><Lock size={15}/></span>
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className={`${styles.input} ${errors.password ? styles.inputError : ''}`}
                placeholder="Enter your password"
                {...register('password')}
              />
              <button type="button" className={styles.toggleBtn} onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {errors.password && <span className={styles.error}>{errors.password.message}</span>}
          </div>

          {/* Submit */}
          <button type="submit" className={styles.btnPrimary} disabled={isSubmitting}>
            {isSubmitting ? <span className={styles.spinner}/> : null}
            <span>{isSubmitting ? 'Signing in…' : 'Sign in'}</span>
            {!isSubmitting && <ArrowRight size={15} strokeWidth={2.5}/>}
          </button>
        </form>

        {/* Footer */}
        <div className={styles.cardFooter}>
          <p className={styles.footerText}>
            Are you a broker?{' '}
            <Link href="/register" className={styles.footerLink}>Apply for access</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
