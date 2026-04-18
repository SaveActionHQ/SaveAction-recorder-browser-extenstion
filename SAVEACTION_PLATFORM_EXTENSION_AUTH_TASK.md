# SaveAction Platform Task: Browser Extension Account Login and Upload Support

This file is meant to be copied into the SaveAction platform AI agent.

## Copy/Paste Task For The Platform Agent

You are working in the SaveAction platform codebase. Implement the platform-side support required by the SaveAction browser extension's new account-based login flow.

The extension side is already implemented. Right now it fails because the platform does not have the required extension auth route. The current visible blocker is:

`POST /api/v1/extension-auth/sessions -> Route not found`

Do not switch the extension back to API keys. The platform now has organizations and projects, so the extension needs a real user session with org/project access, not a static token pasted into the popup.

## Why This Needs To Be Done

The browser extension was migrated from a single API-token model to an account-based session model.

The new extension flow is:

1. User enters the platform URL in the extension settings.
2. User clicks `Connect Account` in the extension popup.
3. The extension calls `POST /api/v1/extension-auth/sessions`.
4. The platform returns a pending connection payload with an `authorizeUrl` and `verificationCode`.
5. The extension opens `authorizeUrl` in a browser tab.
6. The user signs in on the platform if needed and approves the extension connection.
7. The extension polls the session status.
8. When approved, the platform returns account info plus access and refresh tokens.
9. The extension then loads organizations and projects from the platform.
10. When a recording is saved, the extension uploads it to the selected project with bearer-token auth.

Without this platform work, the extension can only save locally and cannot connect to organizations, choose a project, or upload recordings to the cloud.

## Important Constraints

1. Keep the existing web-app auth model if it is already sound. Reuse it. Do not build a second fragile auth system just for the extension.
2. Do not use cookies for extension API auth. The extension uses bearer tokens in the `Authorization` header.
3. Do not introduce long-lived manual API keys as the main solution.
4. Keep the implementation secure. Session IDs must be unguessable. Refresh tokens must be revocable and should be stored hashed if that is the platform standard.
5. Do not break existing organizations, projects, or recordings APIs if they already exist. If needed, add thin compatibility changes rather than rewriting unrelated systems.

## What Needs To Be Implemented

### 1. Extension Auth Session Endpoints

Implement these platform endpoints.

#### `POST /api/v1/extension-auth/sessions`

Purpose: start a pending extension login session.

Request body:

```json
{
  "source": "browser-extension"
}
```

Expected success response:

```json
{
  "success": true,
  "data": {
    "sessionId": "sess_abc123",
    "authorizeUrl": "https://app.saveaction.io/connect/sess_abc123",
    "verificationCode": "JOIN-1234",
    "expiresAt": "2026-04-18T12:45:00.000Z",
    "pollIntervalMs": 2000
  }
}
```

Notes:

- `sessionId`, `authorizeUrl`, `verificationCode`, and `expiresAt` are required.
- `pollIntervalMs` is optional but should normally be returned.
- The extension stores this as a pending connection and opens `authorizeUrl` in a new tab.
- The session should expire quickly. Around 5 to 15 minutes is reasonable.

#### `GET /api/v1/extension-auth/sessions/:sessionId`

Purpose: allow the extension to poll the pending session.

Expected responses:

Pending:

```json
{
  "success": true,
  "data": {
    "status": "pending"
  }
}
```

Approved:

```json
{
  "success": true,
  "data": {
    "status": "approved",
    "account": {
      "id": "user_123",
      "name": "QA Lead",
      "email": "qa@saveaction.io",
      "avatarUrl": null
    },
    "accessToken": "access_token_here",
    "refreshToken": "refresh_token_here",
    "accessTokenExpiresAt": "2026-04-18T13:15:00.000Z"
  }
}
```

Expired:

```json
{
  "success": true,
  "data": {
    "status": "expired"
  }
}
```

Notes:

- The extension expects `status` to be one of `pending`, `approved`, or `expired`.
- If the session is unknown or expired, returning `404` or `410` is also acceptable. The extension treats those as expired.
- If approved, the extension requires all of: `account`, `accessToken`, `refreshToken`, and `accessTokenExpiresAt`.
- `accessTokenExpiresAt` must be an ISO timestamp.
- Do not make the approved poll response so fragile that one transient failure breaks login forever. It should be safe for the extension to retry polling briefly.

