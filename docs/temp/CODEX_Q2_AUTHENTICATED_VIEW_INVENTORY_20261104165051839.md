# Authenticated outbreak/forecast inventory

Inventory was communicated to the operator before implementation. No authenticated browser or API request was performed; current rendered private values remain NOT VERIFIED.

- Admin overview /admin/dashboard: Dashboard.jsx:633–645 reads /admin/stats and /alerts/active; :562 renders the shared GeographicMap. AlertController.getActiveAlerts reads policy-qualified Mongo alerts, not ML tracking SQLite. Therefore an empty ML SQLite does not erase persisted eligible zones. With no eligible Active alerts, no outbreak circles render; actual Mongo alert count is unobserved. No forecast widget is implemented here.
- Admin Outbreak Monitor /admin/dashboard/outbreak: OutbreakMonitor.jsx:76–85 reads /admin/ml-status and /alerts/active. The analysis chart appears only after the manual trigger handler; no trigger was run. Model-status reference profiles are independent of the tracking table. Existing client reads response.data.data while adminController.getMLStatus returns top-level fields; fallback15420 can therefore be displayed. This is an existing source contract defect, not an observed live count. Leave unchanged as directed.
- Doctor, patient, hospital and pharmacy dashboards render ActiveOutbreakBanner; it requests /alerts/broadcasts/latest. Current alertController.getLatestBroadcast returns data:null as an intentional delivery gate, so no broadcast banner is returned. No outbreak map or forecast view was found in these role pages.
- All client forecast render sites found by source inventory were in public/PublicHealth.jsx, not authenticated dashboards. New public activity does not modify the shared admin map, alert endpoints, internal surveillance, roles or broadcasting.

Clinical review is deferred in docs/FUTURE_FEATURES.md. No record edit, login, model analysis, provider delivery, cache clear or ML ingestion was performed for this inventory.
