export interface ControllerInviteRecord {
  id: string;
  email: string;
  label: string;
  isActive: boolean;
  activatedUid?: string;
  invitedBy: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface AdminRecordSummary {
  uid: string;
  email: string;
  label?: string;
  role: 'bootstrap_admin' | 'controller';
  isActive: boolean;
  inviteId?: string;
}

export function normalizeControllerEmail(raw: string): string {
  return (raw || '').trim().toLowerCase();
}

export function isValidControllerEmail(raw: string): boolean {
  const email = normalizeControllerEmail(raw);
  if (email.length < 5 || email.length > 200) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/**
 * Generates a deterministic Firestore-safe document ID matching ^[a-zA-Z0-9_-]+$
 * for an email address (bounded <= 128 chars).
 */
export function makeControllerInviteId(rawEmail: string): string {
  const email = normalizeControllerEmail(rawEmail);
  let hash = 2166136261;
  for (let i = 0; i < email.length; i += 1) {
    hash ^= email.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hexHash = (hash >>> 0).toString(16).padStart(8, '0');
  const slug = email
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72);
  return `ctrl_${slug || 'account'}_${hexHash}`.slice(0, 128);
}

export function resolveControllerAccessState(params: {
  email?: string | null;
  emailVerified?: boolean;
  bootstrapEmail: string;
  adminRecord?: { isActive?: boolean; role?: string } | null;
  matchingInvite?: { isActive?: boolean } | null;
}): {
  isBootstrap: boolean;
  hasActiveAdminRecord: boolean;
  canAutoClaimInvite: boolean;
  isControllerActive: boolean;
} {
  const email = normalizeControllerEmail(params.email || '');
  const bootstrap = normalizeControllerEmail(params.bootstrapEmail);
  const verified = Boolean(params.emailVerified);
  const isBootstrap = Boolean(verified && email && email === bootstrap);
  const hasActiveAdminRecord = Boolean(
    verified && params.adminRecord && params.adminRecord.isActive !== false,
  );
  const hasExplicitlyDisabledRecord = Boolean(
    params.adminRecord && params.adminRecord.isActive === false,
  );
  const canAutoClaimInvite = Boolean(
    verified &&
      !isBootstrap &&
      params.matchingInvite?.isActive === true &&
      (!params.adminRecord || hasExplicitlyDisabledRecord),
  );
  const isControllerActive =
    isBootstrap || hasActiveAdminRecord || Boolean(verified && params.matchingInvite?.isActive === true);

  return {
    isBootstrap,
    hasActiveAdminRecord,
    canAutoClaimInvite,
    isControllerActive,
  };
}

export function formatFirebaseAuthError(err: unknown, currentHostname?: string): string | null {
  const code = (err as { code?: string })?.code || '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return null;
  }
  if (code === 'auth/popup-blocked') {
    return 'المتصفح منع نافذة تسجيل الدخول المنبثقة. يرجى السماح بالنوافذ المنبثقة لهذا الموقع ثم إعادة الضغط على «دخول جوجل».';
  }
  if (code === 'auth/unauthorized-domain') {
    const hostHint = currentHostname ? ` (${currentHostname})` : '';
    return `هذا النطاق${hostHint} غير مضاف في قائمة النطاقات المصرح بها (Authorized domains) داخل إعدادات Firebase Authentication.`;
  }
  if (code === 'auth/operation-not-allowed') {
    return 'مزوّد تسجيل الدخول عبر Google غير مفعّل حاليًا في مشروع Firebase (Sign-in method).';
  }
  if (code === 'auth/network-request-failed') {
    return 'تعذر الاتصال بخوادم Google حاليًا. تحقق من اتصال الإنترنت أو مانع الإعلانات وحاول مرة أخرى.';
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return 'هذا البريد الإلكتروني مسجّل مسبقًا بطريقة تسجيل دخول أخرى.';
  }
  if (code === 'auth/user-disabled') {
    return 'تم تعطيل هذا الحساب في إعدادات المصادقة.';
  }
  if (code) {
    return `تعذر إتمام تسجيل الدخول بحساب Google (${code}). حاول مرة أخرى.`;
  }
  return 'تعذر إتمام تسجيل الدخول بجوجل حاليًا. حاول مرة أخرى.';
}
