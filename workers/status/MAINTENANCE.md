# Scheduled Maintenance Windows

This document serves as the declarative configuration source for planned maintenance windows across the Montage Subtitle Translator infrastructure.
The status monitoring worker continuously reads this table via GitHub Raw to proactively broadcast upcoming maintenance advisories, dynamically switch services into maintenance mode during scheduled execution windows, and automatically append incident timeline entries upon completion.

## Active & Upcoming Maintenance Schedule

| id                         | component_id     | title                                   | start_utc            | end_utc              | severity | description                                                                                                                        |
| :------------------------- | :--------------- | :-------------------------------------- | :------------------- | :------------------- | :------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| maint-storage-opt-20260905 | upstream_storage | Database Storage Partition Optimization | 2026-09-05T04:20:00Z | 2026-09-05T06:10:00Z | minor    | Routine database storage partition index optimization and secondary vacuuming. Subtitle translation throughput remains unaffected. |

## Instructions for Maintainers

1. **Adding Maintenance**: Append a new row to the table above with valid ISO 8601 UTC timestamps (e.g. `2026-09-05T04:20:00Z`).
2. **Component ID Mapping**: Use IDs defined in the system status blueprint (`service_availability`, `core_infrastructure`, `status_system`, `google_pa`, `google_v2`, `microsoft_translator`, `deepl_api`, `upstream_cloudflare`, `upstream_github`, `upstream_google`, `upstream_azure`, `upstream_storage`).
3. **Extending Windows**: If a maintenance window takes longer than anticipated, modify `end_utc` in this file. The next hourly status worker cycle will automatically pick up the extended deadline and keep the maintenance state active.