#### `POST /api/v1/extension-auth/sessions/refresh`

Purpose: refresh the short-lived access token using the refresh token.

Request body:

```json
{
  "refreshToken": "refresh_token_here"
}
```

Expected success response:

```json
{
  "success": true,
  "data": {
    "accessToken": "new_access_token",
    "refreshToken": "new_refresh_token_or_same_token",
    "accessTokenExpiresAt": "2026-04-18T14:00:00.000Z"
  }
}
```

Notes:

- The extension refreshes when the access token is close to expiry.
- Returning a rotated refresh token is fine. Returning the same refresh token is also acceptable if that matches the current auth system.
- On refresh failure, return a proper error response so the extension can force reconnect.

#### `POST /api/v1/extension-auth/logout`

Purpose: revoke the extension session when the user disconnects from the popup.

Request headers:

- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

Request body:

```json
{
  "refreshToken": "refresh_token_here"
}
```

Notes:

- This can be best-effort on the platform side, but it should revoke the refresh token if possible.
- The extension clears local state even if this request fails.

### 2. Platform Approval UI For `authorizeUrl`

Implement the page behind `authorizeUrl`.

This page must:

1. Identify the pending extension session from the URL.
2. Require a logged-in platform user. If the user is not logged in, send them through the normal sign-in flow and then bring them back.
3. Show a clear approval screen such as `Connect SaveAction Browser Extension`.
4. Show the verification code so the user can confirm they are approving the right request.
5. Let the user approve or cancel the connection.
6. On approval, mark the session as approved and bind it to the logged-in user.
7. After approval, show a clear message like `You can return to the extension now.`

Important note:

- The extension does the organization and project selection later in its own popup.
- The approval page does not need to ask the user to choose an organization or project.
- The approval page only needs to authenticate the user and approve extension access for that account.

### 3. Bearer-Token Compatibility For Existing APIs

After login, the extension immediately loads organizations and projects. It then uploads recordings.

These routes must work with the extension-issued bearer tokens.

#### `GET /api/v1/organizations?limit=100`

Expected response:

```json
{
  "success": true,
  "data": [
    {
      "id": "org_1",
      "name": "Platform Team",
      "slug": "platform-team",
      "role": "owner",
      "projectCount": 4,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-04-18T00:00:00.000Z"
    }
  ]
}
```

Minimum required fields per organization:

- `id`
- `name`
- `slug`
- `role`

#### `GET /api/v1/projects?limit=100&organizationId=<orgId>`

Expected response:

```json
{
  "success": true,
  "data": [
    {
      "id": "proj_1",
      "name": "Checkout",
      "slug": "checkout",
      "description": null,
      "color": "#00bcd4",
      "isDefault": true,
      "organizationId": "org_1",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-04-18T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 100,
    "total": 1,
    "totalPages": 1
  }
}
```

Minimum required fields per project:

- `id`
- `name`
- `slug`
- `description`
- `color`
- `isDefault`
- `createdAt`
- `updatedAt`

Notes:

- Enforce membership and role access correctly.
- Only return organizations and projects the authenticated user is allowed to see.

#### `POST /api/v1/recordings`

Purpose: upload a recording into the selected project.

Request headers:

- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

Request body:

```json
{
  "name": "Checkout Flow",
  "tags": ["smoke", "checkout"],
  "projectId": "proj_1",
  "data": {
    "id": "rec_123456789",
    "testName": "Checkout Flow",
    "url": "https://example.com",
    "actions": []
  }
}
```

Expected success response:

```json
{
  "success": true,
  "data": {
    "id": "rec_uploaded_1",
    "name": "Checkout Flow",
    "url": "https://app.saveaction.io/recordings/rec_uploaded_1",
    "tags": ["smoke", "checkout"],
    "actionCount": 0,
    "createdAt": "2026-04-18T12:00:00.000Z"
  }
}
```

Status code expectations:

