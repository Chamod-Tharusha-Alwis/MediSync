# MediSync owner runbook for the live QA repair candidate

Use a reviewed checkout on Node 24. The scripts target the existing production database through the production URI and exact-role guard. Keep the URI in the PowerShell session. Use an idle maintenance window for each confirmed command. Use the synthetic fixtures in isolated QA for dashboard rehearsals. The production login guard deliberately excludes those fixtures.

1. Check the candidate locally.

   ```powershell
   node --version
   git status --short
   git rev-parse HEAD
   node scripts/run_offline_tests.js
   node scripts/audit_ui_translations.js
   ```

   Expect Node 24 for release CI, 15 verified protected hashes, and exact locale key parity. Check the receipt for failures, skipped cases and the source fingerprint.

2. Prepare the private connection in a new PowerShell window, using a reviewed clean checkout. Set `NODE_ENV=production`. Set `MONGO_URI` in this process only with masked input. The role must be exactly `readWrite@medisync_prod`.

   ```powershell
   $env:NODE_ENV = 'production'
   if (Test-Path Env:MONGO_URI_TEST) { throw 'Open a session without the QA URI alias' }
   $vivaUriInput = Read-Host 'Existing production URI' -AsSecureString
   $env:MONGO_URI = [System.Net.NetworkCredential]::new('', $vivaUriInput).Password
   $vivaUriInput.Dispose()
   node scripts/seed-viva-data.js --verify
   ```

3. Review the stock plan, then confirm it once.

   ```powershell
   node scripts/seed_viva_pharmacy_stock.js --dry-run
   # Review the exact batch and counts before running the next command.
   node scripts/seed_viva_pharmacy_stock.js --confirm
   node scripts/seed_viva_pharmacy_stock.js --dry-run
   ```

   Expect `VIVA_STOCK_DRY_RUN`, then `VIVA_STOCK_APPLIED`, with pharmacy and stock entry counts. A subsequent dry-run should show zero entries to append. Existing stock quantities are preserved. The transaction appends embedded items and tracks their IDs in the batch manifest. Stop on any nonzero exit. On `VIVA_COMMIT_UNVERIFIED_DO_NOT_RETRY`, reconcile the existing manifest and stock before taking further action.

4. Mint one QR verification capability for a manifest-tracked consultation.

   ```powershell
   $vivaConsultationId = Read-Host 'Private manifest consultation ObjectId'
   node scripts/mint_demo_verification_link.js "--consultation=$vivaConsultationId" --dry-run
   # Review the counts before running the next command.
   node scripts/mint_demo_verification_link.js "--consultation=$vivaConsultationId" --confirm
   Remove-Variable vivaConsultationId
   ```

   Expect `VIVA_TOKEN_DRY_RUN` with mintCount 1, followed by `VIVA_TOKEN_MINTED` and one private URL. Use `--revoke-previous` on both invocations if replacing the latest token minted by this tool for the same encounter. The previous token is eligible only if tracked and explicitly marked as minted by the tool. Keep terminal transcripts and screen sharing off for the confirmed command. The token expires after 24 hours.

5. Read back the tracked population using the repaired verification entry point.

   ```powershell
   node scripts/seed-viva-data.js --verify
   ```

   Expect `VIVA_VERIFY_COUNTS` with tracked and present counts by collection. The command reads only manifest-owned IDs with matching batch markers. QA-created encounters are outside those counts. Dispensing and review can change state without changing tracked document counts. Expired verification links can lower the present count.

6. Check the frontend export configuration separately. The operator reported `PDF_EXPORT_ENABLED=true` on the server. If export is approved despite F05, open the existing `medi-sync` Vercel project, go to Settings → Environment Variables, set `REACT_APP_PDF_EXPORT_ENABLED` to `true` for Production and rebuild the reviewed revision. The hospital stored-report action uses the authenticated server endpoint and the server flag.

7. Close the session and clear the URI.

   ```powershell
   Remove-Item Env:MONGO_URI
   ```
