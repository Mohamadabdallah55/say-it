# Firestore Security Specification

## Data Invariants
1. **Admin Authority**: Only verified administrators (`yazanmohaamed070@gmail.com` with `email_verified == true` or active controller accounts in `/admins/{uid}` with `isActive == true`) may create, update, or delete `/catalogCategories`, `/catalogQuestions`, and `/adminInvites`.
2. **Controller Activation via Invite**: A non-bootstrap verified user may create `/admins/{uid}` (`uid == request.auth.uid`) strictly when claiming an existing, active `/adminInvites/{inviteId}` whose normalized `email` matches `request.auth.token.email`.
3. **PII Isolation**: `/users/{userId}` and `/adminInvites/{inviteId}` hold email addresses and are readable only by the matching verified owner/invitee or an authorized admin. Non-admins cannot list other users' profiles or invites.
4. **Master Gate on Progress**: `/users/{userId}/categoryProgress/{categoryId}` cannot be written unless the parent `/users/{userId}` document exists and `request.auth.uid == userId`.
5. **Strict Keys & Types**: Every write validates required + allowed keys (`hasAll` + `hasOnly`), string `.size()` bounds, ID regex (`^[a-zA-Z0-9_\-]+$`), array bounds (`playedQuestionIds.size() <= 1000`), and server timestamps (`request.time`).
6. **No Self-Assigned Roles**: Users cannot add `role` or `isAdmin` fields to `/users/{userId}`, cannot set `isActive: true` on `/adminInvites`, and cannot write to `/admins/{uid}` without an active verified invite or bootstrap admin identity.

## Dirty Dozen Attack Payloads (Must All Be Rejected)
1. Unauthenticated write to `/catalogCategories/cat_hack`.
2. Non-admin verified user creating `/catalogCategories/cat_hack`.
3. Spoofed admin email with `email_verified: false` creating `/catalogQuestions/q_hack`.
4. Shadow field injection (`isAdmin: true`) on `/users/{uid}` creation.
5. Self-promotion by writing `/admins/{uid}` (`isActive: true`) without an active matching `/adminInvites/{inviteId}`.
6. Claiming a disabled invite (`isActive: false`) to create `/admins/{uid}`.
7. Invited user attempting to flip `isActive` or `email` on `/adminInvites/{inviteId}` (only `activatedUid` + `updatedAt` allowed for self-claim).
8. Cross-user profile read (`GET /users/otherUid` by signed-in non-admin).
9. Cross-user progress write (`CREATE /users/otherUid/categoryProgress/cat_science`).
10. Orphaned progress write before `/users/{uid}` exists.
11. Oversized ID poisoning (>128 chars) on `/catalogCategories/{longId}`.
12. Creating `/catalogQuestions/{id}` referencing a non-existent custom `categoryId`.