- `201` on success
- `400` for validation errors
- `401` when the session is expired or invalid
- `409` if the platform treats the upload as a duplicate
- `413` if the request is too large

Notes:

- The extension already handles all of those statuses.
- If upload fails, the extension falls back to a local download.
- Keep validation strict, but return a proper error message so the popup can display something useful.

### 4. Health Endpoint Compatibility

The extension settings screen checks platform reachability before login.

Make sure this works:

#### `GET /api/health`

Expected response:

```json
{
  "status": "ok"
}
```

If this route already exists, verify it still returns a simple success payload that the extension can consume.

### 5. Error Response Shape

For non-2xx responses, use this envelope consistently where practical:

```json
{
  "success": false,
  "error": {
    "code": "SOME_ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

The extension reads `error.message` and `error.code`.

### 6. CORS And Preflight Support For Browser Extensions

The extension calls the platform APIs directly from the browser extension runtime.

Make sure the platform accepts cross-origin requests from extension contexts.

This usually means:

1. Handle `OPTIONS` preflight correctly.
2. Allow `Authorization` and `Content-Type` headers.
3. Allow extension origins such as Chrome and Firefox extension origins, or use a safe wildcard strategy if your API policy allows it.
4. Do not require cookie-based auth for these API routes.

Be careful here. A lot of extension integrations fail because the backend rejects the extension origin or blocks the preflight.

### 7. Recommended Data Model And Security Behavior

Implement whatever data model fits the platform, but the behavior should be equivalent to this:

1. Create a short-lived `extension_auth_session` record with:
   - `sessionId`
   - `verificationCode`
   - `status`
   - `source`
   - `expiresAt`
   - `approvedByUserId`
   - `approvedAt`
   - `createdAt`
2. When the approval page is confirmed by a logged-in user, mark the session approved.
3. Issue or mint bearer tokens for API use.
4. Tie those tokens to the approved user.
5. Revoke or invalidate refresh tokens on logout.
6. Expire stale pending sessions automatically.

Security expectations:

- Session IDs must be high-entropy and unguessable.
- Verification codes should be short human-readable confirmation codes, not the secret itself.
- Do not leak session approval data to other users.
- Do not allow arbitrary org/project access just because the extension has a token.
- Reuse existing permission checks for organizations, projects, and recordings.

## What To Test

Add tests in the platform repo for at least these cases.

1. Start extension session returns a valid pending payload.
2. Poll returns `pending` before approval.
3. Approval flow binds the session to the authenticated user.
4. Poll returns `approved` with complete account and token data after approval.
5. Expired session returns `expired` or `404/410`.
6. Refresh endpoint returns a new valid access token.
7. Logout revokes the refresh token.
8. Organizations endpoint works with extension bearer tokens.
9. Projects endpoint works with extension bearer tokens and organization scoping.
10. Recording upload works with extension bearer tokens.
11. Unauthorized upload returns `401`.
12. Duplicate upload returns `409` if duplicate protection exists.
13. CORS preflight succeeds for the extension auth and upload routes.

## Definition Of Done

This task is done when all of the following are true.

1. The browser extension can click `Connect Account` without hitting `Route not found`.
2. The platform opens a valid approval page from `authorizeUrl`.
3. A signed-in user can approve the extension connection.
4. The extension receives account info and auth tokens from the poll endpoint.
5. The extension can fetch organizations.
6. The extension can fetch projects for the selected organization.
7. The extension can upload a recording to the selected project.
8. Refresh works when the access token expires.
9. Disconnect revokes the refresh token or otherwise invalidates the extension session.
10. All new platform code is covered by tests.

## Non-Goals

1. Do not reintroduce manual API-key entry as the primary flow.
2. Do not move org/project selection into the approval page.
3. Do not require cookies inside the extension popup.
4. Do not make insecure shortcuts just to get the demo working.

## Final Notes For Implementation

The extension side is already written around this contract, so the safest path is to implement the platform to match the contract above.

If the platform already has pieces of this, adapt them instead of duplicating logic. The main missing work is the extension-specific session handshake and making sure bearer-token access, org/project loading, upload, refresh, logout, and CORS all work cleanly together.
