import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases, { LOG_LEVEL, CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import { useAuth } from './auth';

export const simulatedPurchases = Platform.OS === 'web' || __DEV__ || Constants.appOwnership === 'expo';
const enabled = Platform.OS !== 'web' || __DEV__;
let initialized = false;
let initializationError = '';
let identityQueue: Promise<unknown> = Promise.resolve();

export function initializePurchases() {
  if (initialized || !enabled) return;
  try {
    // Native uses the app manifest. Web may retain an older inlined APP_MANIFEST
    // when a dynamic config is first added; Expo statically inlines EXPO_PUBLIC_ keys.
    const manifest = Constants.expoConfig?.extra?.revenuecat;
    const keys = {
      testKey: Platform.OS === 'web' ? process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY : (manifest?.testKey || process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY),
      iosKey: manifest?.iosKey || process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
      androidKey: manifest?.androidKey || process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
    };
    const apiKey = simulatedPurchases ? keys?.testKey : Platform.OS === 'ios' ? keys?.iosKey : keys?.androidKey;
    if (!apiKey) throw new Error('Configurazione acquisti non disponibile.');
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
    Purchases.configure({ apiKey });
    initialized = true;
    initializationError = '';
  } catch (e) { initializationError = String(e); }
}

function usePurchaseState() {
  const { user, loading: authLoading } = useAuth();
  const uid = user?.user_id || null;
  const currentUid = useRef(uid);
  currentUid.current = uid;
  const [boundId, setBoundId] = useState<string | null>(null);
  const [info, setInfo] = useState<CustomerInfo | null>(null);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [identityError, setIdentityError] = useState(initializationError);
  const [storeError, setStoreError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const boundRef = useRef<string | null>(null);
  const originalRef = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setBoundId(null); boundRef.current = null; originalRef.current = null; setInfo(null);
    setIdentityError(initializationError); setStoreError(''); setPackages([]);
    if (!initialized) return;
    setLoading(true);
    const transition = async () => {
      if (cancelled) return;
      if (!uid) {
        if (!(await Purchases.isAnonymous())) await Purchases.logOut();
        return;
      }
      const { customerInfo } = await Purchases.logIn(uid);
      // originalAppUserId is a historical alias: it may legitimately stay anonymous.
      // The SDK's CURRENT ID and anonymity status verify the authenticated identity.
      const activeId = await Purchases.getAppUserID();
      if (activeId !== uid || await Purchases.isAnonymous()) throw new Error('Account acquisti non allineato: riprova il collegamento.');
      if (cancelled || currentUid.current !== uid) return;
      originalRef.current = customerInfo.originalAppUserId;
      boundRef.current = uid; setBoundId(uid); setInfo(customerInfo);
      // Stable backend identifier, never a bearer token or email.
      if (__DEV__) console.info('[RevenueCat] identity bound:', activeId);
      try {
        const offerings = await Purchases.getOfferings();
        if (!cancelled) setPackages((offerings.current?.availablePackages || []).filter(p => p.identifier === '$rc_monthly'));
      } catch (e) { if (!cancelled) setStoreError(String(e)); }
    };
    identityQueue = identityQueue.catch(() => undefined).then(transition).catch(e => {
      if (!cancelled) { setIdentityError(String(e)); setBoundId(null); boundRef.current = null; originalRef.current = null; setInfo(null); }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [uid, authLoading, retryCount]);

  useEffect(() => {
    if (!initialized) return;
    const listener = (next: CustomerInfo) => {
      // Ignore notifications from a previous account or an identity transition.
      if (currentUid.current && boundRef.current === currentUid.current && next.originalAppUserId === originalRef.current) setInfo(next);
    };
    Purchases.addCustomerInfoUpdateListener(listener);
    const sub = AppState.addEventListener('change', async state => {
      if (state !== 'active' || !boundRef.current) return;
      try { listener(await Purchases.getCustomerInfo()); }
      catch (e) { setStoreError(String(e)); }
    });
    return () => { Purchases.removeCustomerInfoUpdateListener(listener); sub.remove(); };
  }, []);

  const operate = useCallback(async (pkg?: PurchasesPackage) => {
    if (busyRef.current) throw new Error('Operazione già in corso.');
    busyRef.current = true; setBusy(true);
    const expected = currentUid.current;
    try {
      const operation = identityQueue.catch(() => undefined).then(async () => {
        if (!expected || currentUid.current !== expected || boundRef.current !== expected || !initialized) throw new Error('Collega il tuo account prima di acquistare.');
        if ((await Purchases.getAppUserID()) !== expected || await Purchases.isAnonymous()) throw new Error('Identità acquisti non verificata.');
        const next = pkg ? (await Purchases.purchasePackage(pkg)).customerInfo : await Purchases.restorePurchases();
        if (currentUid.current !== expected || (await Purchases.getAppUserID()) !== expected) throw new Error('Account cambiato durante l’operazione. Accedi nuovamente allo Shop.');
        originalRef.current = next.originalAppUserId;
        setInfo(next);
        return !!next.entitlements.active.pro;
      });
      // A logout/login may not overtake an in-flight store purchase or restore.
      identityQueue = operation.catch(() => undefined);
      return await operation;
    } finally { busyRef.current = false; setBusy(false); }
  }, []);

  const identityReady = !!uid && uid === boundId && !!info && !identityError;
  return {
    packages, loading, busy, identityReady, identityError, storeError,
    isSubscribed: identityReady && !!info?.entitlements.active.pro,
    managementURL: identityReady ? info?.managementURL : null,
    expirationDate: identityReady ? info?.entitlements.active.pro?.expirationDate : null,
    purchase: (pkg: PurchasesPackage) => operate(pkg), restore: () => operate(),
    retry: () => setRetryCount(n => n + 1),
  };
}

const PurchaseContext = createContext<ReturnType<typeof usePurchaseState> | null>(null);
export function PurchaseProvider({ children }: { children: React.ReactNode }) {
  const state = usePurchaseState();
  return <PurchaseContext.Provider value={state}>{children}</PurchaseContext.Provider>;
}
export function usePurchases() {
  const value = useContext(PurchaseContext);
  if (!value) throw new Error('PurchaseProvider mancante');
  return value;
}