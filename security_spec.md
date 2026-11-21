# Firestore Security Specification

## Data Invariants
1. **Admin Authority**: Only verified administrators (`emanzabbout@gmail.com` with `email_verified == true` or registered in `/admins/{uid}`) may create, update, or delete `/catalogCategories` and `/catalogQuestions`.
2. **PII Isolation**: `/users/{userId}` holds email/profile fields and is readable/writable strictly by the owning verified user (`request.auth.uid == userId`) or a verified admin. Non-owners cannot read or list other user profiles.
3. **Master Gate on Progress**: `/users/{userId}/categoryProgress/{categoryId}` cannot be written unless the parent `/users/{userId}` document exists and `request.auth.uid == userId`.
4. **Strict Keys & Types**: Every write validates required + allowed keys (`hasAll` + `hasOnly`), string `.size()` bounds, ID regex (`^[a-zA-Z0-9_\-]+$`), array bounds (`playedQuestionIds.size() <= 1000`), and server timestamps (`request.time`).
5. **No Self-Assigned Roles**: Users cannot add `role` or `isAdmin` fields to `/users/{userId}` and cannot write to `/admins/{uid}` unless they are the verified bootstrap admin.

## Dirty Dozen Attack Payloads (Must All Be Rejected)
1. Unauthenticated write to `/catalogCategories/cat_hack`.
2. Non-admin verified user creating `/catalogCategories/cat_hack`.
3. Spoofed admin email with `email_verified: false` creating `/catalogQuestions/q_hack`.
4. Shadow field injection (`isAdmin: true`) on `/users/{uid}` creation.
5. Cross-user profile read (`GET /users/otherUid` by signed-in non-admin).
6. Cross-user progress write (`CREATE /users/otherUid/categoryProgress/cat_science`).
7. Orphaned progress write before `/users/{uid}` exists.
8. Oversized ID poisoning (>128 chars) on `/catalogCategories/{longId}`.
9. Forged client `createdAt` timestamp (not equal to `request.time`).
10. Modifying immutable `createdAt` or `userId` during `/users/{uid}/categoryProgress/{catId}` update.
11. Unbounded array write (`playedQuestionIds` with >1000 entries or non-string first element).
12. Creating `/catalogQuestions/{id}` referencing a non-existent custom `categoryId`.
