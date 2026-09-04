'use client'

import React, { useState, Children, useRef, useLayoutEffect, HTMLAttributes, ReactNode } from 'react'
import { motion, AnimatePresence, Variants } from 'framer-motion'
import { Check } from 'lucide-react'
import styles from './AnimatedStepper.module.css'

interface StepperProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  initialStep?: number
  activeStep?: number
  onChangeStep?: (step: number) => void
  onStepChange?: (step: number) => void
  onFinalStepCompleted?: () => void
  stepCircleContainerClassName?: string
  stepContainerClassName?: string
  contentClassName?: string
  footerClassName?: string
  backButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>
  nextButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>
  backButtonText?: string
  nextButtonText?: string
  disableStepIndicators?: boolean
  renderStepIndicator?: (props: {
    step: number
    currentStep: number
    onStepClick: (clicked: number) => void
  }) => ReactNode
}

export function AnimatedStepper({
  children,
  initialStep = 1,
  activeStep,
  onChangeStep,
  onStepChange = () => {},
  onFinalStepCompleted = () => {},
  stepCircleContainerClassName = '',
  stepContainerClassName = '',
  contentClassName = '',
  footerClassName = '',
  backButtonProps = {},
  nextButtonProps = {},
  backButtonText = 'Back',
  nextButtonText = 'Continue',
  disableStepIndicators = false,
  renderStepIndicator,
  ...rest
}: StepperProps) {
  const [internalStep, setInternalStep] = useState<number>(initialStep)
  const currentStep = activeStep !== undefined ? activeStep : internalStep
  const [direction, setDirection] = useState<number>(0)
  const stepsArray = Children.toArray(children)
  const totalSteps = stepsArray.length
  const isCompleted = currentStep > totalSteps
  const isLastStep = currentStep === totalSteps

  const updateStep = (newStep: number) => {
    if (onChangeStep) {
      onChangeStep(newStep)
    } else {
      setInternalStep(newStep)
      if (newStep > totalSteps) {
        onFinalStepCompleted()
      } else {
        onStepChange(newStep)
      }
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setDirection(-1)
      updateStep(currentStep - 1)
    }
  }

  const handleNext = () => {
    if (!isLastStep) {
      setDirection(1)
      updateStep(currentStep + 1)
    }
  }

  const handleComplete = () => {
    setDirection(1)
    updateStep(totalSteps + 1)
  }

  return (
    <div
      className={`${styles.stepperWrapper} ${rest.className || ''}`}
      {...rest}
    >
      <div className={`${styles.card} ${stepCircleContainerClassName}`}>
        {/* Indicators */}
        <div className={`${styles.indicatorsContainer} ${stepContainerClassName}`}>
          {stepsArray.map((_, index) => {
            const stepNumber = index + 1
            const isNotLastStep = index < totalSteps - 1
            return (
              <React.Fragment key={stepNumber}>
                {renderStepIndicator ? (
                  renderStepIndicator({
                    step: stepNumber,
                    currentStep,
                    onStepClick: (clicked) => {
                      setDirection(clicked > currentStep ? 1 : -1)
                      updateStep(clicked)
                    },
                  })
                ) : (
                  <StepIndicator
                    step={stepNumber}
                    disableStepIndicators={disableStepIndicators}
                    currentStep={currentStep}
                    onClickStep={(clicked) => {
                      setDirection(clicked > currentStep ? 1 : -1)
                      updateStep(clicked)
                    }}
                  />
                )}
                {isNotLastStep && <StepConnector isComplete={currentStep > stepNumber} />}
              </React.Fragment>
            )
          })}
        </div>

        {/* Content Area */}
        <StepContentWrapper
          isCompleted={isCompleted}
          currentStep={currentStep}
          direction={direction}
          className={`${styles.contentArea} ${contentClassName}`}
        >
          {stepsArray[currentStep - 1]}
        </StepContentWrapper>

        {/* Footer Actions */}
        {!isCompleted && (
          <div className={`${styles.footer} ${footerClassName}`}>
            <div
              className={`${styles.footerFlex} ${
                currentStep !== 1 ? styles.justifyBetween : styles.justifyEnd
              }`}
            >
              {currentStep !== 1 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className={styles.backBtn}
                  {...backButtonProps}
                >
                  {backButtonText}
                </button>
              )}
              <button
                type="button"
                onClick={isLastStep ? handleComplete : handleNext}
                className={styles.nextBtn}
                {...nextButtonProps}
              >
                {isLastStep ? 'Submit Application' : nextButtonText}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StepContentWrapper({
  isCompleted,
  currentStep,
  direction,
  children,
  className = '',
}: {
  isCompleted: boolean
  currentStep: number
  direction: number
  children: ReactNode
  className?: string
}) {
  const [parentHeight, setParentHeight] = useState<number>(0)

  return (
    <motion.div
      style={{ position: 'relative', overflow: 'hidden' }}
      animate={{ height: isCompleted ? 0 : parentHeight || 'auto' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className={className}
    >
      <AnimatePresence initial={false} mode="wait" custom={direction}>
        {!isCompleted && (
          <SlideTransition key={currentStep} direction={direction} onHeightReady={(h) => setParentHeight(h)}>
            {children}
          </SlideTransition>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function SlideTransition({
  children,
  direction,
  onHeightReady,
}: {
  children: ReactNode
  direction: number
  onHeightReady: (height: number) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (containerRef.current) {
      onHeightReady(containerRef.current.offsetHeight)
    }
  }, [children, onHeightReady])

  return (
    <motion.div
      ref={containerRef}
      custom={direction}
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{
        x: { type: 'spring', stiffness: 300, damping: 30 },
        opacity: { duration: 0.2 },
      }}
      className="w-full"
    >
      {children}
    </motion.div>
  )
}

const stepVariants: Variants = {
  enter: (dir: number) => ({
    x: dir >= 0 ? 20 : -20,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (dir: number) => ({
    x: dir >= 0 ? -20 : 20,
    opacity: 0,
  }),
}

export function Step({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div style={{ padding: 'var(--space-4) 0' }}>
      {title && (
        <h2
          style={{
            fontSize: 'var(--text-lg)',
            fontWeight: 'var(--font-bold)',
            color: 'var(--text-primary)',
            marginBottom: 'var(--space-4)',
          }}
        >
          {title}
        </h2>
      )}
      <div style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>{children}</div>
    </div>
  )
}

function StepIndicator({
  step,
  currentStep,
  onClickStep,
  disableStepIndicators = false,
}: {
  step: number
  currentStep: number
  onClickStep: (clicked: number) => void
  disableStepIndicators?: boolean
}) {
  const status = currentStep === step ? 'active' : currentStep < step ? 'inactive' : 'complete'

  return (
    <motion.div
      onClick={() => !disableStepIndicators && onClickStep(step)}
      className={`${styles.stepIndicator} ${!disableStepIndicators ? styles.clickable : ''}`}
      animate={status}
    >
      <motion.div
        variants={{
          inactive: {
            scale: 1,
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border-default)',
            color: 'var(--text-tertiary)',
          },
          active: {
            scale: 1.05,
            backgroundColor: 'var(--bg-canvas)',
            borderColor: 'var(--text-accent)',
            color: 'var(--text-accent)',
          },
          complete: {
            scale: 1,
            backgroundColor: 'var(--text-accent)',
            borderColor: 'var(--text-accent)',
            color: 'var(--bg-inverse)',
          },
        }}
        className={
          status === 'active'
            ? `${styles.stepIndicatorCircle} ${styles.activeCircle}`
            : status === 'complete'
            ? `${styles.stepIndicatorCircle} ${styles.completeCircle}`
            : styles.stepIndicatorCircle
        }
      >
        {status === 'complete' ? <Check className="h-4 w-4" style={{ strokeWidth: 3 }} /> : <span>{step}</span>}
      </motion.div>

      {status === 'active' && (
        <motion.div
          layoutId="active-glow"
          className={styles.glow}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />
      )}
    </motion.div>
  )
}

function StepConnector({ isComplete }: { isComplete: boolean }) {
  return (
    <div className={styles.stepConnector}>
      <motion.div
        className={styles.stepConnectorProgress}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: isComplete ? 1 : 0 }}
        transition={{ duration: 0.4, ease: [0.33, 1, 0.68, 1] }}
      />
    </div>
  )
}

export default AnimatedStepper
