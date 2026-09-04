import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  StatusBar,
  ScrollView,
  Animated,
  Modal,
  Alert,
  Image,
} from 'react-native';
import { SymbolView } from '@/components/app-icon';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { platformSettings, updatePlatformSettings } from '@/constants/settings-store';
import { loginWithCredentials, sendOtp, verifyOtp, registerBroker } from '@/components/api-client';

const COUNTRIES = [
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
  'Singapore',
  'France',
  'Switzerland',
  'United Arab Emirates',
  'Hong Kong',
  'India',
  'Japan',
  'Netherlands',
  'Sweden',
  'Norway',
  'Denmark',
  'Ireland',
  'Italy',
  'Spain',
  'New Zealand',
  'South Africa',
  'Saudi Arabia',
  'Qatar',
  'Kuwait',
  'Bahrain',
  'Oman',
  'Cyprus',
  'Malta',
  'Luxembourg',
  'Belgium',
  'Austria',
  'Finland',
  'Portugal',
];
const ENTITY_TYPES = [
  'Corporation',
  'LLC',
  'Partnership',
  'Sole Proprietorship',
];
// Nicely format API validation errors
const getErrorMessage = (error: any): string => {
  if (!error) return 'An unknown error occurred';
  const rawMessage = error.message || String(error);
  
  if (
    rawMessage.includes('401') ||
    rawMessage.toLowerCase().includes('unauthorized') ||
    rawMessage.toLowerCase().includes('invalid credentials')
  ) {
    return 'Invalid email or password. Please check your credentials.';
  }

  if (rawMessage.includes('API Error')) {
    try {
      const jsonStart = rawMessage.indexOf('{');
      if (jsonStart !== -1) {
        const jsonStr = rawMessage.substring(jsonStart);
        const parsed = JSON.parse(jsonStr);
        
        if (parsed.errors?.validation) {
          const valErrors = parsed.errors.validation;
          if (Array.isArray(valErrors)) {
            return valErrors.join('\n');
          }
          if (typeof valErrors === 'object') {
            return Object.entries(valErrors)
              .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(', ') : val}`)
              .join('\n');
          }
        }
        if (parsed.message) {
          return parsed.message;
        }
      }
    } catch (e) {
      // Fallback
    }
  }
  return rawMessage;
};

export default function AuthScreenComponent() {
  const [authMode, setAuthMode] = useState<'SIGN_IN' | 'REGISTER' | 'FORGOT_PASSWORD'>('SIGN_IN');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sign In State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const loginEmailRef = useRef('');
  const loginPasswordRef = useRef('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Forgot Password State
  const [forgotEmail, setForgotEmail] = useState('');

  // Focus States
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Registration Wizard State
  const [regStep, setRegStep] = useState<1 | 2 | 3>(1);
  const [isSubmittingReg, setIsSubmittingReg] = useState(false);

  // Step 1 Form fields
  const [companyName, setCompanyName] = useState('');
  const [country, setCountry] = useState('');
  const [entityType, setEntityType] = useState('');
  const [businessTaxId, setBusinessTaxId] = useState('');
  const [regulatoryLicense, setRegulatoryLicense] = useState('');

  // Step 2 Form fields
  const [contactName, setContactName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Step 3 OTP Verification State
  const [otpCode, setOtpCode] = useState<string[]>(['', '', '', '', '', '']);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(59);

  // Dropdown Modals
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [entityModalVisible, setEntityModalVisible] = useState(false);

  // OTP Input references
  const otpRefs = useRef<Array<TextInput | null>>([]);

  // OTP Cursor Animation
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  // Clear errors when toggling modes
  useEffect(() => {
    setErrorMessage(null);
  }, [authMode, regStep]);

  useEffect(() => {
    if (regStep === 3) {
      const interval = setInterval(() => {
        setResendCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [regStep]);

  useEffect(() => {
    if (regStep === 3) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(cursorOpacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(cursorOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [regStep]);

  const handleSignIn = async () => {
    setErrorMessage(null);
    const rawEmail = loginEmailRef.current || loginEmail;
    const rawPassword = loginPasswordRef.current || loginPassword;
    const cleanEmail = (rawEmail || '').trim().toLowerCase();
    const cleanPassword = (rawPassword || '').trim();
    if (!cleanEmail || !cleanPassword) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }
    setIsLoggingIn(true);
    try {
      const user = await loginWithCredentials(cleanEmail, cleanPassword);
      updatePlatformSettings({
        isLoggedIn: true,
        emailAddress: user?.email || cleanEmail,
        contactName: user?.name || 'Broker User',
      });
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleForgotPassword = async () => {
    setErrorMessage(null);
    if (!forgotEmail.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }
    setIsLoggingIn(true);
    try {
      await sendOtp(forgotEmail.toLowerCase());
      Alert.alert(
        'Verification Sent',
        'A verification code has been sent to your email to verify your account.',
        [
          {
            text: 'OK',
            onPress: () => {
              setAuthMode('SIGN_IN');
              setForgotEmail('');
            },
          },
        ]
      );
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleContinueStep1 = () => {
    setErrorMessage(null);
    if (!companyName.trim() || !country || !entityType || !businessTaxId.trim()) {
      setErrorMessage('Please fill in all required company details.');
      return;
    }
    setRegStep(2);
  };

  const handleContinueStep2 = async () => {
    setErrorMessage(null);
    if (!contactName.trim() || !regEmail.trim() || !phone.trim() || !regPassword.trim()) {
      setErrorMessage('Please fill in all contact information.');
      return;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
    if (regPassword.length < 12 || !passwordRegex.test(regPassword)) {
      setErrorMessage('Password must be at least 12 characters and contain uppercase, lowercase, and a number.');
      return;
    }

    setIsSubmittingReg(true);
    try {
      await sendOtp(regEmail.toLowerCase());
      setResendCountdown(59);
      setRegStep(3);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmittingReg(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCountdown > 0) return;
    setErrorMessage(null);
    try {
      await sendOtp(regEmail.toLowerCase());
      setResendCountdown(59);
      Alert.alert('OTP Sent', 'A new verification code has been sent to your email.');
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error));
    }
  };

  const handleVerifyOtp = async () => {
    const fullOtp = otpCode.join('');
    setErrorMessage(null);
    if (fullOtp.length < 6) {
      setErrorMessage('Please enter the 6-digit OTP code.');
      return;
    }

    setIsVerifyingOtp(true);
    try {
      await verifyOtp(regEmail.toLowerCase(), fullOtp);

      const regData = {
        companyName,
        country,
        entityType,
        businessTaxId,
        regulatoryLicense: regulatoryLicense.trim() || undefined,
        contactName,
        email: regEmail.toLowerCase(),
        phone,
        password: regPassword,
        agreementAccepted: true,
      };
      
      const res = await registerBroker(regData);

      Alert.alert(
        'Registration Success',
        res.message || 'Your compliance broker registration has been submitted successfully. Pending admin approval.',
        [
          {
            text: 'OK',
            onPress: () => {
              setRegStep(1);
              setCompanyName('');
              setCountry('');
              setEntityType('');
              setBusinessTaxId('');
              setRegulatoryLicense('');
              setContactName('');
              setRegEmail('');
              setPhone('');
              setRegPassword('');
              setOtpCode(['', '', '', '', '', '']);
              setAuthMode('SIGN_IN');
            },
          },
        ]
      );
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleOtpChange = (text: string, index: number) => {
    const cleanText = text.replace(/[^0-9]/g, '');
    const newOtp = [...otpCode];
    newOtp[index] = cleanText;
    setOtpCode(newOtp);

    if (cleanText !== '' && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && otpCode[index] === '' && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  return (
    <View style={styles.rootContainer}>
      <StatusBar barStyle="light-content" />

      {/* Background Image Layer covering 100% of parent View */}
      <Image
        source={require('../../assets/images/l1.jpg')}
        style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
        resizeMode="cover"
      />
      {/* Light transparent dark overlay to ensure text contrast while keeping background fully visible */}
      <LinearGradient colors={['rgba(0, 0, 0, 0.3)', 'rgba(0, 0, 0, 0.45)']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={{ flex: 1, backgroundColor: 'transparent' }}
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.innerContainer}>
          {authMode === 'SIGN_IN' ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Sign in</Text>
              <Text style={styles.cardSubtitle}>Enter your credentials to access your account</Text>

              {errorMessage && (
                <View style={styles.errorBanner}>
                  <SymbolView name="exclamationmark.triangle" size={14} tintColor="#ef4444" style={styles.errorIcon} />
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              )}

              {/* Email Field */}
              <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
              <View
                style={[
                  styles.inputWrapper,
                  focusedField === 'loginEmail' && styles.inputWrapperFocused,
                ]}
              >
                <TextInput
                  style={styles.textInput}
                  placeholder="you@company.com"
                  placeholderTextColor="#52525b"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  value={loginEmail}
                  onChangeText={(text) => {
                    loginEmailRef.current = text;
                    setLoginEmail(text);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  onFocus={() => setFocusedField('loginEmail')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>

              {/* Password Field */}
              <View style={styles.passwordHeader}>
                <Text style={styles.inputLabel}>PASSWORD</Text>
                <Pressable onPress={() => setAuthMode('FORGOT_PASSWORD')}>
                  <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                </Pressable>
              </View>
              <View
                style={[
                  styles.inputWrapper,
                  focusedField === 'loginPassword' && styles.inputWrapperFocused,
                ]}
              >
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your password"
                  placeholderTextColor="#52525b"
                  secureTextEntry={!showLoginPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  textContentType="password"
                  value={loginPassword}
                  onChangeText={(text) => {
                    loginPasswordRef.current = text;
                    setLoginPassword(text);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  onFocus={() => setFocusedField('loginPassword')}
                  onBlur={() => setFocusedField(null)}
                />
                <Pressable onPress={() => setShowLoginPassword(!showLoginPassword)}>
                  <Text style={styles.showHideText}>{showLoginPassword ? 'Hide' : 'Show'}</Text>
                </Pressable>
              </View>

              {/* Submit Button */}
              <Pressable style={styles.submitButtonContainer} onPress={handleSignIn} disabled={isLoggingIn}>
                <LinearGradient
                  colors={['#ffffff', '#e4e4e7']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.gradientButton}
                >
                  {isLoggingIn ? (
                    <ActivityIndicator color="#000000" size="small" />
                  ) : (
                    <View style={styles.buttonInner}>
                      <Text style={styles.submitButtonText}>Sign in</Text>
                      <SymbolView name="arrow.right" size={14} tintColor="#000000" style={styles.arrowIcon} />
                    </View>
                  )}
                </LinearGradient>
              </Pressable>

              <View style={styles.cardDivider} />

              {/* Broker Switch */}
              <View style={styles.brokerSwitchWrap}>
                <Text style={styles.brokerLabel}>Are you a broker?</Text>
                <Pressable onPress={() => setAuthMode('REGISTER')}>
                  <Text style={styles.brokerLink}>Apply for access</Text>
                </Pressable>
              </View>
            </View>
          ) : authMode === 'REGISTER' ? (
            // REGISTER Views
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Broker Registration</Text>
              <Text style={styles.cardSubtitle}>Complete the compliance form to apply for broker access</Text>

              {errorMessage && (
                <View style={styles.errorBanner}>
                  <SymbolView name="exclamationmark.triangle" size={14} tintColor="#ef4444" style={styles.errorIcon} />
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              )}

              {/* Stepper indicator */}
              <View style={styles.stepperContainer}>
                <View style={[styles.stepCircle, regStep >= 1 && styles.stepCircleActive]}>
                  {regStep > 1 ? (
                    <SymbolView name="checkmark" size={12} tintColor="#000000" />
                  ) : (
                    <Text style={[styles.stepNumber, regStep >= 1 && styles.stepNumberActive]}>1</Text>
                  )}
                </View>
                <View style={[styles.stepLine, regStep >= 2 && styles.stepLineActive]} />
                <View style={[styles.stepCircle, regStep >= 2 && styles.stepCircleActive]}>
                  {regStep > 2 ? (
                    <SymbolView name="checkmark" size={12} tintColor="#000000" />
                  ) : (
                    <Text style={[styles.stepNumber, regStep >= 2 && styles.stepNumberActive]}>2</Text>
                  )}
                </View>
                <View style={[styles.stepLine, regStep >= 3 && styles.stepLineActive]} />
                <View style={[styles.stepCircle, regStep >= 3 && styles.stepCircleActive]}>
                  <Text style={[styles.stepNumber, regStep >= 3 && styles.stepNumberActive]}>3</Text>
                </View>
              </View>

              {regStep === 1 && (
                <View>
                  <Text style={styles.stepTitle}>Step 1 of 3 — Company Profile</Text>

                  {/* Company Name */}
                  <Text style={styles.inputLabel}>COMPANY NAME *</Text>
                  <View
                    style={[
                      styles.inputWrapper,
                      focusedField === 'companyName' && styles.inputWrapperFocused,
                    ]}
                  >
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. Acme Capital Ltd"
                      placeholderTextColor="#52525b"
                      value={companyName}
                      onChangeText={setCompanyName}
                      onFocus={() => setFocusedField('companyName')}
                      onBlur={() => setFocusedField(null)}
                    />
                  </View>

                  {/* Country & Entity Type Grid */}
                  <View style={styles.gridRow}>
                    <View style={styles.gridCol}>
                      <Text style={styles.inputLabel}>COUNTRY *</Text>
                      <Pressable
                        style={[
                          styles.inputWrapper,
                          focusedField === 'country' && styles.inputWrapperFocused,
                        ]}
                        onPress={() => setCountryModalVisible(true)}
                      >
                        <Text style={[styles.dropdownValueText, !country && styles.dropdownPlaceholder]}>
                          {country || 'Country'}
                        </Text>
                        <SymbolView name="chevron.down" size={12} tintColor="#71717a" style={styles.dropdownChevron} />
                      </Pressable>
                    </View>

                    <View style={styles.gridCol}>
                      <Text style={styles.inputLabel}>ENTITY TYPE *</Text>
                      <Pressable
                        style={[
                          styles.inputWrapper,
                          focusedField === 'entityType' && styles.inputWrapperFocused,
                        ]}
                        onPress={() => setEntityModalVisible(true)}
                      >
                        <Text style={[styles.dropdownValueText, !entityType && styles.dropdownPlaceholder]}>
                          {entityType || 'Select...'}
                        </Text>
                        <SymbolView name="chevron.down" size={12} tintColor="#71717a" style={styles.dropdownChevron} />
                      </Pressable>
                    </View>
                  </View>

                  {/* Business/Tax ID & Regulatory License Grid */}
                  <View style={styles.gridRow}>
                    <View style={styles.gridCol}>
                      <Text style={styles.inputLabel}>BUSINESS / TAX ID *</Text>
                      <View
                        style={[
                          styles.inputWrapper,
                          focusedField === 'businessTaxId' && styles.inputWrapperFocused,
                        ]}
                      >
                        <TextInput
                          style={styles.textInput}
                          placeholder="e.g. TAX-12345678"
                          placeholderTextColor="#52525b"
                          value={businessTaxId}
                          onChangeText={setBusinessTaxId}
                          onFocus={() => setFocusedField('businessTaxId')}
                          onBlur={() => setFocusedField(null)}
                        />
                      </View>
                    </View>

                    <View style={styles.gridCol}>
                      <Text style={styles.inputLabel}>REGULATORY LICENSE</Text>
                      <View
                        style={[
                          styles.inputWrapper,
                          focusedField === 'regulatoryLicense' && styles.inputWrapperFocused,
                        ]}
                      >
                        <TextInput
                          style={styles.textInput}
                          placeholder="e.g. FCA 123456 (Optional)"
                          placeholderTextColor="#52525b"
                          value={regulatoryLicense}
                          onChangeText={setRegulatoryLicense}
                          onFocus={() => setFocusedField('regulatoryLicense')}
                          onBlur={() => setFocusedField(null)}
                        />
                      </View>
                    </View>
                  </View>

                  {/* Submit Step 1 */}
                  <Pressable style={styles.submitButtonContainer} onPress={handleContinueStep1}>
                    <LinearGradient
                      colors={['#ffffff', '#e4e4e7']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.gradientButton}
                    >
                      <View style={styles.buttonInner}>
                        <Text style={styles.submitButtonText}>Continue</Text>
                        <SymbolView name="arrow.right" size={14} tintColor="#000000" style={styles.arrowIcon} />
                      </View>
                    </LinearGradient>
                  </Pressable>
                </View>
              )}

              {regStep === 2 && (
                <View>
                  <Text style={styles.stepTitle}>Step 2 of 3 — Business Contact</Text>

                  {/* Contact Name */}
                  <Text style={styles.inputLabel}>CONTACT NAME *</Text>
                  <View
                    style={[
                      styles.inputWrapper,
                      focusedField === 'contactName' && styles.inputWrapperFocused,
                    ]}
                  >
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. John Smith"
                      placeholderTextColor="#52525b"
                      value={contactName}
                      onChangeText={setContactName}
                      onFocus={() => setFocusedField('contactName')}
                      onBlur={() => setFocusedField(null)}
                    />
                  </View>

                  {/* Email Address */}
                  <Text style={styles.inputLabel}>EMAIL ADDRESS *</Text>
                  <View
                    style={[
                      styles.inputWrapper,
                      focusedField === 'regEmail' && styles.inputWrapperFocused,
                    ]}
                  >
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. john@acmecapital.com"
                      placeholderTextColor="#52525b"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      value={regEmail}
                      onChangeText={setRegEmail}
                      onFocus={() => setFocusedField('regEmail')}
                      onBlur={() => setFocusedField(null)}
                    />
                  </View>

                  {/* Phone Number & Password Grid */}
                  <View style={styles.gridRow}>
                    <View style={styles.gridCol}>
                      <Text style={styles.inputLabel}>PHONE NUMBER *</Text>
                      <View
                        style={[
                          styles.inputWrapper,
                          focusedField === 'phone' && styles.inputWrapperFocused,
                        ]}
                      >
                        <TextInput
                          style={styles.textInput}
                          placeholder="e.g. +442079460958"
                          placeholderTextColor="#52525b"
                          value={phone}
                          onChangeText={setPhone}
                          onFocus={() => setFocusedField('phone')}
                          onBlur={() => setFocusedField(null)}
                        />
                      </View>
                    </View>

                    <View style={styles.gridCol}>
                      <Text style={styles.inputLabel}>PASSWORD *</Text>
                      <View
                        style={[
                          styles.inputWrapper,
                          focusedField === 'regPassword' && styles.inputWrapperFocused,
                        ]}
                      >
                        <TextInput
                          style={styles.textInput}
                          placeholder="Min 12 characters"
                          placeholderTextColor="#52525b"
                          secureTextEntry={!showRegPassword}
                          autoCapitalize="none"
                          value={regPassword}
                          onChangeText={setRegPassword}
                          onFocus={() => setFocusedField('regPassword')}
                          onBlur={() => setFocusedField(null)}
                        />
                        <Pressable onPress={() => setShowRegPassword(!showRegPassword)}>
                          <Text style={styles.showHideText}>{showRegPassword ? 'Hide' : 'Show'}</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>

                  {/* Submit Step 2 */}
                  <View style={styles.step2ButtonsWrap}>
                    <Pressable style={[styles.backButton]} onPress={() => setRegStep(1)}>
                      <SymbolView name="arrow.left" size={14} tintColor="#ffffff" style={styles.backArrowIcon} />
                      <Text style={styles.backButtonText}>Back</Text>
                    </Pressable>

                    <Pressable style={styles.continueButton} onPress={handleContinueStep2} disabled={isSubmittingReg}>
                      <LinearGradient
                        colors={['#ffffff', '#e4e4e7']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.gradientButton}
                      >
                        {isSubmittingReg ? (
                          <ActivityIndicator color="#000000" size="small" />
                        ) : (
                          <View style={styles.buttonInner}>
                            <Text style={styles.submitButtonText}>Continue</Text>
                            <SymbolView name="arrow.right" size={14} tintColor="#000000" style={styles.arrowIcon} />
                          </View>
                        )}
                      </LinearGradient>
                    </Pressable>
                  </View>
                </View>
              )}

              {regStep === 3 && (
                <View>
                  <View style={styles.verifyIconWrapper}>
                    <View style={styles.verifyIconInner}>
                      <SymbolView name="envelope" size={24} tintColor="#ffffff" />
                    </View>
                  </View>

                  <Text style={styles.cardTitleCentred}>Verify your Email</Text>
                  <Text style={styles.cardSubtitleCentred}>
                    We sent a 6-digit verification code to {'\n'}
                    <Text style={styles.boldEmail}>{regEmail.toLowerCase()}</Text>
                  </Text>

                  {/* 6-Digit OTP Box Grid */}
                  <View style={styles.otpGrid}>
                    {otpCode.map((digit, index) => {
                      const isFocused = focusedField === `otp_${index}`;
                      return (
                        <View
                          key={index}
                          style={[
                            styles.otpInputBox,
                            isFocused && styles.otpInputBoxFocused,
                            digit !== '' && styles.otpInputBoxFilled,
                          ]}
                        >
                          <TextInput
                            ref={(el) => {
                              otpRefs.current[index] = el;
                            }}
                            style={styles.otpTextInput}
                            keyboardType="number-pad"
                            maxLength={1}
                            value={digit}
                            onChangeText={(text) => handleOtpChange(text, index)}
                            onKeyPress={(e) => handleOtpKeyPress(e, index)}
                            onFocus={() => setFocusedField(`otp_${index}`)}
                            onBlur={() => setFocusedField(null)}
                            caretHidden={true}
                          />
                          {isFocused && digit === '' && (
                            <Animated.View style={[styles.cursorIndicator, { opacity: cursorOpacity }]} />
                          )}
                        </View>
                      );
                    })}
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.otpButtonsRow}>
                    <Pressable
                      style={[styles.otpResendBtn, resendCountdown > 0 && styles.otpResendBtnDisabled]}
                      onPress={handleResendOtp}
                      disabled={resendCountdown > 0}
                    >
                      <Text style={[styles.otpResendText, resendCountdown > 0 && styles.otpResendTextDisabled]}>
                        Resend {resendCountdown > 0 ? `(${resendCountdown}s)` : ''}
                      </Text>
                    </Pressable>

                    <Pressable style={styles.otpVerifyBtn} onPress={handleVerifyOtp} disabled={isVerifyingOtp}>
                      <LinearGradient
                        colors={['#ffffff', '#e4e4e7']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.otpGradientBtn}
                      >
                        {isVerifyingOtp ? (
                          <ActivityIndicator color="#000000" size="small" />
                        ) : (
                          <Text style={styles.otpVerifyText}>Verify Code</Text>
                        )}
                      </LinearGradient>
                    </Pressable>
                  </View>

                  {/* Cancel and edit details */}
                  <Pressable
                    style={styles.cancelEditBtn}
                    onPress={() => {
                      setRegStep(2);
                      setOtpCode(['', '', '', '', '', '']);
                    }}
                  >
                    <Text style={styles.cancelEditText}>Cancel and edit details</Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.cardDivider} />

              <View style={styles.brokerSwitchWrap}>
                <Text style={styles.brokerLabel}>Already have an account?</Text>
                <Pressable onPress={() => setAuthMode('SIGN_IN')}>
                  <Text style={styles.brokerLink}>Sign in</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            // Forgot Password Card
            <View style={styles.card}>
              <View style={styles.logoContainer}>
                <Image
                  source={require('../../assets/images/logo_prime.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>

              <Text style={styles.cardTitle}>Forgot Password</Text>
              <Text style={styles.cardSubtitle}>Enter your email to verify your account</Text>

              {errorMessage ? (
                <View style={styles.errorBanner}>
                  <SymbolView name="exclamationmark.triangle" size={14} tintColor="#ef4444" style={styles.errorIcon} />
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}

              {/* Email Field */}
              <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
              <View
                style={[
                  styles.inputWrapper,
                  focusedField === 'forgotEmail' && styles.inputWrapperFocused,
                ]}
              >
                <TextInput
                  style={styles.textInput}
                  placeholder="you@company.com"
                  placeholderTextColor="#52525b"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  onFocus={() => setFocusedField('forgotEmail')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>

              {/* Submit Button */}
              <Pressable style={styles.submitButtonContainer} onPress={handleForgotPassword} disabled={isLoggingIn}>
                <LinearGradient
                  colors={['#ffffff', '#e4e4e7']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.gradientButton}
                >
                  {isLoggingIn ? (
                    <ActivityIndicator color="#000000" size="small" />
                  ) : (
                    <View style={styles.buttonInner}>
                      <Text style={styles.submitButtonText}>Continue</Text>
                      <SymbolView name="arrow.right" size={14} tintColor="#000000" style={styles.arrowIcon} />
                    </View>
                  )}
                </LinearGradient>
              </Pressable>

              <View style={styles.cardDivider} />

              <View style={styles.brokerSwitchWrap}>
                <Text style={styles.brokerLabel}>Remember your password?</Text>
                <Pressable onPress={() => setAuthMode('SIGN_IN')}>
                  <Text style={styles.brokerLink}>Sign In</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Country Selection Modal */}
      <Modal visible={countryModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Country</Text>
            <ScrollView style={styles.modalScroll}>
              {COUNTRIES.map((c) => (
                <Pressable
                  key={c}
                  style={styles.modalOptionRow}
                  onPress={() => {
                    setCountry(c);
                    setCountryModalVisible(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{c}</Text>
                  {country === c && <SymbolView name="checkmark" size={14} tintColor="#ffffff" />}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.modalCloseBtn} onPress={() => setCountryModalVisible(false)}>
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Entity Selection Modal */}
      <Modal visible={entityModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Entity Type</Text>
            <ScrollView style={styles.modalScroll}>
              {ENTITY_TYPES.map((e) => (
                <Pressable
                  key={e}
                  style={styles.modalOptionRow}
                  onPress={() => {
                    setEntityType(e);
                    setEntityModalVisible(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{e}</Text>
                  {entityType === e && <SymbolView name="checkmark" size={14} tintColor="#ffffff" />}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.modalCloseBtn} onPress={() => setEntityModalVisible(false)}>
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  innerContainer: {
    width: '100%',
    maxWidth: 420,
  },
  card: {
    backgroundColor: 'rgba(9, 9, 11, 0.78)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#a1a1aa',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 28,
  },
  cardTitleCentred: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  cardSubtitleCentred: {
    fontSize: 13,
    color: '#a1a1aa',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  boldEmail: {
    color: '#ffffff',
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#71717a',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0c0c0e',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  inputWrapperFocused: {
    borderColor: 'rgba(255, 255, 255, 0.25)',
    backgroundColor: '#0e0e11',
  },
  textInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    height: '100%',
    padding: 0,
  },
  passwordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forgotPasswordText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  showHideText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    paddingLeft: 10,
  },
  submitButtonContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  gradientButton: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '700',
  },
  arrowIcon: {
    marginLeft: 6,
  },
  cardDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    marginVertical: 20,
  },
  brokerSwitchWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  brokerLabel: {
    fontSize: 13,
    color: '#a1a1aa',
  },
  brokerLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    textDecorationLine: 'underline',
  },

  // Stepper UI
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 18,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#0c0c0e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleActive: {
    borderColor: '#ffffff',
    backgroundColor: '#ffffff',
  },
  stepNumber: {
    fontSize: 11,
    fontWeight: '800',
    color: '#71717a',
  },
  stepNumberActive: {
    color: '#000000',
  },
  stepLine: {
    flex: 1,
    maxWidth: 60,
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginHorizontal: 8,
  },
  stepLineActive: {
    backgroundColor: '#ffffff',
  },
  stepTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 20,
  },

  // Form layouts
  gridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  gridCol: {
    flex: 1,
  },
  dropdownValueText: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13.5,
  },
  dropdownPlaceholder: {
    color: '#52525b',
  },
  dropdownChevron: {
    marginLeft: 6,
  },

  // Step 2 Buttons
  step2ButtonsWrap: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  backButton: {
    width: 100,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'transparent',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  backArrowIcon: {
    marginRight: 2,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  continueButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },

  // Step 3 OTP Layout
  verifyIconWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  verifyIconInner: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpGrid: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 28,
  },
  otpInputBox: {
    width: 44,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#0c0c0e',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  otpInputBoxFocused: {
    borderColor: 'rgba(255, 255, 255, 0.25)',
    backgroundColor: '#0e0e11',
  },
  otpInputBoxFilled: {
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
  otpTextInput: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },
  cursorIndicator: {
    position: 'absolute',
    width: 1.5,
    height: 20,
    backgroundColor: '#ffffff',
  },
  otpButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  otpResendBtn: {
    width: 120,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpResendBtnDisabled: {
    opacity: 0.5,
  },
  otpResendText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  otpResendTextDisabled: {
    color: '#71717a',
  },
  otpVerifyBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  otpGradientBtn: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpVerifyText: {
    color: '#000000',
    fontSize: 14.5,
    fontWeight: '700',
  },
  cancelEditBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  cancelEditText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#71717a',
    textDecorationLine: 'underline',
  },

  // Modal Selection Layout
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#09090b',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    width: '100%',
    maxWidth: 360,
    maxHeight: 480,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 16,
  },
  modalScroll: {
    marginVertical: 6,
  },
  modalOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
  },
  modalOptionText: {
    color: '#e2e8f0',
    fontSize: 14.5,
  },
  modalCloseBtn: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  modalCloseBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  errorIcon: {
    marginRight: 10,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logo: {
    width: 74,
    height: 60,
  },
});
