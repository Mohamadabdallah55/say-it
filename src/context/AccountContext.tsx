import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import {
  auth,
  BOOTSTRAP_ADMIN_EMAIL,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
} from '../firebase';
import {
  computeCategoryConsumption,
  sanitizeSafeImageUrl,
  VALID_HEX_COLOR_REGEX,
  VALID_ID_REGEX,
} from '../game/categoryProgress';
import { SERVER_CURATED_CATEGORIES } from '../game/curatedBanks';
import { ALL_CURATED_CATEGORIES, CURATED_QUESTIONS } from '../game/starterDecks';
import type {
  CategoryConsumptionStats,
  CategoryIconKey,
  CategoryProgressRecord,
  DeckCategory,
  Difficulty,
  PointValue,
  QuestionType,
  QuizQuestion,
} from '../game/types';

export interface AdminCategoryInput {
  id?: string;
  name: string;
  description: string;
  iconKey: CategoryIconKey;
  accentColor: string;
  isVip: boolean;
  isActive: boolean;
  order?: number;
}

export interface AdminQuestionInput {
  id?: string;
  categoryId: string;
  categoryName: string;
  difficulty: Difficulty;
  questionType: QuestionType;
  prompt: string;
  answer: string;
  acceptableAnswers?: string[];
  options?: string[];
  correctOptionIndex?: number;
  hint?: string;
  explanation?: string;
  imageUrl?: string;
  imageCaption?: string;
  status?: 'approved' | 'needs_review' | 'rejected';
  isBackup?: boolean;
}

interface AccountContextValue {
  user: User | null;
  authReady: boolean;
  isAdmin: boolean;
  signingIn: boolean;
  authError: string | null;
  catalogLoaded: boolean;
  customCategories: DeckCategory[];
  customQuestions: QuizQuestion[];
  allCategoriesForLobby: DeckCategory[];
  allCategoriesForAdmin: DeckCategory[];
  progressByCategory: Record<string, CategoryProgressRecord>;
  totalPlayedCount: number;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  clearAuthError: () => void;
  getCategoryStats: (categoryId: string) => CategoryConsumptionStats;
  getPlayedMapForMatch: () => Record<string, string[]>;
  recordPlayedQuestion: (categoryId: string, questionId: string) => Promise<void>;
  resetCategoryProgress: (categoryId: string) => Promise<void>;
  saveAdminCategory: (input: AdminCategoryInput) => Promise<DeckCategory>;
  deleteAdminCategory: (categoryId: string) => Promise<void>;
  saveAdminQuestion: (input: AdminQuestionInput) => Promise<QuizQuestion>;
  deleteAdminQuestion: (questionId: string) => Promise<void>;
  bulkImportAdminQuestions: (items: AdminQuestionInput[]) => Promise<number>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

function tsToIso(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && 'toDate' in (val as Timestamp)) {
    try {
      return (val as Timestamp).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

function makeSlugId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [builtinIdsByCategory, setBuiltinIdsByCategory] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    for (const q of CURATED_QUESTIONS) {
      if (q.status !== 'approved') continue;
      if (!initial[q.categoryId]) initial[q.categoryId] = [];
      initial[q.categoryId].push(q.id);
    }
    return initial;
  });

