# Countdown — Claude Rules

## 67numbers vs 67words are separate products

They share one server but have distinct admin UIs, data models, and jobs. Never bleed one's logic into the other.

**67numbers admin** (`client/src/components/Admin.tsx`): only 67numbers jobs + shared jobs (check-names, delete-dummy-data).
**67words admin** (`words-client/src/components/Admin.tsx`): only 67words jobs + shared jobs (check-names, delete-dummy-data).

When adding a job to an admin UI, stop and ask: does this job belong to THIS app? If it's the other app's job, it does not go here. Do not copy job lists from one admin to the other without filtering.
