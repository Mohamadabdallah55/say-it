import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatFirebaseAuthError,
  isValidControllerEmail,
  makeControllerInviteId,
  normalizeControllerEmail,
  resolveControllerAccessState,
} from './adminControllers';

test('normalizeControllerEmail and isValidControllerEmail validate emails strictly', () => {
  assert.equal(normalizeControllerEmail('  YaZanMohaamed070@GMAIL.com '), 'yazanmohaamed070@gmail.com');
  assert.equal(isValidControllerEmail('yazanmohaamed070@gmail.com'), true);
  assert.equal(isValidControllerEmail('not-an-email'), false);
  assert.equal(isValidControllerEmail('bad@domain'), false);
});

test('makeControllerInviteId produces deterministic IDs matching Firestore rule regex', () => {
  const id1 = makeControllerInviteId('Teacher.One+quiz@gmail.com');
  const id2 = makeControllerInviteId('  teacher.one+quiz@gmail.com ');
  assert.equal(id1, id2);
  assert.match(id1, /^[a-zA-Z0-9_-]{2,128}$/);
  assert.notEqual(
    makeControllerInviteId('a.b@gmail.com'),
    makeControllerInviteId('a_b@gmail.com'),
  );
});

test('resolveControllerAccessState grants bootstrap admin and handles active/disabled invites', () => {
  const bootstrap = resolveControllerAccessState({
    email: 'YazanMohaamed070@gmail.com',
    emailVerified: true,
    bootstrapEmail: 'yazanmohaamed070@gmail.com',
  });
  assert.equal(bootstrap.isBootstrap, true);
  assert.equal(bootstrap.isControllerActive, true);

  const unverifiedSpoof = resolveControllerAccessState({
    email: 'yazanmohaamed070@gmail.com',
    emailVerified: false,
    bootstrapEmail: 'yazanmohaamed070@gmail.com',
  });
  assert.equal(unverifiedSpoof.isBootstrap, false);
  assert.equal(unverifiedSpoof.isControllerActive, false);

  const pendingInvite = resolveControllerAccessState({
    email: 'cohost@gmail.com',
    emailVerified: true,
    bootstrapEmail: 'yazanmohaamed070@gmail.com',
    adminRecord: null,
    matchingInvite: { isActive: true },
  });
  assert.equal(pendingInvite.canAutoClaimInvite, true);
  assert.equal(pendingInvite.isControllerActive, true);

  const disabledController = resolveControllerAccessState({
    email: 'cohost@gmail.com',
    emailVerified: true,
    bootstrapEmail: 'yazanmohaamed070@gmail.com',
    adminRecord: { isActive: false, role: 'controller' },
    matchingInvite: { isActive: false },
  });
  assert.equal(disabledController.canAutoClaimInvite, false);
  assert.equal(disabledController.isControllerActive, false);
});

test('formatFirebaseAuthError maps common Google Auth errors cleanly and hides user cancel', () => {
  assert.equal(formatFirebaseAuthError({ code: 'auth/popup-closed-by-user' }), null);
  assert.match(
    formatFirebaseAuthError({ code: 'auth/unauthorized-domain' }, 'say-it.onrender.com') || '',
    /say-it\.onrender\.com/,
  );
  assert.match(
    formatFirebaseAuthError({ code: 'auth/operation-not-allowed' }) || '',
    /Google/,
  );
  assert.match(
    formatFirebaseAuthError({ code: 'auth/popup-blocked' }) || '',
    /منبثقة/,
  );
});