  const [customCategories, setCustomCategories] = useState<DeckCategory[]>([]);
  const [customQuestions, setCustomQuestions] = useState<QuizQuestion[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [progressByCategory, setProgressByCategory] = useState<Record<string, CategoryProgressRecord>>({});
  const [profileTotalPlayed, setProfileTotalPlayed] = useState<number>(0);

  // Test Firestore connectivity once on boot + load built-in server question IDs (e.g. 200 Prophet Stories IDs)
  useEffect(() => {
    testFirestoreConnection();
    fetch('/api/catalog/builtin-ids')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.questionIdsByCategory && typeof data.questionIdsByCategory === 'object') {
          setBuiltinIdsByCategory(data.questionIdsByCategory);
        }
      })
      .catch(() => {
        // Fallback to client CURATED_QUESTIONS IDs already initialized
      });
  }, []);

  // Auth listener + user profile bootstrap + admin verification
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setIsAdmin(false);
        setProgressByCategory({});
        setProfileTotalPlayed(0);
        setAuthReady(true);
        return;
      }

      const email = (nextUser.email || '').trim().toLowerCase();
      const verified = Boolean(nextUser.emailVerified);
      const isBootstrap = verified && email === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();

      // Ensure /users/{uid} exists before any progress writes (Master Gate invariant)
      const userPath = `users/${nextUser.uid}`;
      try {
        const userRef = doc(db, 'users', nextUser.uid);
        const snap = await getDoc(userRef);
        const displayName = (nextUser.displayName || email.split('@')[0] || 'لاعب').slice(0, 120);
        const photoURL = sanitizeSafeImageUrl(nextUser.photoURL);
        if (!snap.exists()) {
          await setDoc(userRef, {
            uid: nextUser.uid,
            displayName,
            email: nextUser.email || '',
            photoURL,
            totalPlayedQuestions: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          setProfileTotalPlayed(0);
        } else {
          const data = snap.data();
          const currentTotal =
            typeof data.totalPlayedQuestions === 'number' ? data.totalPlayedQuestions : 0;
          setProfileTotalPlayed(currentTotal);
          await updateDoc(userRef, {
            displayName,
            email: nextUser.email || '',
            photoURL,
            totalPlayedQuestions: currentTotal,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.error('[AccountContext] User profile sync warning:', err);
      }

      // Check admin status
      let adminGranted = isBootstrap;
      try {
        const adminRef = doc(db, 'admins', nextUser.uid);
        const adminSnap = await getDoc(adminRef);
        if (adminSnap.exists()) {
          adminGranted = true;
        } else if (isBootstrap) {
          await setDoc(adminRef, {
            uid: nextUser.uid,
            email: nextUser.email || BOOTSTRAP_ADMIN_EMAIL,
            createdAt: serverTimestamp(),
          });
        }
      } catch {
        // Non-admin users may not have access or admin doc does not exist
      }

      setIsAdmin(adminGranted);
      setAuthReady(true);
    });

    return () => unsub();
  }, []);

  // Subscribe to global catalogCategories
  useEffect(() => {
    if (!authReady) return;
    const isBootstrap =
      Boolean(user?.emailVerified) &&
      (user?.email || '').toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
    const catQuery = isBootstrap
      ? query(collection(db, 'catalogCategories'))
      : query(collection(db, 'catalogCategories'), where('isActive', '==', true));

    const unsub = onSnapshot(
      catQuery,
      (snap) => {
        const items: DeckCategory[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              name: String(data.name || ''),
              description: String(data.description || ''),
              iconKey: (data.iconKey || 'general') as CategoryIconKey,
              accentColor: String(data.accentColor || '#63349B'),
              isVip: Boolean(data.isVip),
              isActive: data.isActive !== false,
              isCustom: true,
              order: typeof data.order === 'number' ? data.order : 100,
            };
          })
          .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
        setCustomCategories(items);
        setCatalogLoaded(true);
      },
      (err) => {
        console.error('[AccountContext] catalogCategories listener error:', err);
        setCatalogLoaded(true);
      },
    );

    return () => unsub();
  }, [authReady, user]);

  // Subscribe to global catalogQuestions
  useEffect(() => {
    if (!authReady) return;
    const isBootstrap =
      Boolean(user?.emailVerified) &&
      (user?.email || '').toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
    const qQuery = isBootstrap
      ? query(collection(db, 'catalogQuestions'))
      : query(collection(db, 'catalogQuestions'), where('status', '==', 'approved'));

    const unsub = onSnapshot(
      qQuery,
      (snap) => {
        const items: QuizQuestion[] = snap.docs.map((d) => {
          const data = d.data();
          const difficulty = (data.difficulty || 'easy') as Difficulty;
          const points: PointValue =
            data.points === 600 ? 600 : data.points === 400 ? 400 : 200;
          return {
            id: d.id,
            categoryId: String(data.categoryId || ''),
            categoryName: String(data.categoryName || ''),
            difficulty,
            points,
            questionType: (data.questionType || 'direct_qa') as QuestionType,
            prompt: String(data.prompt || ''),
            answer: String(data.answer || ''),
            acceptableAnswers: Array.isArray(data.acceptableAnswers)
              ? data.acceptableAnswers.map(String)
              : undefined,
            options: Array.isArray(data.options) ? data.options.map(String) : undefined,
            correctOptionIndex:
              typeof data.correctOptionIndex === 'number' ? data.correctOptionIndex : undefined,
            hint: typeof data.hint === 'string' && data.hint ? data.hint : undefined,
            explanation:
              typeof data.explanation === 'string' && data.explanation
                ? data.explanation
                : undefined,
            imageUrl: typeof data.imageUrl === 'string' && data.imageUrl ? data.imageUrl : undefined,
            imageCaption:
              typeof data.imageCaption === 'string' && data.imageCaption
                ? data.imageCaption
                : undefined,
            isBackup: Boolean(data.isBackup),
            status: (data.status || 'approved') as QuizQuestion['status'],
          };
        });
        setCustomQuestions(items);
      },
      (err) => {
        console.error('[AccountContext] catalogQuestions listener error:', err);
      },
    );

    return () => unsub();
  }, [authReady, user]);

  // Subscribe to current user's per-category progress (ONLY when authenticated!)
  useEffect(() => {
    if (!authReady || !user) {
      setProgressByCategory({});
      return;
    }

    const progressPath = `users/${user.uid}/categoryProgress`;
    const progressQuery = query(
      collection(db, 'users', user.uid, 'categoryProgress'),
      where('userId', '==', user.uid),
    );

    const unsub = onSnapshot(
      progressQuery,
      (snap) => {
        const next: Record<string, CategoryProgressRecord> = {};
        for (const d of snap.docs) {
          const data = d.data();
          next[d.id] = {
            userId: String(data.userId || user.uid),
            categoryId: d.id,
            playedQuestionIds: Array.isArray(data.playedQuestionIds)
              ? data.playedQuestionIds.map(String)
              : [],
            cycleCount: typeof data.cycleCount === 'number' ? data.cycleCount : 0,
            totalAnsweredAllTime:
              typeof data.totalAnsweredAllTime === 'number' ? data.totalAnsweredAllTime : 0,
            lastPlayedAt: tsToIso(data.lastPlayedAt),
            lastResetAt: tsToIso(data.lastResetAt),
          };
        }
        setProgressByCategory(next);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, progressPath);
      },
    );

    return () => unsub();
  }, [authReady, user]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError(null);
      } else if (code === 'auth/popup-blocked') {
        setAuthError('المتصفح منع نافذة تسجيل الدخول. يرجى السماح بالنوافذ المنبثقة والمحاولة مجددًا.');
      } else {
        setAuthError('تعذر إتمام تسجيل الدخول بجوجل حاليًا. حاول مرة أخرى.');
      }
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    await signOut(auth);
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  // Merge built-in categories + active custom categories (for Lobby)
  const allCategoriesForLobby = useMemo(() => {
    const activeCustom = customCategories.filter((c) => c.isActive !== false);
    const mergedMap = new Map<string, DeckCategory>();
    for (const { category } of SERVER_CURATED_CATEGORIES) mergedMap.set(category.id, category);
    for (const c of activeCustom) mergedMap.set(c.id, c);
    return Array.from(mergedMap.values());
  }, [customCategories]);

  // All built-in + all custom (including hidden/inactive) for Admin Panel
  const allCategoriesForAdmin = useMemo(() => {
    const mergedMap = new Map<string, DeckCategory>();
    for (const c of ALL_CURATED_CATEGORIES) mergedMap.set(c.id, { ...c, isCustom: false, isActive: true });
    for (const c of customCategories) mergedMap.set(c.id, c);
    return Array.from(mergedMap.values());
  }, [customCategories]);

  const questionIdsByCategory = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const [catId, ids] of Object.entries(builtinIdsByCategory)) {
      map[catId] = new Set(ids);
    }
    for (const q of customQuestions) {
      if (q.status !== 'approved') continue;
      if (!map[q.categoryId]) map[q.categoryId] = new Set();
      map[q.categoryId].add(q.id);
    }
    const out: Record<string, string[]> = {};
    for (const [catId, set] of Object.entries(map)) {
      out[catId] = Array.from(set);
    }
    return out;
  }, [builtinIdsByCategory, customQuestions]);

  const getCategoryStats = useCallback(
    (categoryId: string): CategoryConsumptionStats => {
      const allIds = questionIdsByCategory[categoryId] ?? [];
      const prog = progressByCategory[categoryId];
      return computeCategoryConsumption({
        categoryId,
        allQuestionIds: allIds,
        playedQuestionIds: prog?.playedQuestionIds ?? [],
        cycleCount: prog?.cycleCount ?? 0,
      });
    },
    [questionIdsByCategory, progressByCategory],
  );

  const getPlayedMapForMatch = useCallback((): Record<string, string[]> => {
    const map: Record<string, string[]> = {};
    for (const [catId, rec] of Object.entries(progressByCategory)) {
      if (rec.playedQuestionIds.length > 0) {
        map[catId] = rec.playedQuestionIds;
      }
    }
    return map;
  }, [progressByCategory]);

  const totalPlayedCount = useMemo(() => {
    const sumFromProgress = Object.values(progressByCategory).reduce(
      (sum, rec) => sum + rec.totalAnsweredAllTime,
      0,
    );
    return Math.max(profileTotalPlayed, sumFromProgress);
  }, [progressByCategory, profileTotalPlayed]);

  const recordPlayedQuestion = useCallback(
    async (categoryId: string, questionId: string) => {
      if (!user || !VALID_ID_REGEX.test(categoryId) || !VALID_ID_REGEX.test(questionId)) return;
      const docPath = `users/${user.uid}/categoryProgress/${categoryId}`;
      const progressRef = doc(db, 'users', user.uid, 'categoryProgress', categoryId);
      const userRef = doc(db, 'users', user.uid);
      try {
        const snap = await getDoc(progressRef);
        if (!snap.exists()) {
          await setDoc(progressRef, {
            userId: user.uid,
            categoryId,
            playedQuestionIds: [questionId],
            cycleCount: 0,
            totalAnsweredAllTime: 1,
            lastPlayedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          const data = snap.data();
          const existingIds: string[] = Array.isArray(data.playedQuestionIds)
            ? data.playedQuestionIds.map(String)
            : [];
          if (existingIds.includes(questionId)) return;
          const nextIds = [...existingIds, questionId].slice(-1000);
          const nextAllTime =
            (typeof data.totalAnsweredAllTime === 'number' ? data.totalAnsweredAllTime : existingIds.length) + 1;
          await updateDoc(progressRef, {
            playedQuestionIds: nextIds,
            totalAnsweredAllTime: nextAllTime,
            lastPlayedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        // Keep profile counter in sync
        const uSnap = await getDoc(userRef);
        if (uSnap.exists()) {
          const uData = uSnap.data();
          const prevTotal =
            typeof uData.totalPlayedQuestions === 'number' ? uData.totalPlayedQuestions : 0;
          await updateDoc(userRef, {
            totalPlayedQuestions: prevTotal + 1,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.error('[AccountContext] recordPlayedQuestion error:', docPath, err);
      }
    },
    [user],
  );

  const resetCategoryProgress = useCallback(
    async (categoryId: string) => {
      if (!user || !VALID_ID_REGEX.test(categoryId)) return;
      const docPath = `users/${user.uid}/categoryProgress/${categoryId}`;
      const progressRef = doc(db, 'users', user.uid, 'categoryProgress', categoryId);
      try {
        const snap = await getDoc(progressRef);
        if (!snap.exists()) return;
        const data = snap.data();
        const prevCycle = typeof data.cycleCount === 'number' ? data.cycleCount : 0;
        await updateDoc(progressRef, {
          playedQuestionIds: [],
          cycleCount: prevCycle + 1,
          lastResetAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, docPath);
      }
    },
    [user],
  );

  // --- Admin CRUD: Categories ---
  const saveAdminCategory = useCallback(
    async (input: AdminCategoryInput): Promise<DeckCategory> => {
      if (!user || !isAdmin) throw new Error('تتطلب هذه العملية صلاحية المسؤول.');
      const name = input.name.trim().slice(0, 80);
      if (name.length < 2) throw new Error('يرجى إدخال اسم فئة من حرفين على الأقل.');
      const description = input.description.trim().slice(0, 280);
      const accentColor = VALID_HEX_COLOR_REGEX.test(input.accentColor.trim())
        ? input.accentColor.trim()
        : '#63349B';
      const id =
        input.id && VALID_ID_REGEX.test(input.id) ? input.id : makeSlugId('cat_adm');
      const docPath = `catalogCategories/${id}`;
      const ref = doc(db, 'catalogCategories', id);

      try {
        const existingSnap = await getDoc(ref);
        if (existingSnap.exists()) {
          await updateDoc(ref, {
            name,
            description,
            iconKey: input.iconKey,
            accentColor,
            isVip: Boolean(input.isVip),
            isActive: Boolean(input.isActive),
            order: typeof input.order === 'number' ? Math.max(0, Math.min(10000, Math.round(input.order))) : 100,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            id,
            name,
            description,
            iconKey: input.iconKey,
            accentColor,
            isVip: Boolean(input.isVip),
            isActive: Boolean(input.isActive),
            order: typeof input.order === 'number' ? Math.max(0, Math.min(10000, Math.round(input.order))) : customCategories.length + 10,
            createdBy: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, docPath);
      }

      return {
        id,
        name,
        description,
        iconKey: input.iconKey,
        accentColor,
        isVip: Boolean(input.isVip),
        isActive: Boolean(input.isActive),
        isCustom: true,
      };
    },
    [user, isAdmin, customCategories.length],
  );

  const deleteAdminCategory = useCallback(
    async (categoryId: string) => {
      if (!user || !isAdmin) throw new Error('تتطلب هذه العملية صلاحية المسؤول.');
      const docPath = `catalogCategories/${categoryId}`;
      try {
        await deleteDoc(doc(db, 'catalogCategories', categoryId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, docPath);
      }
    },
    [user, isAdmin],
  );

  // --- Admin CRUD: Questions ---
  const saveAdminQuestion = useCallback(
    async (input: AdminQuestionInput): Promise<QuizQuestion> => {
      if (!user || !isAdmin) throw new Error('تتطلب هذه العملية صلاحية المسؤول.');
      const prompt = input.prompt.trim().slice(0, 800);
      const answer = input.answer.trim().slice(0, 500);
      if (prompt.length < 3) throw new Error('نص السؤال قصير جدًا (3 أحرف على الأقل).');
      if (answer.length < 1) throw new Error('يرجى كتابة الإجابة الصحيحة.');

      const points: PointValue =
        input.difficulty === 'hard' ? 600 : input.difficulty === 'medium' ? 400 : 200;
      const id =
        input.id && VALID_ID_REGEX.test(input.id) ? input.id : makeSlugId('q_adm');
      const docPath = `catalogQuestions/${id}`;
      const ref = doc(db, 'catalogQuestions', id);

      const acceptableAnswers = (input.acceptableAnswers ?? [])
        .map((s) => s.trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, 10);
      const options = (input.options ?? [])
        .map((s) => s.trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, 6);
      const imageUrl = sanitizeSafeImageUrl(input.imageUrl);
      const hint = (input.hint ?? '').trim().slice(0, 300);
      const explanation = (input.explanation ?? '').trim().slice(0, 600);
      const imageCaption = (input.imageCaption ?? '').trim().slice(0, 200);
      const categoryName = input.categoryName.trim().slice(0, 80) || input.categoryId;

      const baseFields: Record<string, unknown> = {
        categoryId: input.categoryId,
        categoryName,
        difficulty: input.difficulty,
        points,
        questionType: input.questionType,
        prompt,
        answer,
        status: input.status ?? 'approved',
        isBackup: Boolean(input.isBackup),
        updatedAt: serverTimestamp(),
      };
      if (acceptableAnswers.length > 0) baseFields.acceptableAnswers = acceptableAnswers;
      if (options.length > 0) baseFields.options = options;
      if (
        typeof input.correctOptionIndex === 'number' &&
        input.correctOptionIndex >= 0 &&
        input.correctOptionIndex < options.length
      ) {
        baseFields.correctOptionIndex = input.correctOptionIndex;
      }
      if (hint) baseFields.hint = hint;
      if (explanation) baseFields.explanation = explanation;
      if (imageUrl) baseFields.imageUrl = imageUrl;
      if (imageCaption) baseFields.imageCaption = imageCaption;

      try {
        const existingSnap = await getDoc(ref);
        if (existingSnap.exists()) {
          await updateDoc(ref, baseFields);
        } else {
          await setDoc(ref, {
            ...baseFields,
            id,
            createdBy: user.uid,
            createdAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, docPath);
      }

      return {
        id,
        categoryId: input.categoryId,
        categoryName,
        difficulty: input.difficulty,
        points,
        questionType: input.questionType,
        prompt,
        answer,
        acceptableAnswers: acceptableAnswers.length ? acceptableAnswers : undefined,
        options: options.length ? options : undefined,
        correctOptionIndex:
          typeof input.correctOptionIndex === 'number' ? input.correctOptionIndex : undefined,
        hint: hint || undefined,
        explanation: explanation || undefined,
        imageUrl: imageUrl || undefined,
        imageCaption: imageCaption || undefined,
        isBackup: Boolean(input.isBackup),
        status: input.status ?? 'approved',
      };
    },
    [user, isAdmin],
  );

  const deleteAdminQuestion = useCallback(
    async (questionId: string) => {
      if (!user || !isAdmin) throw new Error('تتطلب هذه العملية صلاحية المسؤول.');
      const docPath = `catalogQuestions/${questionId}`;
      try {
        await deleteDoc(doc(db, 'catalogQuestions', questionId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, docPath);
      }
    },
    [user, isAdmin],
  );

  const bulkImportAdminQuestions = useCallback(
    async (items: AdminQuestionInput[]): Promise<number> => {
      if (!user || !isAdmin) throw new Error('تتطلب هذه العملية صلاحية المسؤول.');
      const validItems = items
        .filter((it) => it.prompt.trim().length >= 3 && it.answer.trim().length >= 1)
        .slice(0, 100);
      if (validItems.length === 0) return 0;

      const batch = writeBatch(db);
      for (let i = 0; i < validItems.length; i++) {
        const input = validItems[i];
        const id = `${makeSlugId('q_blk')}_${i}`;
        const points: PointValue =
          input.difficulty === 'hard' ? 600 : input.difficulty === 'medium' ? 400 : 200;
        const ref = doc(db, 'catalogQuestions', id);
        const payload: Record<string, unknown> = {
          id,
          categoryId: input.categoryId,
          categoryName: input.categoryName.trim().slice(0, 80) || input.categoryId,
          difficulty: input.difficulty,
          points,
          questionType: input.questionType || 'direct_qa',
          prompt: input.prompt.trim().slice(0, 800),
          answer: input.answer.trim().slice(0, 500),
          status: 'approved',
          isBackup: Boolean(input.isBackup),
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (input.hint?.trim()) payload.hint = input.hint.trim().slice(0, 300);
        if (input.explanation?.trim()) payload.explanation = input.explanation.trim().slice(0, 600);
        const img = sanitizeSafeImageUrl(input.imageUrl);
        if (img) payload.imageUrl = img;
        batch.set(ref, payload);
      }
      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'catalogQuestions');
      }
      return validItems.length;
    },
    [user, isAdmin],
  );

  const value = useMemo<AccountContextValue>(
    () => ({
      user,
      authReady,
      isAdmin,
      signingIn,
      authError,
      catalogLoaded,
      customCategories,
      customQuestions,
      allCategoriesForLobby,
      allCategoriesForAdmin,
      progressByCategory,
      totalPlayedCount,
      signInWithGoogle,
      signOutUser,
      clearAuthError,
      getCategoryStats,
      getPlayedMapForMatch,
      recordPlayedQuestion,
      resetCategoryProgress,
      saveAdminCategory,
      deleteAdminCategory,
      saveAdminQuestion,
      deleteAdminQuestion,
      bulkImportAdminQuestions,
    }),
    [
      user,
      authReady,
      isAdmin,
      signingIn,
      authError,
      catalogLoaded,
      customCategories,
      customQuestions,
      allCategoriesForLobby,
      allCategoriesForAdmin,
      progressByCategory,
      totalPlayedCount,
      signInWithGoogle,
      signOutUser,
      clearAuthError,
      getCategoryStats,
      getPlayedMapForMatch,
      recordPlayedQuestion,
      resetCategoryProgress,
      saveAdminCategory,
      deleteAdminCategory,
      saveAdminQuestion,
      deleteAdminQuestion,
      bulkImportAdminQuestions,
    ],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be used inside AccountProvider');
  return ctx;
}
